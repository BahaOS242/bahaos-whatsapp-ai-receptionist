import { describe, expect, it } from "vitest";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import type { EmbeddingProvider } from "../../src/knowledge/embedding/provider";
import { KnowledgeService } from "../../src/knowledge/knowledge-service";
import type { KnowledgeStore } from "../../src/knowledge/store";
import { Conversation, BUSINESS, makeEngine, request, say, ScriptedLlm, seededEngine, TENANT_A } from "./helpers";
import { InMemoryKnowledgeStore } from "../../src/knowledge/memory-store";

describe("grounding: answers are based on retrieved facts", () => {
  it("the model receives the matching evidence (and the rules), and its grounded reply passes through untouched", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm(() => say("Please bring a photo ID, your insurance card if you have one, and a list of your medications."));
    const out = await new LLMProvider(llm).generateResponse(
      request("what should I bring to my first appointment?", { knowledge: engine.service.lookupFor({ tenantId: TENANT_A, business: BUSINESS }) }),
    );
    expect(llm.calls).toHaveLength(1);
    expect(llm.lastPrompt).toContain("photo ID");
    expect(llm.lastPrompt).toContain("Your First Visit");
    expect(llm.lastPrompt).toMatch(/ONLY from the structured business information/);
    expect(out.reply).toContain("photo ID");
    expect(out.knowledgeGap).toBeUndefined();
  });

  it("only the relevant slice of the knowledge base is sent — never the whole thing", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm(() => say("Yes, there is free parking behind the building."));
    await new LLMProvider(llm).generateResponse(request("is there parking?", { knowledge: engine.service.lookupFor({ tenantId: TENANT_A, business: BUSINESS }) }));
    const block = llm.lastPrompt.slice(llm.lastPrompt.indexOf("BEGIN RETRIEVED"));
    expect(block).toContain("free parking behind the building");
    expect(block).not.toContain("Cancellation Policy");
    expect(block).not.toContain("Visa");
    expect((block.match(/\[E\d+\]/g) ?? []).length).toBeLessThanOrEqual(4);
  });

  it("the engine OFF: the provider behaves exactly as before (no knowledge section, no guard side effects)", async () => {
    const llm = new ScriptedLlm(() => say("We're open weekdays."));
    const out = await new LLMProvider(llm).generateResponse(request("what are your hours?"));
    expect(llm.lastPrompt).not.toContain("RETRIEVED BUSINESS KNOWLEDGE");
    expect(out.reply).toBe("We're open weekdays.");
  });
});

describe("hallucination: no evidence => no invented answer", () => {
  it("'Do you offer pediatric root canals?' is refused WITHOUT asking the model", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm(() => say("Yes, we offer pediatric root canals for $400."));
    const out = await new LLMProvider(llm).generateResponse(
      request("Do you offer pediatric root canals?", { knowledge: engine.service.lookupFor({ tenantId: TENANT_A, business: BUSINESS }) }),
    );
    expect(llm.calls).toHaveLength(0);
    expect(out.reply).toBe("I don't have that information available right now. I can have someone from the office confirm that for you.");
    expect(out.actions).toEqual([]);
    expect(out.knowledgeGap).toMatchObject({ reason: expect.stringMatching(/low_coverage|below_threshold/) });
  });

  it("the refusal is operator-visible (gap recorded, redacted) but does NOT escalate or lock the conversation", async () => {
    const engine = await seededEngine();
    const convo = new Conversation(new LLMProvider(new ScriptedLlm(() => say("nope"))), engine);
    const result = await convo.send("do you do orthodontics? my number is 242-555-0123");
    expect(result.reply).toMatch(/don't have that information/);
    expect(result.handoffActive).toBe(false);
    expect(result.actionsTaken).toEqual([]);
    expect(convo.tools.calls).toEqual([]);

    expect(engine.gaps.gaps).toHaveLength(1);
    expect(engine.gaps.gaps[0].gap.question).toBe("do you do orthodontics? my number is [number]");
    expect(engine.telemetry.names()).toContain("knowledge_escalation");
    expect(engine.telemetry.names()).toContain("no_evidence");
  });

  it("a refusal in the MIDDLE of a booking keeps every booking field and invites the customer back to it", async () => {
    const engine = await seededEngine();
    const convo = new Conversation(new LLMProvider(new ScriptedLlm(() => say("unused"))), engine);
    const mid = await convo.send("do you offer invisalign");
    expect(mid.bookingState).toEqual({});
    // Start a booking by hand-seeding state, then ask something unanswerable.
    convo.manager.setBookingState({ intent: "book_appointment", service: "Routine cleaning", date: "Friday" });
    const r = await convo.send("do you do dental implants?");
    expect(r.reply).toMatch(/don't have that information/);
    expect(r.reply).toMatch(/pick your booking back up/);
    expect(r.bookingState).toMatchObject({ intent: "book_appointment", service: "Routine cleaning", date: "Friday" });
  });

  it("FAILS CLOSED: if the lookup itself blows up, the customer gets the honest refusal, never an improvised answer", async () => {
    const broken: KnowledgeStore = new Proxy(new InMemoryKnowledgeStore(), {
      get(target, prop, receiver) {
        if (prop === "listEligibleChunks") return async () => { throw new Error("db down"); };
        return Reflect.get(target, prop, receiver);
      },
    });
    const service = new KnowledgeService({ store: broken, embedder: makeEngine().embedder, cacheTtlMs: 0 });
    const llm = new ScriptedLlm(() => say("I'm sure it's $50!"));
    const out = await new LLMProvider(llm).generateResponse(
      request("how much for a whitening?", { knowledge: service.lookupFor({ tenantId: TENANT_A, business: BUSINESS }) }),
    );
    expect(llm.calls).toHaveLength(0);
    expect(out.reply).toMatch(/don't have that information/);
    expect(out.knowledgeGap).toMatchObject({ reason: "lookup_error" });
  });

  it("an embedding outage degrades to keyword retrieval — answers still grounded, nothing invented", async () => {
    const down: EmbeddingProvider = { id: "down", dimensions: 8, semantic: true, embed: async () => { throw new Error("network"); } };
    const engine = makeEngine({ embedder: down });
    const service = engine.service;
    // Structured facts only (no documents): retrieval must still answer from configuration.
    const out = await new LLMProvider(new ScriptedLlm(() => say("A routine cleaning is B$125."))).generateResponse(
      request("how much is a cleaning?", { knowledge: service.lookupFor({ tenantId: TENANT_A, business: BUSINESS }) }),
    );
    expect(out.reply).toContain("B$125");
    expect(engine.telemetry.names()).toContain("embedding_failed");
  });

  it("when the gate says 'not a knowledge question', the model is asked as before and no refusal is manufactured", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm(() => say("Sure — what day works for you?"));
    const out = await new LLMProvider(llm).generateResponse(
      request("I'd like to book a cleaning", { knowledge: engine.service.lookupFor({ tenantId: TENANT_A, business: BUSINESS }) }),
    );
    expect(llm.calls).toHaveLength(1);
    expect(llm.lastPrompt).not.toContain("RETRIEVED BUSINESS KNOWLEDGE");
    expect(out.reply).toBe("Sure — what day works for you?");
  });
});
