import { describe, expect, it } from "vitest";
import { LLMProvider, MalformedLlmResponseError } from "../../src/ai/providers/llm-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { describeNextField as describeNextFieldFor } from "../../src/ai/booking-progression";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProviderRequest, BusinessContext } from "../../src/ai/types";

/**
 * Natural LLM conversation layer — the model handles conversational flow,
 * but the application stays authoritative over structured state, business
 * hours, and (new for this milestone) slot availability. Complements
 * tests/ai/llm-provider.test.ts (which already covers prompt construction,
 * tool-call parsing, pendingAction, and business-hours authority) rather
 * than duplicating it.
 */

/** Test double — no network, no API key, fully deterministic. Identical to
 * llm-provider.test.ts's local copy, matching the established per-file
 * convention in this test directory. */
class FakeLlmChatClient implements LlmChatClient {
  public lastCallArgs: Parameters<LlmChatClient["chat"]>[0] | undefined;

  constructor(private readonly result: LlmChatResult | (() => LlmChatResult)) {}

  async chat(params: Parameters<LlmChatClient["chat"]>[0]): Promise<LlmChatResult> {
    this.lastCallArgs = params;
    return typeof this.result === "function" ? this.result() : this.result;
  }
}

function request(message: string, overrides: Partial<AIProviderRequest> = {}): AIProviderRequest {
  return {
    business: BAHAMAS_DENTAL_SERVICE,
    customer: {},
    history: [],
    message,
    bookingState: {},
    ...overrides,
  };
}

const BUSINESS_WITH_HELD_SLOT: BusinessContext = {
  ...BAHAMAS_DENTAL_SERVICE,
  unavailableSlots: [{ date: "Tuesday", time: "14:00" }],
};

describe("LLMProvider — natural multi-turn context", () => {
  it("forwards accumulated history and the running booking state on a later turn, not just the newest message", async () => {
    const client = new FakeLlmChatClient({ content: "3pm works great.", toolCalls: [] });
    const provider = new LLMProvider(client);

    await provider.generateResponse(
      request("3pm please", {
        history: [
          { role: "customer", content: "I want a cleaning Tuesday." },
          { role: "assistant", content: "Sure. What time Tuesday works for you?" },
        ],
        bookingState: { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday" },
      }),
    );

    expect(client.lastCallArgs?.messages).toEqual([
      { role: "user", content: "I want a cleaning Tuesday." },
      { role: "assistant", content: "Sure. What time Tuesday works for you?" },
      { role: "user", content: "3pm please" },
    ]);
    expect(client.lastCallArgs?.systemPrompt).toContain("service: Routine cleaning");
    expect(client.lastCallArgs?.systemPrompt).toContain("date: Tuesday");
  });

  it("service remembered across turns: a later turn's booking state still has it without the model resending it", async () => {
    const turn1Client = new FakeLlmChatClient({
      content: "Great — what day and time works?",
      toolCalls: [
        {
          id: "call_1",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({
            intent: "book_appointment",
            service: "Routine cleaning",
          }),
        },
      ],
    });
    const turn1 = await new LLMProvider(turn1Client).generateResponse(
      request("I'd like a cleaning"),
    );
    expect(turn1.bookingState.service).toBe("Routine cleaning");

    // Turn 2's model omits `service` from its update_booking_progress call
    // (imperfect model behavior) — the merge must not require every field
    // to be resent for it to survive.
    const turn2Client = new FakeLlmChatClient({
      content: "And what time?",
      toolCalls: [
        {
          id: "call_2",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({ intent: "book_appointment", date: "Tuesday" }),
        },
      ],
    });
    const turn2 = await new LLMProvider(turn2Client).generateResponse(
      request("Tuesday", { bookingState: turn1.bookingState }),
    );

    expect(turn2.bookingState).toEqual({
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
    });
  });

  it("date correction remembered: 'Actually Wednesday would be better' updates only date, preserving service/time/name/phone", async () => {
    // The date correction itself is now captured deterministically by
    // extractStatedFields (the "actually" correction marker, with intent
    // already established, allows overwriting the already-known date) —
    // no update_booking_progress call is needed for this to work at all.
    const client = new FakeLlmChatClient({
      content: "No problem — Wednesday it is. Same time?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Actually Wednesday would be better.", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );

    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Wednesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
      // Every required field is known again after the correction, so the
      // application deterministically re-offers confirmation.
      pendingAction: "confirm_service",
    });
  });

  it("a temporary FAQ question does not lose booking context already in progress", async () => {
    const client = new FakeLlmChatClient({
      content: "Routine cleaning is B$125. What time Tuesday were you thinking?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("What's the price?", {
        bookingState: { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday" },
      }),
    );

    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
    });
    expect(result.reply).toMatch(/B\$125/);
  });
});

