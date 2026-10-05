import { describe, expect, it } from "vitest";
import { LABELED_QUESTIONS } from "./fixtures/labeled-questions";
import { addApproved, ask, BUSINESS, makeEngine, seededEngine, TENANT_A } from "./helpers";

/** Labeled questions the engine is KNOWN not to ground — each is a SAFE
 * failure (a refusal or a skip, never a wrong answer). Documented limits:
 * compound questions spanning two facts, and FAQ-style questions the
 * query gate deliberately leaves to the structured prompt. */
const KNOWN_SAFE_MISSES = new Set(["will my insurance cover a filling", "can I bring my kid", "what services do you offer"]);

describe("basic retrieval over the demo corpus", () => {
  it("grounds every labeled answerable question on the right source, and refuses every unanswerable one", async () => {
    const engine = await seededEngine();
    const failures: string[] = [];
    for (const item of LABELED_QUESTIONS) {
      const r = await ask(engine, item.q);
      if (item.kind === "answerable") {
        if (KNOWN_SAFE_MISSES.has(item.q)) {
          // must fail SAFE: no answer rather than a wrong one
          if (r.consulted && r.outcome === "grounded") failures.push(`known-miss unexpectedly grounded: ${item.q}`);
          continue;
        }
        if (!r.consulted) failures.push(`skipped (${r.skipReason}): ${item.q}`);
        else if (r.outcome !== "grounded") failures.push(`not grounded: ${item.q}`);
        else if (!item.expect!.some((k) => r.evidence[0].documentKey === k)) failures.push(`wrong source ${r.evidence[0].documentKey}: ${item.q}`);
      } else if (r.consulted && r.outcome !== "no_evidence") {
        failures.push(`FABRICATION RISK — refuse-question was ${r.outcome}: ${item.q}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("exact FAQ and paraphrase both reach the same source", async () => {
    const engine = await seededEngine();
    for (const q of ["What should I bring to my first appointment?", "what do I need to bring", "what to bring along when I come in"]) {
      const r = await ask(engine, q);
      expect(r.consulted && r.outcome === "grounded" && r.evidence[0].documentKey, q).toBe("first-visit");
    }
  });

  it("unrelated questions get no evidence rather than the nearest-looking chunk", async () => {
    const engine = await seededEngine();
    for (const q of ["what is the capital of france", "do you sell used cars", "tell me a joke about bananas"]) {
      const r = await ask(engine, q);
      expect(r.consulted && r.outcome, q).toBe("no_evidence");
    }
  });

  it("with several similar documents, the right one wins and carries its provenance", async () => {
    const engine = makeEngine();
    await addApproved(engine, TENANT_A, { docKey: "late-arrival", title: "Late Arrival Policy", docType: "policy", text: "If you arrive more than 15 minutes late we may need to reschedule your visit." });
    await addApproved(engine, TENANT_A, { docKey: "cancel", title: "Cancellation Policy", docType: "policy", text: "Please cancel at least 2 hours before your appointment so we can offer the time to someone else." });
    await addApproved(engine, TENANT_A, { docKey: "weather", title: "Severe Weather Closure", docType: "policy", text: "During a hurricane warning the office closes and we reschedule everyone." });

    const late = await ask(engine, "what if I arrive late");
    expect(late.consulted && late.outcome === "grounded" && late.evidence[0]).toMatchObject({ documentKey: "late-arrival", documentTitle: "Late Arrival Policy", documentVersion: 1, authority: "approved_document", origin: "document" });
    const storm = await ask(engine, "what happens in a hurricane");
    expect(storm.consulted && storm.outcome === "grounded" && storm.evidence[0].documentKey).toBe("weather");
  });

  it("every piece of evidence is traceable: source, version, chunk, authority, score", async () => {
    const engine = await seededEngine();
    const r = await ask(engine, "what's your cancellation policy?");
    if (!r.consulted || r.outcome !== "grounded") throw new Error("expected grounded");
    for (const e of r.evidence) {
      expect(e.ref).toMatch(/^E\d+$/);
      expect(e.documentTitle).toBeTruthy();
      expect(e.authority).toBeTruthy();
      expect(e.score).toBeGreaterThan(0);
      if (e.origin === "document") {
        expect(e.chunkId).toBeTruthy();
        expect(e.documentVersion).toBe(1);
        expect(e.documentId).toBeTruthy();
      }
    }
  });

  it("an EMPTY knowledge base still works: structured facts answer, document-only questions refuse", async () => {
    const engine = makeEngine(); // nothing ingested
    const price = await ask(engine, "how much is a cleaning");
    expect(price).toMatchObject({ consulted: true, outcome: "grounded" });
    const doc = await ask(engine, "what should I bring to my first appointment");
    expect(doc).toMatchObject({ consulted: true, outcome: "no_evidence" });
  });

  it("an answer to a question about a service names that service's own fact first", async () => {
    const engine = await seededEngine();
    const r = await ask(engine, "how much is a root canal");
    expect(r.consulted && r.outcome === "grounded" && r.evidence[0]).toMatchObject({ documentKey: "service:root_canal", origin: "structured_config", authority: "structured_config" });
    expect(r.consulted && r.outcome === "grounded" && r.evidence[0].text).toContain("B$950");
  });

  it("a phone number or email inside the question is not part of what is asked (regression: digits were sinking coverage)", async () => {
    const engine = await seededEngine();
    const r = await ask(engine, "what should I bring? my number is 242-555-0123 or maria@example.com");
    expect(r.consulted && r.outcome === "grounded" && r.evidence[0].documentKey).toBe("first-visit");
  });

  it("business with no services still retrieves documents (no crash on empty structured facts)", async () => {
    const engine = makeEngine();
    const empty = { ...BUSINESS, services: [] };
    await addApproved(engine, TENANT_A, { docKey: "p", title: "Parking", text: "Free parking behind the building." }, empty);
    const r = await ask(engine, "is there parking", { business: empty });
    expect(r).toMatchObject({ consulted: true, outcome: "grounded" });
  });
});
