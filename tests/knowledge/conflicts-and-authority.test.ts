import { describe, expect, it } from "vitest";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { analyzeConflicts, conflictSignature, type ClaimSource } from "../../src/knowledge/conflicts";
import { addApproved, ask, BUSINESS, BUSINESS_NO_ROOT_CANAL_PRICE, makeEngine, request, say, ScriptedLlm, seededEngine, TENANT_A } from "./helpers";

describe("authority hierarchy: structured configuration outranks documents", () => {
  it("a document that disagrees with configured pricing cannot make the receptionist quote it", async () => {
    const engine = await seededEngine();
    // Configuration says Routine cleaning = B$125. A document says $100.
    await addApproved(engine, TENANT_A, { docKey: "old-price-list", title: "Old Price List", text: "Routine cleaning costs $100 for all patients.", authority: "human_approved" });

    const r = await ask(engine, "how much is a cleaning?");
    if (!r.consulted || r.outcome !== "grounded") throw new Error(`expected grounded, got ${JSON.stringify(r)}`);

    // The engine stands behind the structured value...
    expect(r.evidence[0]).toMatchObject({ origin: "structured_config", documentKey: "service:cleaning" });
    expect(r.evidence.map((e) => e.documentKey)).not.toContain("old-price-list");
    expect(r.allowedAmountsCents).toContain(12500);
    // ...and forbids the losing figure outright.
    expect(r.forbiddenAmountsCents).toContain(10000);
    // The disagreement is detected, not silently resolved.
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ subject: "service:cleaning", attribute: "price", resolution: "authority_wins", winningValue: "12500" });
  });

  it("through the model: the structured price is accepted, the document's price is blocked even if the model repeats it", async () => {
    const engine = await seededEngine();
    await addApproved(engine, TENANT_A, { docKey: "old-price-list", title: "Old Price List", text: "Routine cleaning costs $100 for all patients.", authority: "human_approved" });
    const lookup = engine.service.lookupFor({ tenantId: TENANT_A, business: BUSINESS });

    const good = new LLMProvider(new ScriptedLlm(() => say("A routine cleaning is B$125 and takes about 60 minutes.")));
    const ok = await good.generateResponse(request("how much is a cleaning?", { knowledge: lookup }));
    expect(ok.reply).toContain("B$125");
    expect(ok.knowledgeGap).toBeUndefined();

    const bad = new LLMProvider(new ScriptedLlm(() => say("A routine cleaning is $100 right now!")));
    const blocked = await bad.generateResponse(request("how much is a cleaning?", { knowledge: lookup }));
    expect(blocked.reply).not.toContain("$100");
    expect(blocked.reply).toMatch(/don't have that information/);
    expect(blocked.knowledgeGap).toMatchObject({ reason: "answer_guard" });
    expect(blocked.actions).toEqual([]);
  });

  it("the cancellation notice in configuration (2h) beats a document's 24h, and the document's number never reaches the evidence", async () => {
    const engine = await seededEngine();
    await addApproved(engine, TENANT_A, {
      docKey: "cancellation-policy", title: "Cancellation Policy v3", authority: "approved_document",
      text: "Please cancel at least 24 hours before your appointment.",
    });
    const r = await ask(engine, "what's your cancellation policy?");
    if (!r.consulted || r.outcome !== "grounded") throw new Error("expected grounded");
    expect(r.conflicts[0]).toMatchObject({ subject: "policy:cancellation", attribute: "notice_hours", resolution: "authority_wins", winningValue: "2" });
    const text = r.evidence.map((e) => e.text).join(" ");
    expect(text).toContain("2 hours");
    expect(text).not.toContain("24 hours");
  });

  it("human-approved knowledge outranks an approved document", () => {
    const sources: ClaimSource[] = [
      src("12500", "human_approved", "faq"),
      src("15000", "approved_document", "pdf"),
    ];
    const [c] = analyzeConflicts(sources);
    expect(c).toMatchObject({ resolution: "authority_wins", winningValue: "12500" });
  });
});

