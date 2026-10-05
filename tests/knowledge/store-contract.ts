import { beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeStore, NewDocumentInput } from "../../src/knowledge/store";

/**
 * ONE behavioural contract for KnowledgeStore, run against BOTH
 * implementations (InMemoryKnowledgeStore in tests/knowledge, the
 * Drizzle/Postgres store in tests/db). If the two ever diverge, this is
 * where it shows.
 */
export interface StoreHarness {
  store: KnowledgeStore;
  tenantA: string;
  tenantB: string;
  /** A conversation id belonging to tenantA, for retrieval-log tests. */
  conversationA?: string;
}

const chunk = (ordinal: number, content: string, extra: Partial<NewDocumentInput["chunks"][number]> = {}) => ({
  ordinal,
  section: null,
  content,
  contentHash: `h${ordinal}${content.length}`,
  claims: [],
  flaggedInjection: false,
  embedding: null,
  embeddingModel: null,
  ...extra,
});

export function describeKnowledgeStoreContract(name: string, setup: () => Promise<StoreHarness>) {
  describe(`KnowledgeStore contract — ${name}`, () => {
    let h: StoreHarness;
    beforeEach(async () => {
      h = await setup();
    });

    async function doc(tenantId: string, docKey: string, over: Partial<NewDocumentInput> = {}) {
      const source = await h.store.findOrCreateSource({ tenantId, kind: "manual", title: "S" });
      return h.store.insertDocument({
        tenantId, sourceId: source.id, docKey, title: docKey, docType: "faq", status: "pending_review", authority: "human_approved",
        body: `body of ${docKey}`, contentHash: `hash-${docKey}-${Math.random()}`, effectiveAt: null, expiresAt: null, metadata: {},
        chunks: [chunk(0, `Content of ${docKey}`, { embedding: [0.5, 0.25], embeddingModel: "m1", claims: [{ subject: "s", attribute: "a", value: "1", display: "1" }] })],
        ...over,
      });
    }

    it("findOrCreateSource is idempotent per (tenant, kind, title, origin)", async () => {
      const a = await h.store.findOrCreateSource({ tenantId: h.tenantA, kind: "manual", title: "S" });
      const b = await h.store.findOrCreateSource({ tenantId: h.tenantA, kind: "manual", title: "S" });
      const c = await h.store.findOrCreateSource({ tenantId: h.tenantB, kind: "manual", title: "S" });
      expect(b.id).toBe(a.id);
      expect(c.id).not.toBe(a.id);
    });

    it("assigns increasing versions per (tenant, docKey) and round-trips every field", async () => {
      const v1 = await doc(h.tenantA, "k", { effectiveAt: new Date("2026-01-01T00:00:00Z"), expiresAt: new Date("2027-01-01T00:00:00Z"), metadata: { note: "x" } });
      const v2 = await doc(h.tenantA, "k");
      const other = await doc(h.tenantB, "k");
      expect([v1.version, v2.version, other.version]).toEqual([1, 2, 1]);
      const fetched = await h.store.getDocument(h.tenantA, v1.id);
      expect(fetched).toMatchObject({
        docKey: "k", version: 1, status: "pending_review", authority: "human_approved", chunkCount: 1, metadata: { note: "x" },
        effectiveAt: new Date("2026-01-01T00:00:00Z"), expiresAt: new Date("2027-01-01T00:00:00Z"),
      });
      expect((await h.store.findLatestDocument(h.tenantA, "k"))?.id).toBe(v2.id);
    });

    it("approve supersedes the previously approved sibling atomically; at most one approved per key", async () => {
      const v1 = await doc(h.tenantA, "k");
      await h.store.approveDocument(h.tenantA, v1.id, "alice", new Date());
      const v2 = await doc(h.tenantA, "k");
      const r = await h.store.approveDocument(h.tenantA, v2.id, "bob", new Date());
      expect(r.document).toMatchObject({ status: "approved", approvedBy: "bob" });
      expect(r.superseded.map((d) => d.id)).toEqual([v1.id]);
      const all = await h.store.listDocuments(h.tenantA);
      expect(all.filter((d) => d.status === "approved").map((d) => d.id)).toEqual([v2.id]);
      expect((await h.store.getDocument(h.tenantA, v1.id))?.status).toBe("superseded");
      expect((await h.store.getDocument(h.tenantA, v1.id))?.supersededByDocumentId).toBe(v2.id);
    });

    it("an 'unreviewed' document can never be approved", async () => {
      const d = await doc(h.tenantA, "k", { authority: "unreviewed", status: "draft" });
      await expect(h.store.approveDocument(h.tenantA, d.id, "x", new Date())).rejects.toThrow(/unreviewed/);
    });

    it("listEligibleChunks: only approved, servable, in-date documents — and only for THIS tenant", async () => {
      const now = new Date("2026-06-01T00:00:00Z");
      const pending = await doc(h.tenantA, "pending");
      const approved = await doc(h.tenantA, "approved");
      await h.store.approveDocument(h.tenantA, approved.id, "r", now);
      const expired = await doc(h.tenantA, "expired", { expiresAt: new Date("2026-05-01T00:00:00Z") });
      await h.store.approveDocument(h.tenantA, expired.id, "r", now);
      const future = await doc(h.tenantA, "future", { effectiveAt: new Date("2026-07-01T00:00:00Z") });
      await h.store.approveDocument(h.tenantA, future.id, "r", now);
      const rejected = await doc(h.tenantA, "rejected");
      await h.store.setDocumentStatus(h.tenantA, rejected.id, "rejected");
      const bDoc = await doc(h.tenantB, "b-approved");
      await h.store.approveDocument(h.tenantB, bDoc.id, "r", now);

      const a = await h.store.listEligibleChunks(h.tenantA, now);
      expect(a.map((c) => c.documentKey)).toEqual(["approved"]);
      expect(a[0]).toMatchObject({ tenantId: h.tenantA, documentVersion: 1, authority: "human_approved", docType: "faq" });
      expect(a[0].claims).toEqual([{ subject: "s", attribute: "a", value: "1", display: "1" }]);
      expect(a[0].embedding?.map((x) => Math.round(x * 100) / 100)).toEqual([0.5, 0.25]);
      expect(a[0].embeddingModel).toBe("m1");
      expect((await h.store.listEligibleChunks(h.tenantB, now)).map((c) => c.documentKey)).toEqual(["b-approved"]);
      expect(pending.status).toBe("pending_review");
    });

    it("another tenant's documents are invisible and immutable", async () => {
      const d = await doc(h.tenantA, "k");
      expect(await h.store.getDocument(h.tenantB, d.id)).toBeNull();
      await expect(h.store.approveDocument(h.tenantB, d.id, "x", new Date())).rejects.toThrow(/for this tenant/);
      await expect(h.store.setDocumentStatus(h.tenantB, d.id, "archived")).rejects.toThrow(/for this tenant/);
      expect(await h.store.listDocuments(h.tenantB)).toEqual([]);
    });

    it("listDocuments filters by status", async () => {
      const a = await doc(h.tenantA, "a");
      await doc(h.tenantA, "b");
      await h.store.approveDocument(h.tenantA, a.id, "r", new Date());
      expect((await h.store.listDocuments(h.tenantA, { status: "approved" })).map((d) => d.docKey)).toEqual(["a"]);
      expect((await h.store.listDocuments(h.tenantA, { status: "pending_review" })).map((d) => d.docKey)).toEqual(["b"]);
    });

    it("conflicts: upsert is idempotent per signature, counts detections, can be resolved and auto-closed", async () => {
      const base = { tenantId: h.tenantA, subject: "service:x", attribute: "price", signature: "sig1", resolution: "needs_confirmation" as const, detail: { v: 1 }, now: new Date("2026-06-01T00:00:00Z") };
      const first = await h.store.upsertConflict(base);
      const again = await h.store.upsertConflict({ ...base, now: new Date("2026-06-02T00:00:00Z") });
      expect(again.id).toBe(first.id);
      expect(again.detectionCount).toBe(2);
      expect(again.lastDetectedAt).toEqual(new Date("2026-06-02T00:00:00Z"));
      await h.store.upsertConflict({ ...base, signature: "sig2" });
      expect(await h.store.listConflicts(h.tenantA, "open")).toHaveLength(2);
      expect(await h.store.listConflicts(h.tenantB)).toEqual([]);

      const closed = await h.store.closeStaleConflicts(h.tenantA, new Set(["sig2"]), new Date());
      expect(closed).toBe(1);
      expect((await h.store.listConflicts(h.tenantA, "open")).map((c) => c.signature)).toEqual(["sig2"]);

      const dismissed = await h.store.resolveConflict(h.tenantA, first.id, "dismissed", "alice", new Date());
      expect(dismissed).toMatchObject({ status: "dismissed", resolvedBy: "alice" });
      await expect(h.store.resolveConflict(h.tenantB, first.id, "resolved", "x", new Date())).rejects.toThrow(/for this tenant/);
    });

    it("retrieval logs: stored, tenant-scoped, newest first, limited", async () => {
      const mk = (q: string) => ({
        tenantId: h.tenantA, conversationId: h.conversationA, outcome: "grounded" as const, queryRedacted: q, topScore: 0.9, embeddingModel: "m1",
        evidence: [{ ref: "E1", origin: "document" as const, authority: "human_approved" as const, documentKey: "k", documentTitle: "K", documentVersion: 1, chunkId: null, section: null, score: 0.9, snippet: "snip" }],
        conflicts: [],
      });
      await h.store.recordRetrieval(mk("first"));
      await new Promise((r) => setTimeout(r, 5));
      await h.store.recordRetrieval(mk("second"));
      const logs = await h.store.listRetrievals(h.tenantA, h.conversationA ? { conversationId: h.conversationA } : undefined);
      expect(logs.map((l) => l.queryRedacted)).toEqual(["second", "first"]);
      expect(logs[0].evidence[0]).toMatchObject({ documentKey: "k", snippet: "snip" });
      expect(await h.store.listRetrievals(h.tenantB)).toEqual([]);
      expect(await h.store.listRetrievals(h.tenantA, { limit: 1 })).toHaveLength(1);
    });
  });
}
