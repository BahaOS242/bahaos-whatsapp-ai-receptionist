import { describe, expect, it } from "vitest";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProviderRequest, BookingState, ConversationTurn } from "../../src/ai/types";

/**
 * Regression coverage for the reported bug: "no" to a presented
 * confirmation, followed by a bare restatement of the correction (no
 * "actually"/"instead" marker), left the OLD, declined value sitting in
 * BookingState. Because pendingAction is recomputed purely from field
 * completeness every turn (see applyPendingAction/computePendingAction),
 * it silently re-armed on that stale value, and a later "yes" — answering
 * whatever the flow asked about the correction, not the stale pending
 * question — auto-confirmed the WRONG, stale booking.
 *
 * Root cause: message-field-extraction.ts's `hasCorrection` (LLMProvider)
 * and dev-rule-based-provider.ts's merge-loop `hasCorrectionMarker`
 * (DevRuleBasedAIProvider) both required an EXPLICIT correction marker
 * before overwriting an already-set field. A bare restatement right after
 * a decline had no marker, so it was silently ignored.
 *
 * Fix: BookingState.justDeclined — a one-turn flag set by both
 * providers' decline handling, consumed by the very next turn's
 * extraction, giving that turn's message the same overwrite license an
 * explicit marker already had. This does NOT touch the existing hard
 * confirmation gate (booking-confirmation.ts) at all — it only fixes what
 * gets extracted BEFORE that gate ever runs, so gate/duplicate-booking/
 * concurrency/hours/availability protections are all unmodified and still
 * apply exactly as before (see the other describe blocks in this file
 * for direct proof).
 */

const FULL_BOOK_STATE: BookingState = {
  intent: "book_appointment",
  service: "Root canal",
  date: "Monday",
  time: "14:00",
  name: "Trevor",
  phone: "+12428012847",
  pendingAction: "confirm_service",
};