describe("equal-authority disagreement is never resolved arbitrarily", () => {
  async function twoDisagreeingDocs() {
    const engine = makeEngine();
    await addApproved(engine, TENANT_A, { docKey: "fee-schedule-2024", title: "Fee Schedule 2024", text: "A root canal costs $500.", authority: "approved_document" }, BUSINESS_NO_ROOT_CANAL_PRICE);
    await addApproved(engine, TENANT_A, { docKey: "front-desk-notes", title: "Front Desk Notes", text: "A root canal costs $650.", authority: "approved_document" }, BUSINESS_NO_ROOT_CANAL_PRICE);
    engine.telemetry.events.length = 0;
    return engine;
  }

  it("reports a CONFLICT, withholds both figures, and records it for the operator", async () => {
    const engine = await twoDisagreeingDocs();
    const r = await ask(engine, "how much is a root canal?", { business: BUSINESS_NO_ROOT_CANAL_PRICE });
    expect(r).toMatchObject({ consulted: true, outcome: "conflict", evidence: [] });
    if (!r.consulted) return;
    expect(r.conflicts[0]).toMatchObject({ subject: "service:root_canal", attribute: "price", resolution: "needs_confirmation" });
    expect(r.forbiddenAmountsCents.sort()).toEqual([50000, 65000]);
    expect(engine.telemetry.names()).toContain("knowledge_conflict");

    const open = await engine.service.listOpenConflicts(TENANT_A);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ subject: "service:root_canal", attribute: "price", resolution: "needs_confirmation", status: "open" });
    expect(open[0].detectionCount).toBeGreaterThanOrEqual(1);
  });

  it("the model is not even asked: the reply is the deterministic 'needs confirmation' wording, naming neither price", async () => {
    const engine = await twoDisagreeingDocs();
    const llm = new ScriptedLlm(() => say("It is $500."));
    const provider = new LLMProvider(llm);
    const lookup = engine.service.lookupFor({ tenantId: TENANT_A, business: BUSINESS_NO_ROOT_CANAL_PRICE });
    const out = await provider.generateResponse(request("how much is a root canal?", { business: BUSINESS_NO_ROOT_CANAL_PRICE, knowledge: lookup }));
    expect(llm.calls).toHaveLength(0);
    expect(out.reply).toMatch(/different details for root canal pricing/);
    expect(out.reply).not.toMatch(/\$?(500|650)/);
    expect(out.actions).toEqual([]);
    expect(out.knowledgeGap).toMatchObject({ reason: "conflict" });
  });

  it("a conflict about PRICE does not stop the receptionist answering a different question about the same service", async () => {
    const engine = await twoDisagreeingDocs();
    const r = await ask(engine, "how long does a root canal take?", { business: BUSINESS_NO_ROOT_CANAL_PRICE });
    expect(r).toMatchObject({ consulted: true, outcome: "grounded" });
    if (r.consulted) expect(r.evidence[0].text).toContain("90 minutes");
    // ...but it still must not state either disputed price.
    if (r.consulted) expect(r.forbiddenAmountsCents.sort()).toEqual([50000, 65000]);
  });

  it("agreeing sources are not a conflict", async () => {
    const engine = makeEngine();
    await addApproved(engine, TENANT_A, { docKey: "a", title: "A", text: "A root canal costs $500." }, BUSINESS_NO_ROOT_CANAL_PRICE);
    await addApproved(engine, TENANT_A, { docKey: "b", title: "B", text: "The root canal fee is $500." }, BUSINESS_NO_ROOT_CANAL_PRICE);
    expect(await engine.service.listOpenConflicts(TENANT_A)).toEqual([]);
    const r = await ask(engine, "how much is a root canal?", { business: BUSINESS_NO_ROOT_CANAL_PRICE });
    expect(r).toMatchObject({ outcome: "grounded" });
  });

  it("the operator learns about a conflict the moment it is introduced (approval-time scan), and it closes when fixed", async () => {
    const engine = makeEngine();
    await addApproved(engine, TENANT_A, { docKey: "fee-schedule", title: "Fee Schedule", text: "A root canal costs $500." }, BUSINESS_NO_ROOT_CANAL_PRICE);
    expect(await engine.service.listOpenConflicts(TENANT_A)).toEqual([]);

    await addApproved(engine, TENANT_A, { docKey: "notes", title: "Notes", text: "A root canal costs $650." }, BUSINESS_NO_ROOT_CANAL_PRICE);
    const open = await engine.service.listOpenConflicts(TENANT_A);
    expect(open).toHaveLength(1);

    // Staff correct the second document: same key, new version, agreeing figure.
    await addApproved(engine, TENANT_A, { docKey: "notes", title: "Notes", text: "A root canal costs $500." }, BUSINESS_NO_ROOT_CANAL_PRICE);
    expect(await engine.service.listOpenConflicts(TENANT_A)).toEqual([]);
    const all = await engine.store.listConflicts(TENANT_A);
    expect(all[0]).toMatchObject({ status: "resolved", resolvedBy: "system:disagreement-no-longer-present" });
  });

  it("the same disagreement is recorded once and its detection count grows", async () => {
    const engine = await twoDisagreeingDocs();
    for (let i = 0; i < 3; i++) await ask(engine, "how much is a root canal?", { business: BUSINESS_NO_ROOT_CANAL_PRICE });
    const open = await engine.service.listOpenConflicts(TENANT_A);
    expect(open).toHaveLength(1);
    expect(open[0].detectionCount).toBeGreaterThanOrEqual(4); // approval-time scan + 3 customer questions
  });
});

