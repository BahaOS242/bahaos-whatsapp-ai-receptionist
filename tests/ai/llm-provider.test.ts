import { describe, expect, it } from "vitest";
import { LLMProvider, MalformedLlmResponseError } from "../../src/ai/providers/llm-provider";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { HELD_SLOT_BUSINESS } from "./fixtures/deterministic-scenarios";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProviderRequest } from "../../src/ai/types";

/** Test double — no network, no API key, fully deterministic. */
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

describe("LLMProvider — prompt construction (mocked client)", () => {
  it("includes business info, services, and policies in the system prompt", async () => {
    const client = new FakeLlmChatClient({ content: "We're open weekdays.", toolCalls: [] });
    const provider = new LLMProvider(client);

    await provider.generateResponse(request("What are your hours?"));

    expect(client.lastCallArgs?.systemPrompt).toContain(BAHAMAS_DENTAL_SERVICE.name);
    expect(client.lastCallArgs?.systemPrompt).toContain(BAHAMAS_DENTAL_SERVICE.hours);
    for (const service of BAHAMAS_DENTAL_SERVICE.services) {
      expect(client.lastCallArgs?.systemPrompt).toContain(service.name);
    }
    expect(client.lastCallArgs?.systemPrompt).toContain(BAHAMAS_DENTAL_SERVICE.policies.insurance);
  });

  it("forwards conversation history and the current customer context", async () => {
    const client = new FakeLlmChatClient({ content: "Sure thing.", toolCalls: [] });
    const provider = new LLMProvider(client);

    await provider.generateResponse(
      request("Tuesday at 2pm", {
        customer: { name: "Sarah Combs", phone: "242-555-0199" },
        history: [
          { role: "assistant", content: "How can I help?" },
          { role: "customer", content: "I'd like to book a cleaning" },
        ],
      }),
    );

    expect(client.lastCallArgs?.systemPrompt).toContain("Sarah Combs");
    expect(client.lastCallArgs?.systemPrompt).toContain("242-555-0199");
    expect(client.lastCallArgs?.messages).toEqual([
      { role: "assistant", content: "How can I help?" },
      { role: "user", content: "I'd like to book a cleaning" },
      { role: "user", content: "Tuesday at 2pm" },
    ]);
  });
});

describe("LLMProvider — tool call parsing", () => {
  it("turns a valid request_appointment tool call into a ReceptionistAction, normalizing the phone the model reported", async () => {
    const client = new FakeLlmChatClient({
      content: "Got it, requesting that now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Sarah Combs",
            phone: "242-555-0199",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("book it please", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Sarah Combs",
          phone: "+12425550199",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Sarah Combs",
          phone: "+12425550199",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("parses an escalate tool call", async () => {
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
  });
});

describe("LLMProvider — malformed responses", () => {
  it("throws when the model returns neither text nor tool calls", async () => {
    const client = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("hello"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });

  it("throws when a tool call's arguments are not valid JSON", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [{ id: "call_1", name: "request_appointment", argumentsJson: "{not json" }],
    });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("book me in"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });

  it("throws when a tool call is missing required fields", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      // request_appointment requires phone/service/date/time too — only name given.
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({ name: "Sarah" }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("book me in"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });

  it("throws when the model calls an unknown tool name", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [{ id: "call_1", name: "delete_all_appointments", argumentsJson: "{}" }],
    });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("hello"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });
});

describe("LLMProvider — structured booking state (not prose re-parsing)", () => {
  it("includes the current booking state in the system prompt as known fact", async () => {
    const client = new FakeLlmChatClient({ content: "Great, what time works?", toolCalls: [] });
    const provider = new LLMProvider(client);

    await provider.generateResponse(
      request("Tuesday", {
        bookingState: { intent: "book_appointment", service: "Basic filling", name: "Trevor" },
      }),
    );

    expect(client.lastCallArgs?.systemPrompt).toContain("service: Basic filling");
    expect(client.lastCallArgs?.systemPrompt).toContain("name: Trevor");
  });

  it("captures customer-provided fields via deterministic extraction from the raw message, not via update_booking_progress", async () => {
    const client = new FakeLlmChatClient({
      content: "Got it, Trevor — perfect, you're all set to confirm.",
      toolCalls: [], // no update_booking_progress needed; intent was already known
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Trevor, +1 242 801 2847", {
        bookingState: {
          intent: "book_appointment",
          service: "Basic filling",
          date: "Tuesday",
          time: "14:00",
        },
      }),
    );

    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Basic filling",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    });
    expect(result.actions).toEqual([]);
  });

  it("clears booking state (except bookingJustCompleted) once a completing action (request_appointment) fires", async () => {
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
            preferredTime: "14:00",
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
          time: "14:00",
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(result.bookingState).toEqual({
      bookingJustCompleted: true,
      lastCompletedBooking: {
        intent: "book_appointment",
        service: "Basic filling",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: "+12428012847",
      },
    });
  });

  it("throws on a malformed update_booking_progress call rather than silently dropping it", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [{ id: "call_1", name: "update_booking_progress", argumentsJson: "{not json" }],
    });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("Tuesday"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });
});