class FakeLlmChatClient implements LlmChatClient {
  public callCount = 0;
  constructor(private readonly result: LlmChatResult | (() => LlmChatResult)) {}
  async chat(): Promise<LlmChatResult> {
    this.callCount += 1;
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

describe("Stale confirmation regression — LLMProvider", () => {
  it("reproduces the exact reported failure: decline + bare service correction, then yes, books the NEW service (not the stale one)", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);

    const declined = await provider.generateResponse(request("no", { bookingState: FULL_BOOK_STATE }));
    expect(client.callCount).toBe(0); // layer 1 decline safety net — never calls the model
    expect(declined.bookingState.pendingAction).toBeUndefined();
    expect(declined.bookingState.justDeclined).toBe(true);
    expect(declined.bookingState.service).toBe("Root canal"); // still preserved, not yet corrected

    // Bare restatement — NO "actually"/"instead" marker, exactly as reported.
    const corrected = await provider.generateResponse(
      request("a cleaning", { bookingState: declined.bookingState }),
    );
    expect(corrected.bookingState.service).toBe("Routine cleaning");
    expect(corrected.bookingState.justDeclined).toBeUndefined(); // consumed, one-shot
    // Every other field survived untouched.
    expect(corrected.bookingState.date).toBe("Monday");
    expect(corrected.bookingState.time).toBe("14:00");
    expect(corrected.bookingState.name).toBe("Trevor");
    expect(corrected.bookingState.phone).toBe("+12428012847");
    // A FRESH confirmation is required — never silently re-armed on stale data.
    expect(corrected.bookingState.pendingAction).toBe("confirm_service");

    const confirmed = await provider.generateResponse(
      request("yes", { bookingState: corrected.bookingState }),
    );
    expect(client.callCount).toBe(1); // still never called for the "yes" — auto-confirm bypass
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning", // the CORRECTED service — never "Root canal"
          preferredDate: "Monday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("date correction after confirmation: decline + bare new date, then yes, books the NEW date", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);

    const declined = await provider.generateResponse(request("no", { bookingState: FULL_BOOK_STATE }));
    const corrected = await provider.generateResponse(
      request("wednesday", { bookingState: declined.bookingState }),
    );
    expect(corrected.bookingState.date).toBe("Wednesday");
    expect(corrected.bookingState.service).toBe("Root canal"); // unrelated fields untouched
    expect(corrected.bookingState.pendingAction).toBe("confirm_service");

    const confirmed = await provider.generateResponse(
      request("yes", { bookingState: corrected.bookingState }),
    );
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Root canal",
          preferredDate: "Wednesday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("time correction after confirmation: decline + bare new time, then yes, books the NEW time", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);

    const declined = await provider.generateResponse(request("no", { bookingState: FULL_BOOK_STATE }));
    const corrected = await provider.generateResponse(
      request("3pm", { bookingState: declined.bookingState }),
    );
    expect(corrected.bookingState.time).toBe("15:00");
    expect(corrected.bookingState.pendingAction).toBe("confirm_service");

    const confirmed = await provider.generateResponse(
      request("yes", { bookingState: corrected.bookingState }),
    );
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Root canal",
          preferredDate: "Monday",
          preferredTime: "15:00",
        },
      },
    ]);
  });

  it("name correction after confirmation: decline + bare new name, then yes, books the NEW name", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);

    const declined = await provider.generateResponse(request("no", { bookingState: FULL_BOOK_STATE }));
    const corrected = await provider.generateResponse(
      request("my name is Michael", { bookingState: declined.bookingState }),
    );
    expect(corrected.bookingState.name).toBe("Michael");
    expect(corrected.bookingState.pendingAction).toBe("confirm_service");

    const confirmed = await provider.generateResponse(
      request("yes", { bookingState: corrected.bookingState }),
    );
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Michael",
          phone: "+12428012847",
          service: "Root canal",
          preferredDate: "Monday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("phone correction after confirmation: decline + bare new phone, then yes, books the NEW phone", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);

    const declined = await provider.generateResponse(request("no", { bookingState: FULL_BOOK_STATE }));
    const corrected = await provider.generateResponse(
      request("242 555 9999", { bookingState: declined.bookingState }),
    );
    expect(corrected.bookingState.phone).toBe("+12425559999");
    expect(corrected.bookingState.pendingAction).toBe("confirm_service");

    const confirmed = await provider.generateResponse(
      request("yes", { bookingState: corrected.bookingState }),
    );
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12425559999",
          service: "Root canal",
          preferredDate: "Monday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("reschedule correction: decline + bare new time, then yes, reschedules to the NEW time, never the stale one", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);

    const RESCHEDULE_STATE: BookingState = {
      intent: "reschedule_appointment",
      date: "Monday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    };

    const declined = await provider.generateResponse(request("no", { bookingState: RESCHEDULE_STATE }));
    const corrected = await provider.generateResponse(
      request("4pm", { bookingState: declined.bookingState }),
    );
    expect(corrected.bookingState.time).toBe("16:00");
    expect(corrected.bookingState.pendingAction).toBe("confirm_service");

    const confirmed = await provider.generateResponse(
      request("yes", { bookingState: corrected.bookingState }),
    );
    expect(confirmed.actions).toEqual([
      {
        type: "request_reschedule",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          newPreferredDate: "Monday",
          newPreferredTime: "16:00",
        },
      },
    ]);
  });

  it("cancellation intent after a booking confirmation: switching stays model-driven, but the hard gate still requires a FRESH confirmation before cancelling — never falls through to a stale request_appointment", async () => {
    const declined = await new LLMProvider(new FakeLlmChatClient({ content: null, toolCalls: [] })).generateResponse(
      request("no", { bookingState: FULL_BOOK_STATE }),
    );
    expect(declined.bookingState.pendingAction).toBeUndefined();

    // The model correctly reports the switch via update_booking_progress
    // (the existing, deliberate "switching stays model-driven" design —
    // see message-field-extraction.ts's intent-detection comment) but,
    // even if it ALSO tried to jump straight to request_cancellation on
    // this SAME turn, the hard gate (isConfirmedCompletingAction) must
    // reject it: request.bookingState.pendingAction is undefined here
    // (just declined), so no confirmation was pending BEFORE this turn.
    const switchClient = new FakeLlmChatClient({
      content: "Got it — you'd like to cancel instead.",
      toolCalls: [
        { id: "1", name: "update_booking_progress", argumentsJson: JSON.stringify({ intent: "cancel_appointment" }) },
        {
          id: "2",
          name: "request_cancellation",
          argumentsJson: JSON.stringify({ name: "Trevor", phone: "+12428012847" }),
        },
      ],
    });
    const provider = new LLMProvider(switchClient);
    const switched = await provider.generateResponse(
      request("actually, cancel my appointment instead", { bookingState: declined.bookingState }),
    );

    // The premature request_cancellation was dropped — never executed.
    expect(switched.actions).toEqual([]);
    expect(switched.reply).toMatch(/reply yes to confirm|reply no/i);
    expect(switched.bookingState.intent).toBe("cancel_appointment");
    // Only NOW is a fresh confirmation legitimately pending — for cancel.
    expect(switched.bookingState.pendingAction).toBe("confirm_service");

    // A subsequent "yes" auto-confirms the CANCELLATION — never the
    // stale, long-since-declined request_appointment.
    const confirmClient = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const confirmed = await new LLMProvider(confirmClient).generateResponse(
      request("yes", { bookingState: switched.bookingState }),
    );
    expect(confirmClient.callCount).toBe(0);
    expect(confirmed.actions).toEqual([
      { type: "request_cancellation", payload: { name: "Trevor", phone: "+12428012847" } },
    ]);
  });

  it("stale model payload vs newer deterministic customer state: a model call proposing OLD values is rejected by the hard gate, even when pendingAction/message don't trigger the auto-confirm bypass", async () => {
    // pendingAction is legitimately pending on "Routine cleaning" — the
    // CURRENT, correct, already-confirmed-pending state.
    const currentState: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Monday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    };

    // "book it for me" doesn't match AFFIRMATIVE_RE's anchored pattern,
    // so the auto-confirm bypass does NOT fire and the model is actually
    // consulted — where it (hallucinating from earlier conversation
    // history) proposes the OLD "Root canal" service instead of what's
    // actually pending now.
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Root canal", // STALE — not what's actually pending
            preferredDate: "Monday",
            preferredTime: "14:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);
    const result = await provider.generateResponse(request("book it for me", { bookingState: currentState }));

    expect(client.callCount).toBe(1); // the model WAS consulted this time
    // The stale-payload action never reached ReceptionistTools.
    expect(result.actions).toEqual([]);
    // The customer sees the ACCURATE, currently-pending confirmation
    // (Routine cleaning) instead — never a silent, wrong booking.
    expect(result.reply).toMatch(/routine cleaning/i);
    expect(result.reply).not.toMatch(/root canal/i);
  });

  it("REGRESSION (found live): the FIRST confirmation presented, the turn every field just became complete, is ALWAYS the application's own composeConfirmationPrompt — never the model's own (possibly wrong) narration", async () => {
    // Reproduces the exact live failure: the deterministic layer
    // correctly could not resolve "the other one" (no service name
    // literally in the message — see message-field-extraction.ts's
    // findService ambiguous-mention fix in this same pass) and
    // correctly left bookingState.service as "Basic filling". But the
    // model, despite being TOLD the true state via the system prompt,
    // confidently narrated the WRONG service in its own free-text
    // confirmation ("I'm switching that to a routine cleaning instead...
    // is that correct?"). A customer saying "yes" to that text would be
    // confirming a cleaning while the app books a filling — a real,
    // serious mismatch between what's shown and what's confirmed.
    const client = new FakeLlmChatClient({
      content:
        "Perfect! I've got everything I need. Let me confirm: you'd like to book a routine cleaning on Tuesday at 2:00 PM under the name Trevor. Is that correct?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    // Going into this turn, every field EXCEPT name/phone was already
    // known (service = "Basic filling", the correct, preserved value);
    // this message supplies the last two fields, completing the booking
    // for the FIRST time this conversation.
    const result = await provider.generateResponse(
      request("trevor, 2428012847", {
        bookingState: {
          intent: "book_appointment",
          service: "Basic filling",
          date: "Tuesday",
          time: "14:00",
        },
      }),
    );

    expect(client.callCount).toBe(1); // the model WAS consulted
    expect(result.bookingState.pendingAction).toBe("confirm_service");
    // The model's own wrong narration is NEVER what the customer sees.
    expect(result.reply).not.toMatch(/routine cleaning/i);
    expect(result.reply).toMatch(/basic filling/i);
    expect(result.reply).toMatch(/reply yes to confirm/i);

    // And "yes" on THIS (accurate) state books the CORRECT service.
    const confirmClient = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const confirmed = await new LLMProvider(confirmClient).generateResponse(
      request("yes", { bookingState: result.bookingState }),
    );
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Basic filling",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);
  });
});