describe("LLMProvider — structured state only, prose is never re-parsed", () => {
  it("does not extract booking fields from the model's prose — only update_booking_progress/action tool calls affect state", async () => {
    const client = new FakeLlmChatClient({
      content: "Sounds good — Wednesday at 3pm for Trevor, a Routine cleaning, coming right up!",
      toolCalls: [], // deliberately no update_booking_progress despite the prose mentioning everything
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Wednesday 3pm, Trevor", { bookingState: { intent: "book_appointment" } }),
    );

    expect(result.bookingState).toEqual({ intent: "book_appointment" });
  });
});

describe("LLMProvider — availability is application-authoritative, not model-trusted", () => {
  it("drops a request_appointment for an already-held (but in-hours) slot, never lets the model's optimistic reply through, and offers real alternatives", async () => {
    const client = new FakeLlmChatClient({
      content: "Perfect, you're all set for 2pm Tuesday!", // the model's optimistic (wrong) reply
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Tuesday 2pm", {
        business: BUSINESS_WITH_HELD_SLOT,
        bookingState: {
          intent: "book_appointment",
          service: "Basic filling",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );

    // The action is never returned — the model's proposal is discarded.
    expect(result.actions).toEqual([]);
    expect(result.reply).not.toContain("Perfect, you're all set");
    expect(result.reply).toMatch(/already booked/i);
    expect(result.reply).toMatch(/9:00 AM/); // first same-day open alternative

    // Only time is cleared — the day itself was fine. date is now also
    // captured deterministically from "Tuesday 2pm" (next required field
    // was "date" going into this turn), not just from the action payload.
    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Basic filling",
      name: "Trevor",
      phone: "+12428012847",
      date: "Tuesday",
    });
  });

  it("a genuinely available slot is proposed normally — the availability check does not block it", async () => {
    const client = new FakeLlmChatClient({
      content: "Perfect — I've captured your request.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "15:00", // not the held 14:00 slot
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      // Deliberately not "yes"/"go ahead"/etc — those trigger the app's
      // own auto-confirm bypass, which never consults the model at all;
      // this test needs the model's scripted response actually used.
      request("book it please", {
        business: BUSINESS_WITH_HELD_SLOT,
        bookingState: {
          intent: "book_appointment",
          service: "Basic filling",
          date: "Tuesday",
          time: "15:00",
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Basic filling",
          preferredDate: "Tuesday",
          preferredTime: "15:00",
        },
      },
    ]);
    expect(result.reply).toBe("Perfect — I've captured your request.");
  });
});

describe("LLMProvider — handoff state", () => {
  it("includes the current handoff state in the system prompt", async () => {
    const client = new FakeLlmChatClient({ content: "ok", toolCalls: [] });
    await new LLMProvider(client).generateResponse(request("hello", { handoffActive: true }));

    expect(client.lastCallArgs?.systemPrompt).toMatch(/already been escalated/i);
  });

  it("reflects a NOT-yet-escalated conversation too", async () => {
    const client = new FakeLlmChatClient({ content: "ok", toolCalls: [] });
    await new LLMProvider(client).generateResponse(request("hello"));

    expect(client.lastCallArgs?.systemPrompt).toMatch(/not escalated/i);
  });

  it("ReceptionistAgent never calls the LLM at all once handoff is active — enforcement is the agent's job, not the model's", async () => {
    const client = new FakeLlmChatClient({ content: "I can help with that!", toolCalls: [] });
    const provider = new LLMProvider(client);
    const agent = new ReceptionistAgent(
      provider,
      createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE),
    );

    const result = await agent.handleMessage(
      request("book me a cleaning", { handoffActive: true }),
    );

    expect(client.lastCallArgs).toBeUndefined(); // chat() was never invoked
    expect(result.actionsTaken).toEqual([]);
    expect(result.handoffActive).toBe(true);
  });
});

describe("LLMProvider — escalation is a safety net, not a model courtesy", () => {
  it("forces an escalate action and the standard handoff reply when the customer explicitly asks for a person, even if the model doesn't call escalate", async () => {
    const client = new FakeLlmChatClient({
      content: "Sure, are you asking about your existing appointment or something new?",
      toolCalls: [], // the model chose to ask a clarifying question instead of escalating
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("Can I speak to a person?"));

    expect(result.actions).toEqual([
      { type: "escalate", payload: { reason: "customer explicitly asked for a person" } },
    ]);
    // The model's own (non-escalating) reply is never sent — replaced with
    // the same handoff message DevRuleBasedAIProvider uses for this exact
    // trigger, so behavior is consistent across providers.
    expect(result.reply).toBe(BAHAMAS_DENTAL_SERVICE.escalationHandoffMessage);
  });

  it("forces an escalate action for a described emergency, even if the model doesn't call escalate", async () => {
    const client = new FakeLlmChatClient({
      content: "I'm sorry to hear that — let's see what we can do.",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("my tooth really hurts, it's an emergency"),
    );

    expect(result.actions).toEqual([
      { type: "escalate", payload: { reason: "possible dental emergency" } },
    ]);
    expect(result.reply).toBe(BAHAMAS_DENTAL_SERVICE.policies.emergencyPolicy);
  });

  it("does not double-escalate when the model already called escalate itself", async () => {
    const client = new FakeLlmChatClient({
      content: "I'll get someone from the team to help.",
      toolCalls: [
        {
          id: "call_1",
          name: "escalate",
          argumentsJson: JSON.stringify({ reason: "customer asked for a human" }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("Can I speak to a person?"));

    expect(result.actions).toEqual([
      { type: "escalate", payload: { reason: "customer asked for a human" } },
    ]);
    // The model's own reply survives — the safety net only overrides when
    // it's the one deciding to escalate on the model's behalf.
    expect(result.reply).toBe("I'll get someone from the team to help.");
  });

  it("does not fire on an ordinary message that doesn't match either trigger", async () => {
    const client = new FakeLlmChatClient({
      content: "Sure, what service are you after?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("I'd like to book an appointment"));

    expect(result.actions).toEqual([]);
    expect(result.reply).toBe("Sure, what service are you after?");
  });
});

describe("LLMProvider — phone numbers are normalized, never trusted verbatim", () => {
  it("normalizes a raw 10-digit phone reported in a request_appointment call", async () => {
    const client = new FakeLlmChatClient({
      content: "Perfect — I've captured your request.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847", // no country code, as the live model echoed it
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "10:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("yes", {
        bookingState: {
          intent: "book_appointment",
          service: "Basic filling",
          date: "Tuesday",
          time: "10:00",
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Basic filling",
          preferredDate: "Tuesday",
          preferredTime: "10:00",
        },
      },
    ]);
  });

  it("rejects a request_appointment whose phone doesn't normalize to a real number, preserving everything else", async () => {
    const client = new FakeLlmChatClient({
      content: "Perfect, you're all set!", // the model's optimistic (wrong) reply
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "123", // too short to be a real number
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "10:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Trevor 123", {
        bookingState: { intent: "book_appointment", service: "Basic filling", date: "Tuesday" },
      }),
    );

    expect(result.actions).toEqual([]);
    expect(result.reply).not.toContain("Perfect, you're all set");
    expect(result.reply).toMatch(/phone number/i);
    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Basic filling",
      date: "Tuesday",
    });
  });

  it("drops an unnormalizable phone from update_booking_progress rather than overwriting an already-known-good phone", async () => {
    const client = new FakeLlmChatClient({
      content: "Got it, what day works?",
      toolCalls: [
        {
          id: "call_1",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({
            intent: "book_appointment",
            service: "Basic filling",
            phone: "12", // garbled, not a real number
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("uh my number is 12 sorry typo", {
        bookingState: {
          intent: "book_appointment",
          service: "Basic filling",
          phone: "+12428012847",
        },
      }),
    );

    expect(result.bookingState.phone).toBe("+12428012847");
  });

  it("drops (does not reject) an unnormalizable phone on the optional create_lead action", async () => {
    const client = new FakeLlmChatClient({
      content: "Thanks, I'll note that down.",
      toolCalls: [
        {
          id: "call_1",
          name: "create_lead",
          argumentsJson: JSON.stringify({ name: "Trevor", phone: "not a number" }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("just curious about pricing for now"));

    expect(result.actions).toEqual([
      { type: "create_lead", payload: { name: "Trevor", phone: undefined } },
    ]);
  });
});

describe("LLMProvider — application-owned conversation progression", () => {
  it("1. a new booking (service known, date/time missing) tells the model to ask for date and time, not name", async () => {
    const client = new FakeLlmChatClient({
      content: "What day and time works for you?",
      toolCalls: [],
    });
    await new LLMProvider(client).generateResponse(
      request("I want to book a cleaning", {
        bookingState: { intent: "book_appointment", service: "Routine cleaning" },
      }),
    );

    expect(client.lastCallArgs?.systemPrompt).toContain("Next required field: date and time.");
    expect(client.lastCallArgs?.systemPrompt).not.toMatch(/Next required field: name/);
  });

  it("2. once date/time are supplied, the context tells the model name is next", async () => {
    const client = new FakeLlmChatClient({ content: "What's your name?", toolCalls: [] });
    await new LLMProvider(client).generateResponse(
      request("Tuesday at 2pm", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
        },
      }),
    );

    expect(client.lastCallArgs?.systemPrompt).toContain("Next required field: name.");
  });

  it("3. once name is supplied, the context tells the model phone is next", async () => {
    const client = new FakeLlmChatClient({ content: "And your phone number?", toolCalls: [] });
    await new LLMProvider(client).generateResponse(
      request("Trevor", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Trevor",
        },
      }),
    );

    expect(client.lastCallArgs?.systemPrompt).toContain("Next required field: phone.");
  });

  it("4. an invalid (out-of-hours) date/time does not advance the flow — the next turn's context still asks for date/time, not name", async () => {
    const client = new FakeLlmChatClient({
      content: "Booked for 6pm!",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "18:00", // after close
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const rejected = await provider.generateResponse(
      request("Tuesday 6pm", {
        bookingState: { intent: "book_appointment", service: "Basic filling", name: "Trevor" },
      }),
    );
    expect(rejected.bookingState.date).toBeUndefined();
    expect(rejected.bookingState.time).toBeUndefined();

    const followUpClient = new FakeLlmChatClient({ content: "ok", toolCalls: [] });
    await new LLMProvider(followUpClient).generateResponse(
      request("hmm", { bookingState: rejected.bookingState }),
    );

    expect(followUpClient.lastCallArgs?.systemPrompt).toContain(
      "Next required field: date and time.",
    );
  });

  it("5. an FAQ side question mid-booking preserves progress — the next turn's context is unaffected", async () => {
    const client = new FakeLlmChatClient({
      content: "Routine cleaning is B$125. What time Tuesday were you thinking?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("What's the price?", {
        bookingState: { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday" },
      }),
    );

    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
    });
    expect(describeNextFieldFor(result.bookingState)).toBe("time");
  });

  it("6. a natural correction preserves unrelated fields and leaves next-field context correct afterward", async () => {
    // Captured deterministically by extractStatedFields (the "actually"
    // correction marker with intent already established) — no
    // update_booking_progress call needed.
    const client = new FakeLlmChatClient({
      content: "No problem — Wednesday it is.",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Actually Wednesday would be better.", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );

    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Wednesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    });
    // Every required field is still known after the correction — nothing
    // was knocked out of the flow by the date change.
    expect(describeNextFieldFor(result.bookingState)).toBe("none — every required field is known");
  });

  it("7. an unparseable/garbage customer reply (no tool calls at all) does not skip the flow ahead", async () => {
    const client = new FakeLlmChatClient({
      content: "Sorry, I didn't quite catch that — what day and time works for you?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const priorState = { intent: "book_appointment" as const, service: "Routine cleaning" };
    const result = await provider.generateResponse(
      request("asdkjfh??", { bookingState: priorState }),
    );

    expect(result.bookingState).toEqual(priorState);
    expect(describeNextFieldFor(result.bookingState)).toBe("date and time");
  });

  it("8. escalation still fires correctly with the new progression context present in the prompt", async () => {
    const client = new FakeLlmChatClient({ content: "Let me get someone.", toolCalls: [] });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Can I speak to a person?", {
        bookingState: { intent: "book_appointment", service: "Routine cleaning" },
      }),
    );

    expect(result.actions).toEqual([
      { type: "escalate", payload: { reason: "customer explicitly asked for a person" } },
    ]);
    expect(result.reply).toBe(BAHAMAS_DENTAL_SERVICE.escalationHandoffMessage);
  });

  it("9. availability/business-hours protections still fire correctly with the new progression context present", async () => {
    const client = new FakeLlmChatClient({
      content: "You're all set for 2pm!",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "14:00", // held slot
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Tuesday 2pm", {
        business: BUSINESS_WITH_HELD_SLOT,
        bookingState: {
          intent: "book_appointment",
          service: "Basic filling",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );

    expect(result.actions).toEqual([]);
    expect(result.reply).toMatch(/already booked/i);
  });

  it("10. the system prompt carries a single compact next-step line, not a duplicated/verbose state dump", async () => {
    const client = new FakeLlmChatClient({ content: "ok", toolCalls: [] });
    await new LLMProvider(client).generateResponse(
      request("hello", {
        bookingState: { intent: "book_appointment", service: "Routine cleaning" },
      }),
    );

    const prompt = client.lastCallArgs?.systemPrompt ?? "";
    const nextFieldLines = prompt
      .split("\n")
      .filter((line) => line.startsWith("Next required field:"));
    expect(nextFieldLines).toHaveLength(1);
    expect(nextFieldLines[0]).toBe("Next required field: date and time.");
  });
});

describe("LLMProvider — a blank model reply is never sent to the customer", () => {
  it("update_booking_progress with no accompanying text falls back to asking about the next required field", async () => {
    const client = new FakeLlmChatClient({
      content: null, // the model called the tool but wrote nothing
      toolCalls: [
        {
          id: "call_1",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({
            intent: "book_appointment",
            service: "Routine cleaning",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("I want a cleaning"));

    expect(result.reply).not.toBe("");
    expect(result.reply.toLowerCase()).toContain("day and time");
  });

  it("every required field known but the model stalls (no text, no completing action) asks for confirmation instead of a stuck vague nudge", async () => {
    // Reproduces a live scenario: the model has everything it needs but
    // keeps calling update_booking_progress with the same (already-known)
    // data instead of calling request_appointment, and returns no text.
    // A generic "could you say that again?" repeats forever since the
    // customer has nothing new to add — this must give them something
    // concrete (yes/no) to respond to instead.
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "call_1",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({
            intent: "book_appointment",
            service: "Routine cleaning",
            date: "Tuesday",
            time: "14:00",
            name: "Trevor",
            phone: "+12428012847",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("12428012847", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Trevor",
        },
      }),
    );

    // Not toBe(): the middle segment includes the real resolved calendar
    // date (e.g. "August 25"), which shifts with the current date — the
    // fixed prefix/suffix around it is what's actually being verified.
    expect(result.reply).toMatch(
      /^I have you down for Routine cleaning on Tuesday, .+ at 2:00 PM\. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change\.$/,
    );
    expect(result.actions).toEqual([]);
    // The critical part of this fix: pendingAction MUST be set so a
    // customer's next "yes" has a structured signal to attach to — without
    // this, the confirmation question repeats forever (reproduced live:
    // the model has no way to know what "yes" is answering, since the
    // question came from the application, not from the model's own
    // update_booking_progress call).
    expect(result.bookingState.pendingAction).toBe("confirm_service");
  });

  it("the same stalled-confirmation fallback adapts wording for a reschedule (no service) and a cancellation (no date/time)", async () => {
    // phone is already known going in (deterministic extraction only
    // ever finds NEW information in the current message — "Wednesday
    // 10am" doesn't contain one). The model still makes SOME tool call
    // (a no-op re-report of the already-known intent) but no text — that
    // "stalled" shape is exactly what this test is proving a fallback for;
    // a response with neither text nor any tool call at all is a
    // different, already-covered case (MalformedLlmResponseError).
    const rescheduleClient = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "call_1",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({ intent: "reschedule_appointment" }),
        },
      ],
    });
    const rescheduled = await new LLMProvider(rescheduleClient).generateResponse(
      request("Wednesday 10am", {
        bookingState: {
          intent: "reschedule_appointment",
          date: "Wednesday",
          time: "10:00",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );
    expect(rescheduled.reply).toMatch(
      /^I have you down to move your appointment for Wednesday, .+ at 10:00 AM\. Reply YES to confirm the reschedule, or tell me the date or time you'd like to change\.$/,
    );

    const cancelClient = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "call_1",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({ intent: "cancel_appointment" }),
        },
      ],
    });
    const cancelled = await new LLMProvider(cancelClient).generateResponse(
      request("that's everything", {
        bookingState: {
          intent: "cancel_appointment",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );
    expect(cancelled.reply).toBe(
      "I have your appointment for Trevor flagged for cancellation. Reply YES to confirm the cancellation, or NO if you'd like to keep it.",
    );
  });

  it("no active intent at all and no text falls back to a generic nudge, not a confirmation prompt", async () => {
    // create_lead doesn't touch bookingState.intent at all (it's not a
    // completing action and carries no progress update) — nextRequiredField
    // stays undefined for the "nothing to confirm" reason, not the
    // "everything known" reason, so this must NOT produce a confirm-and-
    // book prompt out of nowhere.
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "call_1",
          name: "create_lead",
          argumentsJson: JSON.stringify({ name: "Trevor" }),
        },
      ],
    });
    const result = await new LLMProvider(client).generateResponse(request("just curious"));

    expect(result.reply).toBe("Sorry, could you say that again?");
    expect(result.bookingState.intent).toBeUndefined();
  });

  it("end-to-end: the confirmation prompt's pendingAction lets a model that reads it correctly complete the booking on the very next turn", async () => {
    // Turn 1: model stalls (blank text, no completing action) once
    // everything's known — the fallback fires and must set pendingAction.
    const turn1Client = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "call_1",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({
            intent: "book_appointment",
            service: "Routine cleaning",
            date: "Tuesday",
            time: "14:00",
            name: "Trevor",
            phone: "+12428012847",
          }),
        },
      ],
    });
    const turn1 = await new LLMProvider(turn1Client).generateResponse(
      request("12428012847", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Trevor",
        },
      }),
    );
    expect(turn1.bookingState.pendingAction).toBe("confirm_service");

    // Turn 2: customer says "yes" — a model that (correctly, per the
    // system prompt) reads pendingAction from turn 1's booking state calls
    // request_appointment. This proves turn 1's fix actually unblocks the
    // flow, not just that it sets a flag nobody reads.
    const turn2Client = new FakeLlmChatClient({
      content: "Perfect — I've captured your request.",
      toolCalls: [
        {
          id: "call_2",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          }),
        },
      ],
    });
    const turn2 = await new LLMProvider(turn2Client).generateResponse(
      request("yes", { bookingState: turn1.bookingState }),
    );

    expect(turn2.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);
    // Retains bookingJustCompleted (and a snapshot of what was booked) so
    // a later hallucinated repeat action can be deterministically blocked
    // — see the duplicate-booking regressions in tests/ai/llm-provider.test.ts.
    expect(turn2.bookingState).toEqual({
      bookingJustCompleted: true,
      lastCompletedBooking: {
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: "+12428012847",
      },
    });
  });

  it("auto-confirm safety net: an unambiguous 'yes' to a pending confirm_service completes the booking WITHOUT ever calling the model — reproduces the exact live stuck loop and proves it's now broken", async () => {
    // The underlying client is scripted to keep stalling (blank content,
    // no tool call at all — this would throw MalformedLlmResponseError if
    // it were ever actually invoked) — this test's whole point is proving
    // the auto-confirm path intercepts BEFORE the client is called at all,
    // so a genuinely unreliable model can never re-create this loop.
    const client = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("yes", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(client.lastCallArgs).toBeUndefined(); // chat() was never invoked
    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);
    expect(result.bookingState).toEqual({
      bookingJustCompleted: true,
      lastCompletedBooking: {
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: "+12428012847",
      },
    });
    expect(result.reply).not.toBe("");
  });

  it("auto-confirm does not fire on an ambiguous reply, a still-incomplete booking, or without a pending confirmation", async () => {
    const complete = {
      intent: "book_appointment" as const,
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
    };

    // No pendingAction at all — a bare "yes" here has nothing to confirm.
    const client1 = new FakeLlmChatClient({ content: "Sure!", toolCalls: [] });
    await new LLMProvider(client1).generateResponse(request("yes", { bookingState: complete }));
    expect(client1.lastCallArgs).toBeDefined(); // model WAS called — no auto-confirm

    // pendingAction set but the booking isn't actually complete.
    const client2 = new FakeLlmChatClient({ content: "What time?", toolCalls: [] });
    await new LLMProvider(client2).generateResponse(
      request("yes", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          pendingAction: "confirm_service",
        },
      }),
    );
    expect(client2.lastCallArgs).toBeDefined();

    // Complete and pending, but the reply isn't clearly affirmative.
    const client3 = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    await new LLMProvider(client3).generateResponse(
      request("actually wait", { bookingState: { ...complete, pendingAction: "confirm_service" } }),
    );
    expect(client3.lastCallArgs).toBeDefined();
  });

  it("a completing action (request_appointment) with no accompanying text still confirms the booking to the customer", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "10:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("that's everything", {
        bookingState: {
          intent: "book_appointment",
          service: "Basic filling",
          date: "Tuesday",
          time: "10:00",
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(result.reply).not.toBe("");
    expect(result.reply.toLowerCase()).toMatch(/captured|confirm/);
    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Basic filling",
          preferredDate: "Tuesday",
          preferredTime: "10:00",
        },
      },
    ]);
  });

  it("an escalate action the model itself called, with no accompanying text, still tells the customer they've been escalated", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "call_1",
          name: "escalate",
          argumentsJson: JSON.stringify({ reason: "customer requested a person" }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("Can I speak to a person?"));

    expect(result.reply).toBe(BAHAMAS_DENTAL_SERVICE.escalationHandoffMessage);
    expect(result.actions).toEqual([
      { type: "escalate", payload: { reason: "customer requested a person" } },
    ]);
  });

  it("no tool calls and no text at all is still treated as malformed (unchanged) — the fallback only covers the tool-call case", async () => {
    const client = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("hello"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });
});

