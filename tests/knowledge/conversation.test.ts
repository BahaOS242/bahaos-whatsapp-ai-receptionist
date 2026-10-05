import { describe, expect, it } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { Conversation, makeEngine, say, ScriptedLlm, seededEngine, TENANT_A } from "./helpers";

/**
 * The real conversation experience: multi-turn transcripts through the
 * actual ReceptionistAgent -> provider -> tools stack, with the knowledge
 * engine switched ON. The line these draw: KNOWLEDGE questions may
 * consult RAG; SCHEDULING never does.
 */

describe("conversation — deterministic provider + knowledge engine", () => {
  it("'how much is a cleaning' -> grounded, from structured configuration", async () => {
    const engine = await seededEngine();
    const c = new Conversation(new DevRuleBasedAIProvider(), engine);
    const r = await c.send("how much is a cleaning");
    expect(r.reply).toContain("B$125");
  });

  it("'what's your cancellation policy' -> answered from the knowledge base, quoting it", async () => {
    const engine = await seededEngine();
    const c = new Conversation(new DevRuleBasedAIProvider(), engine);
    const r = await c.send("what's your cancellation policy");
    expect(r.reply).toMatch(/2 hours/);
    expect(engine.telemetry.names()).toContain("grounded_response");
    expect(r.actionsTaken).toEqual([]);
  });

  it("'what should I bring' -> a document answer, not a booking flow and not 'I didn't catch that'", async () => {
    const engine = await seededEngine();
    const c = new Conversation(new DevRuleBasedAIProvider(), engine);
    const r = await c.send("what should I bring?");
    expect(r.reply).toMatch(/photo ID/);
    expect(r.bookingState).toEqual({});
  });

  it("'what happens if I cancel' is a POLICY question (not a cancellation request) — and 'cancel my appointment' still is one", async () => {
    const engine = await seededEngine();
    const c = new Conversation(new DevRuleBasedAIProvider(), engine);
    const policy = await c.send("what happens if I cancel");
    expect(policy.reply).toMatch(/2 hours/);
    expect(policy.bookingState.intent).toBeUndefined();

    const c2 = new Conversation(new DevRuleBasedAIProvider(), engine);
    const request = await c2.send("I need to cancel my appointment");
    expect(request.bookingState.intent).toBe("cancel_appointment");
    expect(request.reply).toMatch(/name|phone/i);
  });

  it("'do you offer pediatric root canals' -> an honest 'I don't have that', not a guess", async () => {
    const engine = await seededEngine();
    const c = new Conversation(new DevRuleBasedAIProvider(), engine);
    const r = await c.send("do you offer pediatric root canals");
    expect(r.reply).toMatch(/don't have that information/);
    expect(r.reply).not.toMatch(/yes/i);
  });

  it("scheduling messages are NEVER sent to retrieval, and the calendar flow answers them", async () => {
    const engine = await seededEngine();
    const c = new Conversation(new DevRuleBasedAIProvider(), engine);
    const book = await c.send("can I book a cleaning thursday at 3");
    expect(book.reply).not.toMatch(/don't have that information/);
    expect(book.bookingState.intent).toBe("book_appointment");
    await c.send("do you have anything available tomorrow");
    expect(engine.telemetry.names().filter((n) => n === "knowledge_query")).toHaveLength(0);
    expect(engine.embedder.queryEmbeds).toBe(0);
  });

  it("mid-booking side question: answered, the booking state is untouched, and the flow resumes", async () => {
    const engine = await seededEngine();
    const c = new Conversation(new DevRuleBasedAIProvider(), engine);
    await c.send("I want to book a cleaning");
    const before = c.manager.getBookingState();
    const side = await c.send("what should I bring?");
    expect(side.reply).toMatch(/photo ID/);
    expect(c.manager.getBookingState()).toEqual(before);
    expect(side.reply.toLowerCase()).toMatch(/day|date|when|what/); // resumePrompt re-asks the next field
  });

  it("DIFFERENTIAL: a full booking transcript has identical state and actions with the engine ON as OFF, and triggers zero retrievals", async () => {
    const transcript = ["I'd like to book a cleaning", "Friday", "10am", "Maria Lopez", "242-555-0117", "yes"];
    const off = new Conversation(new DevRuleBasedAIProvider());
    const engine = await seededEngine();
    const on = new Conversation(new DevRuleBasedAIProvider(), engine);
    const offResults = [];
    const onResults = [];
    for (const m of transcript) {
      offResults.push(await off.send(m));
      onResults.push(await on.send(m));
    }
    expect(onResults.map((r) => r.reply)).toEqual(offResults.map((r) => r.reply));
    expect(onResults.map((r) => r.bookingState)).toEqual(offResults.map((r) => r.bookingState));
    expect(onResults.map((r) => r.actionsTaken.map((a) => a.action))).toEqual(offResults.map((r) => r.actionsTaken.map((a) => a.action)));
    expect(on.tools.calls).toEqual(off.tools.calls);
    expect(on.tools.calls).toContain("requestAppointment");
    expect(engine.telemetry.names().filter((n) => n === "knowledge_query")).toHaveLength(0);
    expect(engine.embedder.queryEmbeds).toBe(0);
  });

  it("an empty knowledge base does not disturb normal operation", async () => {
    const engine = makeEngine(); // no documents at all
    const c = new Conversation(new DevRuleBasedAIProvider(), engine);
    expect((await c.send("hi")).reply).toMatch(/How can I help/);
    expect((await c.send("how much is a cleaning")).reply).toContain("B$125");
    expect((await c.send("what should I bring")).reply).toMatch(/don't have that information/);
    const flow = await c.send("I want to book a cleaning");
    expect(flow.bookingState.intent).toBe("book_appointment");
  });
});

describe("conversation — LLM provider + knowledge engine", () => {
  it("'how much is a cleaning' then 'and what about root canal' -> the follow-up is resolved against the previous question", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm((_p, n) => say(n === 1 ? "A routine cleaning is B$125." : "A root canal is B$950."));
    const c = new Conversation(new LLMProvider(llm), engine);
    const a = await c.send("how much is a cleaning");
    expect(a.reply).toContain("B$125");
    const b = await c.send("and what about root canal");
    expect(b.reply).toContain("B$950");
    // The retrieved block for the follow-up is the ROOT CANAL PRICE fact — not cleaning, not a generic list.
    const block = llm.lastPrompt.slice(llm.lastPrompt.indexOf("BEGIN RETRIEVED"));
    expect(block).toContain("Root canal costs B$950");
    expect(block).not.toContain("Routine cleaning costs");
  });

  it("'do you take insurance' -> grounded in the configured insurance policy", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm(() => say("Coverage varies by plan; our front desk team verifies your benefits before a visit."));
    const c = new Conversation(new LLMProvider(llm), engine);
    const r = await c.send("do you take insurance");
    expect(r.reply).toMatch(/verifies/);
    expect(llm.lastPrompt).toContain("Coverage varies by plan");
  });

  it("'can I book Thursday' -> the model handles scheduling; retrieval is not consulted and nothing is refused", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm(() => say("Which service would you like on Thursday?"));
    const c = new Conversation(new LLMProvider(llm), engine);
    const r = await c.send("can I book Thursday");
    expect(r.reply).toBe("Which service would you like on Thursday?");
    expect(llm.lastPrompt).not.toContain("RETRIEVED BUSINESS KNOWLEDGE");
    expect(engine.telemetry.names()).not.toContain("knowledge_query");
  });

  it("'same time' after a time was discussed -> existing state handling, no retrieval", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm(() => say("Got it."));
    const c = new Conversation(new LLMProvider(llm), engine);
    c.manager.setBookingState({ intent: "book_appointment", service: "Routine cleaning", date: "Friday", time: "10:00" });
    await c.send("same time");
    expect(engine.telemetry.names()).not.toContain("knowledge_query");
    expect(engine.embedder.queryEmbeds).toBe(0);
  });

  it("a yes/no confirmation turn never triggers retrieval", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm(() => say("Understood."));
    const c = new Conversation(new LLMProvider(llm), engine);
    c.manager.setBookingState({ intent: "book_appointment", service: "Routine cleaning", date: "Friday", time: "10:00", name: "Maria Lopez", phone: "242-555-0117", pendingAction: "confirm_booking" });
    await c.send("yes");
    expect(engine.telemetry.names()).not.toContain("knowledge_query");
  });
});

describe("performance: retrieval only when it materially helps", () => {
  it("across a 16-turn mixed transcript, the embedder is consulted ONLY for genuine knowledge questions", async () => {
    const engine = await seededEngine();
    const llm = new ScriptedLlm(() => say("OK."));
    const c = new Conversation(new LLMProvider(llm), engine);
    const turns: Array<[string, boolean]> = [
      ["hi", false],
      ["yes", false],
      ["no", false],
      ["Trevor", false],
      ["2pm", false],
      ["Friday", false],
      ["242-555-0199", false],
      ["I'd like to book a cleaning", false],
      ["can I come Thursday at 3", false],
      ["do you have anything available tomorrow", false],
      ["actually make it 3pm", false],
      ["thanks", false],
      ["what should I bring", true],
      ["how do I pay", true],
      ["is there parking", true],
      ["what's your cancellation policy", true],
    ];
    for (const [message] of turns) await c.send(message);
    const expected = turns.filter(([, consult]) => consult).length;
    expect(engine.telemetry.names().filter((n) => n === "knowledge_query")).toHaveLength(expected);
    expect(engine.embedder.queryEmbeds).toBe(expected);
    void TENANT_A;
  });
});