describe("LLMProvider — pendingAction (structured yes/no confirmation)", () => {
  it("surfaces a persisted pendingAction in the system prompt, not left for the model to infer from history", async () => {
    const client = new FakeLlmChatClient({
      content: "Great, what day and time works?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    await provider.generateResponse(
      request("yes", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(client.lastCallArgs?.systemPrompt).toContain("pendingAction: confirm_service");
  });

  it("a pendingAction reported via update_booking_progress has no effect — it's computed by the application, never trusted from the model", async () => {
    const client = new FakeLlmChatClient({
      content: "Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?",
      toolCalls: [
        {
          id: "call_1",
          name: "update_booking_progress",
          // service/pendingAction are outside the schema now and simply
          // ignored — only intent is read from this call.
          argumentsJson: JSON.stringify({
            intent: "book_appointment",
            service: "Routine cleaning",
            pendingAction: "confirm_service",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("I want a cleaning"));

    // service IS captured here — but via deterministic extraction reading
    // "I want a cleaning" directly, not via the model's (ignored) report.
    // Not everything required is known yet (no date/time/name/phone), so
    // the application correctly does NOT set pendingAction, regardless of
    // what the model reported for it.
    expect(result.bookingState.pendingAction).toBeUndefined();
    expect(result.bookingState.service).toBe("Routine cleaning");
  });

  it("pendingAction clears the moment the booking is no longer fully known — computed fresh every turn, not reasserted/omitted by the model", async () => {
    // A held slot means the previously-complete booking becomes
    // incomplete again once time is cleared by the availability
    // rejection — pendingAction must clear along with it.
    const client = new FakeLlmChatClient({
      content: "Booked!",
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
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("book it", {
        business: {
          ...BAHAMAS_DENTAL_SERVICE,
          unavailableSlots: [{ date: "Tuesday", time: "14:00" }],
        },
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

    expect(result.bookingState.pendingAction).toBeUndefined();
    expect(result.bookingState.time).toBeUndefined();
    expect(result.bookingState.date).toBe("Tuesday");
  });

  it("clears pendingAction along with the rest of the state once a completing action fires", async () => {
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
  });
});

describe("LLMProvider — business hours are application-authoritative, not model-trusted", () => {
  it("drops an out-of-hours request_appointment tool call and rejects it, even though the model proposed it", async () => {
    const client = new FakeLlmChatClient({
      content: "Perfect, you're all set for 6pm!", // the model's optimistic (wrong) reply
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "18:00", // after 17:00 close
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
          time: "18:00",
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    // The action is never returned — the model's proposal is discarded,
    // not merely flagged.
    expect(result.actions).toEqual([]);
    // The model's optimistic reply is never forwarded.
    expect(result.reply).not.toContain("Perfect, you're all set");
    expect(result.reply).toMatch(/outside our hours/i);

    // Everything except date/time survives.
    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Basic filling",
      name: "Trevor",
      phone: "+12428012847",
    });
  });

  it("drops a closed-day request_appointment tool call and explains why", async () => {
    const client = new FakeLlmChatClient({
      content: "Booked for Sunday!",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Sunday",
            preferredTime: "15:00",
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
          date: "Sunday",
          time: "15:00",
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(result.actions).toEqual([]);
    expect(result.reply).toMatch(/closed on sundays/i);
  });

  it("includes the structured weekly hours in the system prompt as informational context", async () => {
    const client = new FakeLlmChatClient({ content: "Sure.", toolCalls: [] });
    const provider = new LLMProvider(client);

    await provider.generateResponse(request("hi"));

    expect(client.lastCallArgs?.systemPrompt).toContain("Tuesday: 09:00–17:00");
    expect(client.lastCallArgs?.systemPrompt).toContain("Sunday: closed");
    expect(client.lastCallArgs?.systemPrompt).toMatch(/application independently validates/i);
  });
});

describe("LLMProvider — REGRESSION: intent no longer depends on update_booking_progress", () => {
  // Live finding (Anthropic evaluation, claude-haiku-4-5-20251001): the
  // model called update_booking_progress on some opening messages but not
  // others, despite near-identical intent — when skipped, intent never
  // got set, nextRequiredField stayed undefined for the rest of the
  // conversation, and date/time extraction (gated on nextRequiredField)
  // never engaged even though the customer stated everything clearly.
  it("a full booking completes even though the model NEVER calls update_booking_progress on any turn", async () => {
    // Every scripted reply below is plain conversational text with no
    // update_booking_progress tool call at all — mirrors exactly what was
    // observed live. Only the final turn calls a real tool
    // (request_appointment), matching a well-behaved model that simply
    // never bothers reporting intent explicitly.
    let turn = 0;
    const replies: LlmChatResult[] = [
      { content: "Sure! What day and time works for you?", toolCalls: [] },
      { content: "Could I get your name?", toolCalls: [] },
      {
        content: "Perfect — I'll submit that now.",
        toolCalls: [
          {
            id: "call_1",
            name: "request_appointment",
            argumentsJson: JSON.stringify({
              name: "Trevor",
              phone: "2428012847",
              service: "Routine cleaning",
              preferredDate: "Tuesday",
              preferredTime: "14:00",
            }),
          },
        ],
      },
    ];
    const client = new FakeLlmChatClient(() => replies[Math.min(turn++, replies.length - 1)]);
    const provider = new LLMProvider(client);

    // Turn 1: "I want a cleaning" — no book/schedule/appointment keyword,
    // no update_booking_progress call, yet intent AND service must both
    // land deterministically (see message-field-extraction.ts).
    const t1 = await provider.generateResponse(request("I want a cleaning"));
    expect(t1.bookingState).toEqual({ intent: "book_appointment", service: "Routine cleaning" });

    const t2 = await provider.generateResponse(
      request("Tuesday 2pm", { bookingState: t1.bookingState }),
    );
    expect(t2.bookingState).toMatchObject({ date: "Tuesday", time: "14:00" });

    // The model attempts request_appointment as soon as every field is
    // known — but Objective 2's hard confirmation gate blocks it: no
    // confirmation was pending BEFORE this turn, so the application never
    // trusts the model's own judgment on when to finalize. The customer
    // sees the confirm-and-summarize prompt instead of a completed
    // booking.
    const t3 = await provider.generateResponse(
      request("Trevor 2428012847", { bookingState: t2.bookingState }),
    );
    expect(t3.actions).toEqual([]);
    expect(t3.bookingState.pendingAction).toBe("confirm_service");
    expect(t3.reply).toMatch(/reply yes to confirm/i);

    // Only an explicit "yes" to that exact pending confirmation actually
    // books it.
    const t4 = await provider.generateResponse(request("yes", { bookingState: t3.bookingState }));
    expect(t4.actions).toEqual([
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
    expect(t4.bookingState).toEqual({
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

  it("does not infer booking intent from a bare service mention with no lead-in phrase, so a price question doesn't get nudged toward booking", async () => {
    const client = new FakeLlmChatClient({
      content: "A routine cleaning is B$125 and takes about 60 minutes.",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("how much is a cleaning?"));

    expect(result.bookingState.intent).toBeUndefined();
  });
});

describe("LLMProvider — REGRESSION: time normalization before hours/availability validation", () => {
  // Live finding (Anthropic evaluation): the model reported preferredTime
  // as "2:00 PM" instead of the canonical "14:00". Business-hours
  // validation's strict "HH:MM" parser silently failed to parse it and
  // fell through to a misleading "outside our hours" rejection — even
  // though 2:00 PM is well within the 9:00-5:00 business hours.
  it("normalizes a non-canonical '2:00 PM' preferredTime instead of falsely rejecting it as outside hours", async () => {
    const client = new FakeLlmChatClient({
      content: "Great, submitting that now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "2:00 PM", // non-canonical — the exact live failure
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("yes", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00", // canonical form already tracked/pending
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(result.reply).not.toMatch(/outside our hours/i);
    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "14:00", // normalized to canonical 24-hour form
        },
      },
    ]);
  });

  it("normalizes '6pm' the same way for request_reschedule's newPreferredTime", async () => {
    const client = new FakeLlmChatClient({
      content: "Submitting that now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_reschedule",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            newPreferredDate: "Wednesday",
            newPreferredTime: "6pm", // after close — should be rejected on HOURS, not silently mis-parsed
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("yes", {
        bookingState: {
          intent: "reschedule_appointment",
          date: "Wednesday",
          time: "18:00", // canonical form already tracked/pending
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    // Correctly normalized to 18:00, THEN correctly rejected for being
    // after close — proving normalization feeds real hours validation
    // rather than bypassing it.
    expect(result.actions).toEqual([]);
    expect(result.reply).toMatch(/outside our hours/i);
  });

  it("rejects a genuinely invalid/ambiguous preferredTime rather than guessing", async () => {
    const client = new FakeLlmChatClient({
      content: "Submitting that now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "afternoon", // ambiguous — must never be guessed
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Tuesday afternoon", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );

    expect(result.actions).toEqual([]);
    expect(result.reply).toMatch(/that time doesn't look valid/i);
  });
});

describe("LLMProvider — provider failure", () => {
  it("propagates a rejected chat call rather than swallowing it", async () => {
    const client: LlmChatClient = {
      chat: async () => {
        throw new Error("network error");
      },
    };
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("hello"))).rejects.toThrow("network error");
  });
});

describe("LLMProvider — REGRESSION: duplicate-booking protection", () => {
  // Live finding (Anthropic evaluation): after a booking successfully
  // completed (bookingState reset), a later "yes" caused the model to
  // hallucinate a SECOND request_appointment call reconstructed from raw
  // conversation history — which succeeded, creating a genuine duplicate
  // submission. This is the fix: bookingJustCompleted is deterministic
  // proof a booking was just made, and blocks any further completing
  // action until a NEW intent is established — never dependent on the
  // model remembering it already booked something.
  it("a completing action leaves bookingJustCompleted set instead of a full {} reset", async () => {
    const client = new FakeLlmChatClient({
      content: "Submitting that now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          }),
        },
      ],
    });
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

    expect(result.actions).toHaveLength(1);
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
  });

  it("a hallucinated repeat request_appointment on a later 'yes' is blocked deterministically — never creates a second appointment", async () => {
    const client = new FakeLlmChatClient({
      content: "Sure — I've gone ahead and booked that for you again!",
      toolCalls: [
        {
          id: "call_2",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    // bookingJustCompleted is set (as it would be immediately after the
    // real completion), no active intent, customer just says "yes" again.
    const result = await provider.generateResponse(
      request("yes", { bookingState: { bookingJustCompleted: true } }),
    );

    expect(result.actions).toEqual([]); // the hallucinated action is dropped, never returned to the agent
    expect(result.reply).toMatch(/already been submitted/i);
    expect(result.bookingState).toEqual({ bookingJustCompleted: true }); // still armed
  });

  it("the guard does not block a genuinely NEW booking once a fresh intent is deterministically established", async () => {
    const client = new FakeLlmChatClient({
      content: "Great — what service would you like this time?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    // "book" keyword deterministically re-establishes intent even though
    // bookingJustCompleted is still set from the prior booking.
    const result = await provider.generateResponse(
      request("I'd like to book another appointment", {
        bookingState: { bookingJustCompleted: true },
      }),
    );

    expect(result.bookingState.intent).toBe("book_appointment");
    expect(result.bookingState.bookingJustCompleted).toBeUndefined();
  });

  it("REGRESSION (found via live rerun): reportedIntent alone does NOT disarm the guard, even when the model calls update_booking_progress in the SAME response as a hallucinated repeat action", async () => {
    // This reproduces the exact live failure: an earlier version of the
    // guard also checked `!reportedIntent`, and Claude called
    // update_booking_progress(book_appointment) "out of habit" (per its
    // own system-prompt instructions) in the very same response as a
    // hallucinated repeat request_appointment — which let the duplicate
    // through. Both tool calls are scripted here, in the same order a
    // real model produced them.
    const client = new FakeLlmChatClient({
      content: "Perfect — I've submitted that for you again.",
      toolCalls: [
        {
          id: "call_progress",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({ intent: "book_appointment" }),
        },
        {
          id: "call_repeat",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("yes", { bookingState: { bookingJustCompleted: true } }),
    );

    expect(result.actions).toEqual([]); // the duplicate is dropped despite the update_booking_progress call
    expect(result.reply).toMatch(/already been submitted/i);
    // Still armed for the NEXT turn too — reportedIntent must not have
    // leaked `intent` into the persisted state either, or a THIRD
    // hallucinated attempt would silently slip past the guard next time.
    expect(result.bookingState).toEqual({ bookingJustCompleted: true });
  });
});

describe("LLMProvider — REGRESSION: hallucinated completion protection", () => {
  // Live finding (Anthropic evaluation, scenario 7): the model told the
  // customer "I've captured your request for a routine cleaning on
  // Tuesday at 2:00 PM. A team member will confirm your appointment
  // shortly" without ever calling request_appointment at all — no action
  // was proposed that turn. Nothing in the existing rejection checks
  // catches this, since there was no action to reject. This is the fix:
  // prose is never trusted as proof of a booking on its own.
  it("overrides prose that claims a completion when no completing action was actually proposed", async () => {
    const client = new FakeLlmChatClient({
      content:
        "I've captured your request for a routine cleaning on Tuesday at 2:00 PM. A team member will confirm your appointment shortly.",
      toolCalls: [], // no request_appointment call at all — the exact live failure
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Trevor 2428012847", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
        },
      }),
    );

    expect(result.actions).toEqual([]);
    expect(result.reply).not.toMatch(/i've captured your request/i);
    // Application-composed, accurate: everything's known, so it poses the
    // real confirm prompt instead of falsely claiming completion.
    expect(result.reply).toMatch(/reply yes to confirm/i);
  });

  it("does NOT override prose when a real completing action WAS proposed alongside it (the normal, correct case)", async () => {
    const client = new FakeLlmChatClient({
      content: "Perfect, Trevor! I've captured your request — submitting it now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    // Deliberately NOT "yes"/"go ahead"/etc — those trigger the app's own
    // auto-confirm bypass (buildAutoConfirmToolCall), which never
    // consults the model at all, defeating this test's actual purpose:
    // proving that when the MODEL is genuinely consulted and proposes a
    // real, correctly-confirmed completing action WITH accompanying
    // prose, that prose is preserved rather than overridden.
    const result = await provider.generateResponse(
      request("book it please", {
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

    expect(result.actions).toHaveLength(1);
    expect(result.reply).toBe("Perfect, Trevor! I've captured your request — submitting it now.");
  });

  it("does NOT flag legitimate in-progress language ('let me submit this now') as a hallucinated completion", async () => {
    const client = new FakeLlmChatClient({
      content: "Great, let me submit this for you now.",
      toolCalls: [], // still no action this turn — e.g. the model is about to ask a follow-up
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Trevor 2428012847", {
        bookingState: { intent: "book_appointment", service: "Routine cleaning" },
      }),
    );

    // Not past-tense/completed phrasing, so it's trusted as-is.
    expect(result.reply).toBe("Great, let me submit this for you now.");
  });
});

describe("LLMProvider — REGRESSION (Scenario 7): unavailable-slot recovery at the application/state level", () => {
  // Live finding (Anthropic evaluation, Scenario 7): after an unavailable-
  // slot rejection offers alternatives, the held 14:00 was never actually
  // booked (no action ever succeeded to trigger the existing availability-
  // rejection clearing), so it persisted in bookingState looking
  // "complete" — nextRequiredField reported nothing missing,
  // pendingAction was already "confirm_service". A bare "9am" (the
  // customer directly answering the offered alternative) matched neither
  // AFFIRMATIVE_RE/NEGATIVE_RE nor a correction marker, so it reached the
  // model with a system prompt STILL showing the stale held time as
  // "confirmed" — observed live, the model asked "are you asking to
  // change your appointment..." instead of recognizing the answer. This
  // is the fix, at the deterministic extraction layer (see
  // message-field-extraction.ts's hasStaleInvalidSlot), verified
  // end-to-end through the real LLMProvider here.
  const HELD_SLOT_STATE_BEFORE = {
    intent: "book_appointment" as const,
    service: "Routine cleaning",
    date: "Tuesday",
    time: "14:00", // held under HELD_SLOT_BUSINESS
    name: "Trevor",
    phone: "+12428012847",
    pendingAction: "confirm_service" as const,
  };

  it("a bare '9am' reply corrects the held time at the STATE level even if the model doesn't call any tool", async () => {
    // Mirrors exactly what was observed live: the model just asks a
    // question, no tool call at all — proving the fix works independent
    // of the model's own behavior, at the application/state level.
    const client = new FakeLlmChatClient({
      content: "Great — Tuesday at 9:00 AM works. Shall I go ahead and submit that?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("9am", { business: HELD_SLOT_BUSINESS, bookingState: HELD_SLOT_STATE_BEFORE }),
    );

    expect(result.bookingState.time).toBe("09:00");
    expect(result.bookingState.date).toBe("Tuesday");
  });

  it("the corrected time requires a FRESH confirmation (the old one never authorizes it), and only THEN completes", async () => {
    // "9am" is a material change from the previously-pending 14:00 — even
    // though the model still tries request_appointment in the SAME turn,
    // Objective 2's hard gate blocks it: the old confirmation was for
    // 14:00, not 09:00, and must never authorize the changed booking.
    const client = new FakeLlmChatClient({
      content: "Perfect — submitting your request for 9:00 AM.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "09:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const corrected = await provider.generateResponse(
      request("9am", { business: HELD_SLOT_BUSINESS, bookingState: HELD_SLOT_STATE_BEFORE }),
    );

    expect(corrected.actions).toEqual([]);
    expect(corrected.bookingState.time).toBe("09:00");
    expect(corrected.bookingState.pendingAction).toBe("confirm_service");
    expect(corrected.reply).toMatch(/reply yes to confirm/i);
    expect(corrected.reply).not.toMatch(/2:00 pm/i); // never shows the stale, no-longer-pending time

    // Only an explicit "yes" to the NEW confirmation actually books it.
    const result = await provider.generateResponse(
      request("yes", { business: HELD_SLOT_BUSINESS, bookingState: corrected.bookingState }),
    );

    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "09:00",
        },
      },
    ]);
    expect(result.bookingState).toEqual({
      bookingJustCompleted: true,
      lastCompletedBooking: {
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "09:00",
        name: "Trevor",
        phone: "+12428012847",
      },
    });
  });

  it("PRESERVED SAFETY: the held slot itself can never be booked, even if the model still proposes it", async () => {
    const client = new FakeLlmChatClient({
      content: "Booking that now!",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00", // still held
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("book 2pm anyway", { business: HELD_SLOT_BUSINESS, bookingState: HELD_SLOT_STATE_BEFORE }),
    );

    expect(result.actions).toEqual([]);
    expect(result.reply).toMatch(/already booked/i);
  });
});

describe("LLMProvider — REGRESSION (Scenarios 4/5): post-completion correction converts to a reschedule flow", () => {
  // Root cause traced live (Anthropic evaluation): after a booking
  // completes, bookingState resets to {bookingJustCompleted: true} —
  // nothing else survives. A correction on the very next turn ("actually,
  // Wednesday instead") had no intent to attach to and no identifying
  // info (name/phone) to act on even if it did — the correction was
  // silently swallowed (the model got a blank/generic reply, or
  // hallucinated an "update" that never touched application state at
  // all). This is the fix, verified end-to-end here.
  const JUST_COMPLETED_STATE = {
    bookingJustCompleted: true as const,
    lastCompletedBooking: {
      intent: "book_appointment" as const,
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
    },
  };

  it("a date-only correction starts a reschedule flow with everything needed to confirm, even if the model calls no tool", async () => {
    const client = new FakeLlmChatClient({
      content: "Sure — Wednesday at 2:00 PM works. Shall I go ahead and reschedule it?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("actually can we do Wednesday instead", { bookingState: JUST_COMPLETED_STATE }),
    );

    expect(result.bookingState).toEqual({
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      date: "Wednesday",
      time: "14:00", // carried over — not restated
      pendingAction: "confirm_service",
    });
  });

  it("a time-only correction starts a reschedule flow, keeping the original date", async () => {
    const client = new FakeLlmChatClient({ content: "Got it — 3pm instead.", toolCalls: [] });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("actually make it 3pm not 2pm", { bookingState: JUST_COMPLETED_STATE }),
    );

    expect(result.bookingState).toEqual({
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      date: "Tuesday", // carried over — not restated
      time: "15:00",
      pendingAction: "confirm_service",
    });
  });

  it("a follow-up 'yes' auto-confirms into a real request_reschedule action, completing the flow with no model call needed", async () => {
    const client = new FakeLlmChatClient({
      content: "unused — auto-confirm should bypass the model entirely",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const turn1 = await provider.generateResponse(
      request("actually can we do Wednesday instead", { bookingState: JUST_COMPLETED_STATE }),
    );
    const turn2 = await provider.generateResponse(
      request("yes", { bookingState: turn1.bookingState }),
    );

    expect(turn2.actions).toEqual([
      {
        type: "request_reschedule",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          newPreferredDate: "Wednesday",
          newPreferredTime: "14:00",
        },
      },
    ]);
    expect(turn2.bookingState.bookingJustCompleted).toBe(true);
    expect(turn2.bookingState.lastCompletedBooking).toEqual({
      intent: "reschedule_appointment",
      date: "Wednesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
    });
  });

  it("the new reschedule action is NOT blocked by the duplicate-booking guard, since a fresh intent was deterministically established", async () => {
    // The correction turn establishes the fresh reschedule intent and
    // pending confirmation (see "a date-only correction..." above) but
    // must not itself complete anything — Objective 2's hard gate. Once
    // that confirmation is genuinely pending, a model-proposed
    // request_reschedule matching it must go through: the duplicate
    // guard exists to block a hallucinated REPEAT of the SAME
    // already-completed booking, not a legitimate new reschedule request
    // that was properly confirmed.
    const correctionClient = new FakeLlmChatClient({
      content: "Sure — Wednesday at 2:00 PM works. Shall I go ahead and reschedule it?",
      toolCalls: [],
    });
    const correction = await new LLMProvider(correctionClient).generateResponse(
      request("actually can we do Wednesday instead", { bookingState: JUST_COMPLETED_STATE }),
    );
    expect(correction.actions).toEqual([]);
    expect(correction.bookingState.pendingAction).toBe("confirm_service");

    const client = new FakeLlmChatClient({
      content: "Rescheduling that now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_reschedule",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            newPreferredDate: "Wednesday",
            newPreferredTime: "14:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("yes", { bookingState: correction.bookingState }),
    );

    expect(result.actions).toEqual([
      {
        type: "request_reschedule",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          newPreferredDate: "Wednesday",
          newPreferredTime: "14:00",
        },
      },
    ]);
  });

  it("PRESERVED SAFETY (and IMPROVED — see Final V1 Hardening): an out-of-hours reschedule correction is rejected immediately, not just discovered later on 'yes'", async () => {
    const client = new FakeLlmChatClient({
      content: "unused — the confirmation-prompt hours check should reject this before the model is ever consulted",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const turn1 = await provider.generateResponse(
      request("actually make it 6pm instead", { bookingState: JUST_COMPLETED_STATE }),
    );
    // Genuine defect found live during Final V1 Hardening: this USED to
    // report pendingAction: "confirm_service" here — looking "ready to
    // confirm" — even though 6pm is genuinely outside business hours,
    // only discovering that later once "yes" triggered an actual
    // completing-action attempt. A customer would see a confirmation
    // prompt claiming an invalid time was ready to book, then get
    // rejected on "yes" — never a false BOOKING claim, but a misleading,
    // wasted round-trip. Fixed: the confirmation-presenting step now
    // validates hours FIRST, the same way the recurring-scheduling path
    // already validates every occurrence before ever presenting a
    // confirmation.
    expect(turn1.bookingState.pendingAction).toBeUndefined();
    expect(turn1.reply).toMatch(/outside our hours/i);
    expect(turn1.actions).toEqual([]);

    // A "yes" on this (correctly non-pending) state still can't book
    // anything — belt-and-suspenders, same hard gate as always.
    const turn2 = await provider.generateResponse(request("yes", { bookingState: turn1.bookingState }));
    expect(turn2.actions).toEqual([]);
  });
});

describe("LLMProvider — REGRESSION (Phase 1): duplicate-booking guard also catches an action-type/intent mismatch", () => {
  // Live finding: a post-completion time correction ("actually make it
  // 3pm not 2pm") deterministically produces intent: "reschedule_appointment"
  // (see detectPostCompletionReschedule) — but the model, on that same
  // turn, called request_appointment instead of request_reschedule. The
  // original duplicate-booking guard only checked "is there ANY fresh
  // intent," not "does the proposed action type actually match it," so
  // this succeeded — creating a SECOND, separate appointment record for
  // the SAME correction, rather than modifying the original booking.
  const JUST_COMPLETED_STATE = {
    bookingJustCompleted: true as const,
    lastCompletedBooking: {
      intent: "book_appointment" as const,
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
    },
  };

  it("blocks request_appointment when the freshly-established intent is reschedule_appointment — never creates a second appointment", async () => {
    const client = new FakeLlmChatClient({
      content: "Got it — I'll update that to 3:00 PM on Tuesday instead.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment", // wrong — should be request_reschedule
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
      request("actually make it 3pm not 2pm", { bookingState: JUST_COMPLETED_STATE }),
    );

    expect(result.actions).toEqual([]); // the mismatched action is dropped, never returned to the agent
    // The model's own (unsubstantiated) claim is discarded in favor of
    // the accurate, application-composed confirm prompt.
    expect(result.reply).not.toMatch(/i'll update/i);
    expect(result.reply).toMatch(/reply yes to confirm the reschedule/i);
    expect(result.bookingState).toEqual({
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      date: "Tuesday",
      time: "15:00",
      pendingAction: "confirm_service",
    });
  });

  it("a follow-up 'yes' after the block correctly auto-confirms into request_reschedule (the RIGHT action type), completing the flow", async () => {
    const turn1Client = new FakeLlmChatClient({
      content: "Got it — I'll update that to 3:00 PM on Tuesday instead.",
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
    const turn1 = await new LLMProvider(turn1Client).generateResponse(
      request("actually make it 3pm not 2pm", { bookingState: JUST_COMPLETED_STATE }),
    );

    const turn2Client = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const turn2 = await new LLMProvider(turn2Client).generateResponse(
      request("yes", { bookingState: turn1.bookingState }),
    );

    expect(turn2Client.lastCallArgs).toBeUndefined(); // auto-confirm bypassed the model entirely
    expect(turn2.actions).toEqual([
      {
        type: "request_reschedule",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          newPreferredDate: "Tuesday",
          newPreferredTime: "15:00",
        },
      },
    ]);
  });

  it("the matching action type (request_reschedule) still goes through normally — the guard only blocks a MISMATCH, not the correct action", async () => {
    const correctionClient = new FakeLlmChatClient({ content: "Got it — 3pm instead.", toolCalls: [] });
    const correction = await new LLMProvider(correctionClient).generateResponse(
      request("actually make it 3pm not 2pm", { bookingState: JUST_COMPLETED_STATE }),
    );
    expect(correction.actions).toEqual([]);
    expect(correction.bookingState.pendingAction).toBe("confirm_service");

    const client = new FakeLlmChatClient({
      content: "Rescheduling that now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_reschedule",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            newPreferredDate: "Tuesday",
            newPreferredTime: "15:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("yes", { bookingState: correction.bookingState }),
    );

    expect(result.actions).toEqual([
      {
        type: "request_reschedule",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          newPreferredDate: "Tuesday",
          newPreferredTime: "15:00",
        },
      },
    ]);
  });
});

describe("LLMProvider — REGRESSION (Objective 3): a pending confirmation of one action type can never authorize a DIFFERENT action type", () => {
  // Through the REAL LLMProvider, not just the isolated gate function —
  // proves the wiring, not only the logic. A hallucinating (or confused)
  // model that proposes the WRONG completing action type while a
  // confirmation for something else is pending must be blocked exactly
  // like an unconfirmed action would be, regardless of whether the
  // fields happen to line up.
  it("a pending BOOKING confirmation does not authorize request_cancellation, even with matching name/phone", async () => {
    const client = new FakeLlmChatClient({
      content: "Understood — cancelling that for you now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_cancellation",
          argumentsJson: JSON.stringify({ name: "Trevor", phone: "2428012847" }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("cancel it", {
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

    expect(result.actions).toEqual([]);
    expect(result.reply).not.toMatch(/cancelling that/i);
    expect(result.reply).toMatch(/reply yes to confirm the booking/i);
  });

  it("a pending RESCHEDULE confirmation does not authorize request_appointment, even with matching name/phone/date/time", async () => {
    const client = new FakeLlmChatClient({
      content: "Perfect — booking that as a new appointment.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "2428012847",
            service: "Routine cleaning",
            preferredDate: "Wednesday",
            preferredTime: "10:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("book it", {
        bookingState: {
          intent: "reschedule_appointment",
          date: "Wednesday",
          time: "10:00",
          name: "Trevor",
          phone: "+12428012847",
          pendingAction: "confirm_service",
        },
      }),
    );

    expect(result.actions).toEqual([]);
    expect(result.reply).not.toMatch(/booking that as a new appointment/i);
    expect(result.reply).toMatch(/reply yes to confirm the reschedule/i);
  });
});

describe("LLMProvider — REGRESSION (Objective 4): genuinely-unclear turns escalate after repeated confusion, never book anything", () => {
  // "Genuinely unclear" here means the model returned NO text at all
  // (result.content === null) and nothing it did (if anything)
  // established an intent, completed an action, or escalated — the one
  // narrow, deterministic signal the application can trust without
  // trying to classify the model's own prose. A single such turn still
  // gets one honest "could you say that again?" — only the SECOND
  // CONSECUTIVE one escalates.
  function unclearReply(): LlmChatResult {
    // A non-establishing, non-completing, non-escalating tool call —
    // content: null with toolCalls: [] would throw MalformedLlmResponseError
    // instead (a different, already-covered case), so this uses
    // create_lead (which never sets bookingState.intent) to reach the
    // "nothing happened" branch without an empty response.
    return {
      content: null,
      toolCalls: [{ id: "c1", name: "create_lead", argumentsJson: JSON.stringify({ name: "Trevor" }) }],
    };
  }

  it("a single unclear turn asks the customer to repeat themselves — no escalation yet", async () => {
    const client = new FakeLlmChatClient(unclearReply());
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("asdkjfh??"));

    expect(result.reply).toBe("Sorry, could you say that again?");
    expect(result.actions.some((a) => a.type === "escalate")).toBe(false);
    expect(result.bookingState.unclearTurnCount).toBe(1);
  });

  it("a SECOND consecutive unclear turn escalates instead of repeating the same question again", async () => {
    const client = new FakeLlmChatClient(unclearReply());
    const provider = new LLMProvider(client);

    const first = await provider.generateResponse(request("asdkjfh??"));
    const second = await provider.generateResponse(
      request("qwoeiru", { bookingState: first.bookingState }),
    );

    expect(second.reply).not.toBe("Sorry, could you say that again?");
    expect(second.reply).toMatch(/connect you with a member of our team/i);
    // The escalate action is appended alongside whatever else the model
    // proposed this turn (here, the scripted create_lead call) — never
    // instead of it.
    expect(second.actions).toContainEqual({
      type: "escalate",
      payload: {
        reason: "customer's messages could not be understood after repeated attempts",
        unresolvedQuestion: "qwoeiru",
      },
    });
    // The counter itself is cleared, not left dangling for the next
    // (now-escalated) conversation.
    expect(second.bookingState.unclearTurnCount).toBeUndefined();
  });

  it("a turn that makes real progress in between resets the counter — no escalation on a later unclear turn", async () => {
    const client = new FakeLlmChatClient(unclearReply());
    const provider = new LLMProvider(client);

    const first = await provider.generateResponse(request("asdkjfh??"));
    expect(first.bookingState.unclearTurnCount).toBe(1);

    // A real, understood message in between.
    const progressClient = new FakeLlmChatClient({
      content: "Sure! What day and time works for you?",
      toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: JSON.stringify({ intent: "book_appointment" }) }],
    });
    const progress = await new LLMProvider(progressClient).generateResponse(
      request("I want a cleaning", { bookingState: first.bookingState }),
    );
    expect(progress.bookingState.unclearTurnCount).toBeUndefined();

    // Another unclear turn now — this is only the FIRST unclear turn
    // again (the counter was reset), so it must not escalate.
    const third = await provider.generateResponse(
      request("asdkjfh??", { bookingState: progress.bookingState }),
    );
    expect(third.actions.some((a) => a.type === "escalate")).toBe(false);
  });

  it("legitimate, repeated FAQ questions never count as 'unclear', even asked many times in a row", async () => {
    // The model DOES produce real text every time (a real FAQ answer) —
    // isGenuinelyUnclear requires result.content === null, so this can
    // never fire regardless of how many times it happens.
    const client = new FakeLlmChatClient({
      content: "We're open Monday through Friday, 9 AM to 5 PM.",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    let bookingState = {};
    for (let i = 0; i < 4; i++) {
      const result = await provider.generateResponse(request("what are your hours?", { bookingState }));
      expect(result.actions.some((a) => a.type === "escalate")).toBe(false);
      bookingState = result.bookingState;
    }
  });
});