describe("LLMProvider — decline safety net: an explicit 'no' must never book, regardless of what the LLM returns", () => {
  const READY_TO_BOOK = {
    intent: "book_appointment" as const,
    service: "Routine cleaning",
    date: "Tuesday",
    time: "14:00",
    name: "Trevor",
    phone: "+12428012847",
    pendingAction: "confirm_service" as const,
  };

  it("layer 1: an unambiguous 'no' to a pending confirm_service is blocked WITHOUT ever calling the model", async () => {
    const client = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("no", { bookingState: READY_TO_BOOK }));

    expect(client.lastCallArgs).toBeUndefined(); // chat() was never invoked
    expect(result.actions).toEqual([]);
    expect(result.reply).toBe(
      "No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?",
    );
    // Every known field survives — only pendingAction clears, so the
    // customer can correct or continue instead of restating everything.
    // justDeclined: true is a one-turn marker (see BookingState's
    // docstring) giving the customer's very next word the same
    // correction license an explicit "actually"/"instead" marker
    // already has — consumed and cleared by that next turn's own
    // extraction regardless of what it finds.
    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
      justDeclined: true,
    });
  });

  it.each([
    "nope",
    "nah",
    "don't book it",
    "do not book it",
    "wait",
    "stop",
    "cancel that",
    "never mind",
    "not yet",
  ])("layer 1 recognizes %j as an explicit decline", async (phrase) => {
    const client = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const result = await new LLMProvider(client).generateResponse(
      request(phrase, { bookingState: READY_TO_BOOK }),
    );

    expect(client.lastCallArgs).toBeUndefined();
    expect(result.actions).toEqual([]);
    expect(result.bookingState.pendingAction).toBeUndefined();
  });

  it("layer 2 (regression, live Scenario 3): a decline still blocks request_appointment even when pendingAction was never set — the model proposed booking anyway using details it reconstructed from history", async () => {
    // Reproduces exactly what happened live: bookingState never recorded
    // name/phone or a pendingAction (the separate, out-of-scope
    // update_booking_progress reliability issue), yet the model still
    // proposed request_appointment in direct response to "no" — pulling
    // name/phone from raw conversation text instead of structured state.
    const client = new FakeLlmChatClient({
      content: "Got it — that's Trevor with phone number 2428012847. I've captured your request.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "15:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("no", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "15:00",
        },
      }),
    );

    expect(result.actions).toEqual([]); // request_appointment is dropped, never returned to the agent
    expect(result.reply).toBe(
      "No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?",
    );
    // Whatever WAS already known survives.
    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "15:00",
    });
  });

  it("does not intercept a bare 'no' when there's no pending confirmation and the model proposes no completing action — ordinary conversation is unaffected", async () => {
    const client = new FakeLlmChatClient({
      content: "No worries — do you have insurance you'd like on file?",
      toolCalls: [],
    });
    const result = await new LLMProvider(client).generateResponse(request("no"));

    expect(client.lastCallArgs).toBeDefined(); // the model WAS called normally
    expect(result.reply).toBe("No worries — do you have insurance you'd like on file?");
  });

  it("does not false-positive on a message that merely contains 'no' as a substring, not as its own word at the start", async () => {
    const client = new FakeLlmChatClient({ content: "Great, let's continue.", toolCalls: [] });
    const result = await new LLMProvider(client).generateResponse(
      request("I know that works for me", { bookingState: READY_TO_BOOK }),
    );

    expect(client.lastCallArgs).toBeDefined(); // layer 1 did NOT bypass the model
    expect(result.reply).toBe("Great, let's continue.");
  });

  it("a normal (non-declining) completion still proceeds unaffected by the new decline checks", async () => {
    const client = new FakeLlmChatClient({
      content: "Perfect — I've captured your request.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          }),
        },
      ],
    });
    const result = await new LLMProvider(client).generateResponse(
      request("that's everything", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);
  });
});