describe("stale knowledge", () => {
  it("a newer approved version replaces the old one: only the new figure is retrievable and nothing conflicts", async () => {
    const engine = makeEngine();
    await addApproved(engine, TENANT_A, { docKey: "fees", title: "Fees", text: "A root canal costs $500." }, BUSINESS_NO_ROOT_CANAL_PRICE);
    await addApproved(engine, TENANT_A, { docKey: "fees", title: "Fees", text: "A root canal costs $650." }, BUSINESS_NO_ROOT_CANAL_PRICE);
    const r = await ask(engine, "how much is a root canal?", { business: BUSINESS_NO_ROOT_CANAL_PRICE });
    if (!r.consulted || r.outcome !== "grounded") throw new Error("expected grounded");
    expect(r.evidence[0]).toMatchObject({ documentKey: "fees", documentVersion: 2 });
    expect(r.evidence[0].text).toContain("$650");
    expect(r.conflicts).toEqual([]);
    expect(r.allowedAmountsCents).toEqual([65000]);
  });

  it("an expired document is not used even though it is still 'approved'", async () => {
    const engine = makeEngine();
    await addApproved(engine, TENANT_A, { docKey: "promo", title: "Spring Promotion", text: "Spring promotion: free whitening consult.", expiresAt: new Date(Date.now() - 60_000) });
    const r = await ask(engine, "do you have any promotion");
    expect(r).toMatchObject({ consulted: true, outcome: "no_evidence" });
  });
});

describe("conflict signatures", () => {
  it("are stable regardless of source ordering", () => {
    const a = analyzeConflicts([src("1", "approved_document", "x"), src("2", "approved_document", "y")])[0];
    const b = analyzeConflicts([src("2", "approved_document", "y"), src("1", "approved_document", "x")])[0];
    expect(conflictSignature(a)).toBe(conflictSignature(b));
  });
});

function src(value: string, authority: ClaimSource["authority"], key: string): ClaimSource {
  return {
    claim: { subject: "service:cleaning", attribute: "price", value, display: `$${Number(value) / 100}` },
    authority,
    documentKey: key,
    documentTitle: key,
    documentVersion: 1,
    chunkId: null,
  };
}