describe("Stale confirmation regression — DevRuleBasedAIProvider (exact reported conversation shape)", () => {
  async function runTurns(messages: string[]) {
    const provider = new DevRuleBasedAIProvider();
    const conversationManager = new ConversationManager();
    const history: ConversationTurn[] = [];
    const results: Awaited<ReturnType<DevRuleBasedAIProvider["generateResponse"]>>[] = [];

    for (const message of messages) {
      const req = conversationManager.buildRequest({
        business: BAHAMAS_DENTAL_SERVICE,
        customer: {},
        history,
        message,
      });
      const result = await provider.generateResponse(req);
      results.push(result);
      history.push(
        { role: "customer", content: message },
        { role: "assistant", content: result.reply },
      );
      conversationManager.setBookingState(result.bookingState);
    }
    return results;
  }

  it("reproduces the exact reported failure: root canal -> decline -> bare 'a cleaning' -> yes books the cleaning", async () => {
    const results = await runTurns([
      "i want to book a root canal",
      "monday 2pm",
      "Trevor 12428012847",
      "no", // decline the presented confirmation
      "a cleaning", // bare restatement, no "actually"/"instead"
      "yes",
    ]);

    const [, , confirming, declined, corrected, confirmed] = results;
    expect(confirming.reply).toMatch(/reply yes to confirm/i);
    expect(declined.bookingState.pendingAction).toBeUndefined();
    expect(declined.bookingState.justDeclined).toBe(true);

    expect(corrected.bookingState.service).toBe("Routine cleaning");
    expect(corrected.bookingState.pendingAction).toBe("confirm_booking");

    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning", // never "Root canal"
          preferredDate: "Monday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("date correction after confirmation", async () => {
    const results = await runTurns([
      "i want to book a root canal",
      "monday 2pm",
      "Trevor 12428012847",
      "no",
      "wednesday",
      "yes",
    ]);
    const confirmed = results[results.length - 1];
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Root canal",
          preferredDate: "Wednesday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("time correction after confirmation", async () => {
    const results = await runTurns([
      "i want to book a root canal",
      "monday 2pm",
      "Trevor 12428012847",
      "no",
      "3pm",
      "yes",
    ]);
    const confirmed = results[results.length - 1];
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Root canal",
          preferredDate: "Monday",
          preferredTime: "15:00",
        },
      },
    ]);
  });

  it("name correction after confirmation", async () => {
    const results = await runTurns([
      "i want to book a root canal",
      "monday 2pm",
      "Trevor 12428012847",
      "no",
      "my name is Michael",
      "yes",
    ]);
    const confirmed = results[results.length - 1];
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Michael",
          phone: "+12428012847",
          service: "Root canal",
          preferredDate: "Monday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("phone correction after confirmation", async () => {
    const results = await runTurns([
      "i want to book a root canal",
      "monday 2pm",
      "Trevor 12428012847",
      "no",
      "242 555 9999",
      "yes",
    ]);
    const confirmed = results[results.length - 1];
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12425559999",
          service: "Root canal",
          preferredDate: "Monday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("reschedule correction after confirmation", async () => {
    const results = await runTurns([
      "i need to reschedule my appointment",
      "monday 2pm",
      "Trevor 12428012847",
      "no",
      "4pm",
      "yes",
    ]);
    const confirmed = results[results.length - 1];
    expect(confirmed.actions).toEqual([
      {
        type: "request_reschedule",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          newPreferredDate: "Monday",
          newPreferredTime: "16:00",
        },
      },
    ]);
  });

  it("cancellation intent after a booking confirmation: an explicit switch after decline is picked up (unconditional intent-switching, unaffected by this fix) and never falls back to the stale booking", async () => {
    const results = await runTurns([
      "i want to book a root canal",
      "monday 2pm",
      "Trevor 12428012847",
      "no",
      "actually, cancel my appointment instead",
      "yes",
    ]);
    const confirmed = results[results.length - 1];
    expect(confirmed.actions).toEqual([
      { type: "request_cancellation", payload: { name: "Trevor", phone: "+12428012847" } },
    ]);
  });
});
