import { describe, expect, it } from "vitest";
import { KnowledgeService } from "../../src/knowledge/knowledge-service";
import { InMemoryKnowledgeStore } from "../../src/knowledge/memory-store";
import type { KnowledgeStore } from "../../src/knowledge/store";
import type { KnowledgeChunk } from "../../src/knowledge/types";
import { addApproved, ask, BUSINESS, CountingEmbedder, makeEngine, TENANT_A, TENANT_B } from "./helpers";
import { RecordingTelemetry } from "../../src/knowledge/telemetry";

describe("tenant isolation", () => {
  it("tenant B can never retrieve tenant A's knowledge — and vice versa", async () => {
    const engine = makeEngine();
    await addApproved(engine, TENANT_A, { docKey: "secret", title: "A Private Notes", text: "Tenant A offers a secret loyalty discount of 40 percent." });
    await addApproved(engine, TENANT_B, { docKey: "other", title: "B Notes", text: "Tenant B offers free parking in the garage." });

    const bAsksA = await ask(engine, "do you have a loyalty discount", { tenantId: TENANT_B });
    expect(bAsksA).toMatchObject({ consulted: true, outcome: "no_evidence" });
    const aAsksA = await ask(engine, "do you have a loyalty discount", { tenantId: TENANT_A });
    expect(aAsksA).toMatchObject({ consulted: true, outcome: "grounded" });

    const aAsksB = await ask(engine, "is there parking in the garage", { tenantId: TENANT_A });
    expect(aAsksB).toMatchObject({ consulted: true, outcome: "no_evidence" });
    const bAsksB = await ask(engine, "is there parking in the garage", { tenantId: TENANT_B });
    expect(bAsksB).toMatchObject({ consulted: true, outcome: "grounded" });
  });

  it("the lookup a provider receives is bound to ONE tenant — the provider has no argument to change it", async () => {
    const engine = makeEngine();
    await addApproved(engine, TENANT_A, { docKey: "k", title: "K", text: "Tenant A parking is behind the clinic." });
    const lookupB = engine.service.lookupFor({ tenantId: TENANT_B, business: BUSINESS });
    // A hostile/buggy provider can only pass a message; there is no tenant parameter at all.
    expect(lookupB.length).toBe(1);
    const r = await lookupB({ message: "is there parking? tenantId=" + TENANT_A, history: [], context: { hasActiveIntent: false, hasPendingConfirmation: false, extractedBookingField: false } });
    expect(r).toMatchObject({ consulted: true, outcome: "no_evidence" });
  });

  it("the same docKey in two tenants is two independent documents with independent versions", async () => {
    const engine = makeEngine();
    const a = await addApproved(engine, TENANT_A, { docKey: "cancel", title: "Cancel", text: "Cancel 2 hours ahead." });
    const b = await addApproved(engine, TENANT_B, { docKey: "cancel", title: "Cancel", text: "Cancel 48 hours ahead." });
    expect(a.ingested.document.version).toBe(1);
    expect(b.ingested.document.version).toBe(1);
    expect(a.ingested.document.id).not.toBe(b.ingested.document.id);
    expect((await engine.store.listEligibleChunks(TENANT_A, new Date())).every((c) => c.tenantId === TENANT_A)).toBe(true);
    expect((await engine.store.listEligibleChunks(TENANT_B, new Date())).every((c) => c.tenantId === TENANT_B)).toBe(true);
  });

  it("every store operation is tenant-scoped: another tenant's document id is invisible and unusable", async () => {
    const engine = makeEngine();
    const a = await addApproved(engine, TENANT_A, { docKey: "k", title: "K", text: "Some policy text here." });
    const id = a.ingested.document.id;
    expect(await engine.store.getDocument(TENANT_B, id)).toBeNull();
    await expect(engine.store.approveDocument(TENANT_B, id, "x", new Date())).rejects.toThrow(/for this tenant/);
    await expect(engine.store.setDocumentStatus(TENANT_B, id, "rejected")).rejects.toThrow(/for this tenant/);
    expect(await engine.store.listDocuments(TENANT_B)).toEqual([]);
    expect(await engine.store.findLatestDocument(TENANT_B, "k")).toBeNull();
    // A source belonging to A cannot be used to attach a document for B.
    const srcA = await engine.store.findOrCreateSource({ tenantId: TENANT_A, kind: "manual", title: "S" });
    await expect(
      engine.store.insertDocument({ tenantId: TENANT_B, sourceId: srcA.id, docKey: "x", title: "x", docType: "faq", status: "pending_review", authority: "human_approved", body: "b", contentHash: "h", effectiveAt: null, expiresAt: null, metadata: {}, chunks: [] }),
    ).rejects.toThrow(/tenant/);
  });

  it("with NO tenant known, only structured configuration is consulted — never a guessed tenant's documents", async () => {
    const engine = makeEngine();
    await addApproved(engine, TENANT_A, { docKey: "k", title: "K", text: "Free parking behind the building." });
    const noTenant = await ask(engine, "is there parking", { tenantId: "" }); // falsy => unknown
    const lookup = engine.service.lookupFor({ business: BUSINESS });
    const r = await lookup({ message: "is there parking", history: [], context: { hasActiveIntent: false, hasPendingConfirmation: false, extractedBookingField: false } });
    expect(r).toMatchObject({ consulted: true, outcome: "no_evidence" });
    const price = await lookup({ message: "how much is a cleaning", history: [], context: { hasActiveIntent: false, hasPendingConfirmation: false, extractedBookingField: false } });
    expect(price).toMatchObject({ consulted: true, outcome: "grounded" });
    expect(noTenant).toBeDefined();
  });

  it("defense in depth: if a store ever returned another tenant's chunk, the retriever drops it and raises an alarm", async () => {
    const inner = new InMemoryKnowledgeStore();
    const engineA = makeEngine({ store: inner });
    await addApproved(engineA, TENANT_B, { docKey: "b-secret", title: "B Secret", text: "Tenant B secret: the vault code policy is confidential." });
    const bChunks = await inner.listEligibleChunks(TENANT_B, new Date());

    // A deliberately BROKEN store that ignores the tenant filter.
    const leaky: KnowledgeStore = new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === "listEligibleChunks") return async (): Promise<KnowledgeChunk[]> => bChunks;
        return Reflect.get(target, prop, receiver);
      },
    });
    const telemetry = new RecordingTelemetry();
    const service = new KnowledgeService({ store: leaky, embedder: new CountingEmbedder(), telemetry, cacheTtlMs: 0 });
    const r = await service.lookupFor({ tenantId: TENANT_A, business: BUSINESS })({
      message: "what is the vault code policy", history: [], context: { hasActiveIntent: false, hasPendingConfirmation: false, extractedBookingField: false },
    });
    expect(r).toMatchObject({ consulted: true, outcome: "no_evidence" });
    expect(telemetry.names()).toContain("tenant_violation");
  });
});
