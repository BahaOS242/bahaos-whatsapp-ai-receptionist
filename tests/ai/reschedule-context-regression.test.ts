import { describe, expect, it } from "vitest";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { nextRequiredField } from "../../src/ai/booking-progression";
import { resolveDateWord } from "../../src/ai/date-time";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProviderRequest, BookingState, CompletedBookingSnapshot } from "../../src/ai/types";

/**
 * CONTEXT-STATE REGRESSION — RESCHEDULE FLOW.
 *
 * Root cause traced live (dev-chat, LLMProvider/Anthropic): a bare
 * "can i change my appointment" — no "resched"/"move my appointment"
 * keyword — fell through RESCHEDULE_RE to BOOK_RE (which matches the bare
 * word "appointment") and was deterministically misclassified as intent
 * "book_appointment". Because detectStatedIntent is first-detection-only
 * (see message-field-extraction.ts), that WRONG intent then stuck for the
 * rest of the conversation: book_appointment's field order starts with
 * "service", which was never mentioned, so nextRequiredField never even
 * reached date/time — the customer's "2am" was silently dropped, and a
 * "Did you mean 2 PM instead?" that existed only in the model's own prose
 * had no application state backing it, so "yes" had nothing deterministic
 * to confirm. Fixed in three places, all in message-field-extraction.ts
 * unless noted:
 *   1. RESCHEDULE_RE widened to recognize "change/update/modify (my)
 *      appointment/booking", checked before BOOK_RE.
 *   2. A freshly-established reschedule_appointment intent now pre-fills
 *      name/phone/service from bookingState.lastCompletedBooking (the
 *      just-finished booking) when the SAME message states no date/time
 *      of its own — detectPostCompletionReschedule already did this, but
 *      only when the message ALSO stated a concrete date/time; this
 *      covers the bare "can I change my appointment" case it doesn't.
 *   3. A new BookingState.pendingCorrection field (types.ts) makes a
 *      deterministic invalid-time correction proposal ("Did you mean
 *      2 PM instead?") real application state instead of unbacked prose
 *      — proposed in llm-provider.ts's hours-validation-before-
 *      confirmation block via a narrow, defensive AM/PM-flip heuristic
 *      (date-time.ts's flipMeridiemHour), and answered deterministically
 *      by message-field-extraction.ts's new pendingCorrection
 *      early-branch (never a generic booking confirmation).
 * Also fixed: date-time.ts's resolveDateWord used to resolve "today"/
 * "tomorrow" to a bare weekday NAME with no real calendar anchor at all;
 * it now resolves every relative expression (today/tomorrow/day after
 * tomorrow/yesterday/next <weekday>) to a real "YYYY-MM-DD", deterministic
 * against the application's own now/timezone — see date-time.test.ts for
 * the isolated unit coverage of that math. This file covers the
 * RESCHEDULE-FLOW consequences of that fix, not the date math itself.
 *
 * Every test here uses a directly-constructed BookingState and a fake
 * LlmChatClient so it never depends on network access or Anthropic
 * availability (see the mission's own "do not make the tests depend on
 * Anthropic" requirement) — a live replay against the real model exists
 * separately (scripts/_tmp-*.ts, run manually) and is reported in the
 * final report, not part of this suite.
 */

/** Throws if ever called — proves a given turn is a genuine deterministic
 * bypass (the hard confirmation gate/pendingCorrection handling) that
 * never consults the model at all, not merely "the model happened to
 * agree." An unexpected model call surfaces as a rejected promise from
 * generateResponse, which vitest reports as a normal test failure. */
class ThrowingLlmChatClient implements LlmChatClient {
  async chat(): Promise<LlmChatResult> {
    throw new Error("LLMProvider must not consult the model for this turn — a deterministic bypass should apply.");
  }
}

class FakeLlmChatClient implements LlmChatClient {
  constructor(private readonly result: LlmChatResult | (() => LlmChatResult)) {}
  async chat(): Promise<LlmChatResult> {
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

/** A guaranteed-open business day (Mon–Fri), computed the same way the
 * mission's own "next Monday" example is, rather than hardcoded — correct
 * regardless of which real calendar day this suite happens to run on. */
const NEXT_MONDAY = resolveDateWord("next monday")!;

const COMPLETED_CONSULTATION_SNAPSHOT: CompletedBookingSnapshot = {
  intent: "book_appointment",
  service: "Dental consultation / basic exam",
  date: "2026-09-17",
  time: "09:00",
  name: "Trevor",
  phone: "+12428012847",
};

/** The exact bookingState LLMProvider's own deriveBookingState leaves
 * behind immediately after a real booking completes (see
 * llm-provider.ts) — the starting point for every "customer immediately
 * asks to reschedule" test below. */
const JUST_COMPLETED_BOOKING: BookingState = {
  bookingJustCompleted: true,
  lastCompletedBooking: COMPLETED_CONSULTATION_SNAPSHOT,
};

const NON_COMMITTING_REPLY: LlmChatResult = { content: "Got it — what would you like to change?", toolCalls: [] };

describe("P0 — reschedule intent recognized from 'change my appointment' phrasing", () => {
  it("'can i change my appointment' sets intent=reschedule_appointment, never book_appointment", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));

    const result = await provider.generateResponse(
      request("can i change my appointment", { bookingState: JUST_COMPLETED_BOOKING }),
    );

    expect(result.bookingState.intent).toBe("reschedule_appointment");
  });

  it("'update my booking' and 'modify my appointment' are also recognized as reschedule, not book", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));

    for (const message of ["update my booking", "modify my appointment"]) {
      const result = await provider.generateResponse(
        request(message, { bookingState: JUST_COMPLETED_BOOKING }),
      );
      expect(result.bookingState.intent).toBe("reschedule_appointment");
    }
  });
});

describe("P1 — preserve existing appointment data on entering reschedule", () => {
  it("pre-fills name/phone/service from the just-completed booking; never re-asks for them", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));

    const result = await provider.generateResponse(
      request("can i change my appointment", { bookingState: JUST_COMPLETED_BOOKING }),
    );

    expect(result.bookingState.name).toBe("Trevor");
    expect(result.bookingState.phone).toBe("+12428012847");
    expect(result.bookingState.service).toBe("Dental consultation / basic exam");
    // date/time are deliberately NOT pre-filled — they're exactly what's
    // being changed, and must come from the customer fresh.
    expect(result.bookingState.date).toBeUndefined();
    expect(result.bookingState.time).toBeUndefined();
    // The next thing the app should ask for is the new date — never
    // "name"/"phone"/"service", which are already known.
    expect(nextRequiredField(result.bookingState)).toBe("date");
  });

  it("clears bookingJustCompleted/lastCompletedBooking once the reschedule intent is established", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));

    const result = await provider.generateResponse(
      request("can i change my appointment", { bookingState: JUST_COMPLETED_BOOKING }),
    );

    expect(result.bookingState.bookingJustCompleted).toBeUndefined();
    expect(result.bookingState.lastCompletedBooking).toBeUndefined();
  });

  it("'you already have my information' never gets asked again — name/phone already satisfied, no name/phone question reachable", async () => {
    // Simulates the turn right after intent was established: nothing new
    // stated, next required field is already "date", never "name"/"phone".
    const bookingState: BookingState = {
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      service: "Dental consultation / basic exam",
    };
    expect(nextRequiredField(bookingState)).toBe("date");
  });
});

describe("P0 — pending time correction is real application state, never just prose", () => {
  const baseRescheduleState: BookingState = {
    intent: "reschedule_appointment",
    name: "Trevor",
    phone: "+12428012847",
    service: "Dental consultation / basic exam",
    date: NEXT_MONDAY,
  };

  // NOTE on "without consulting the model" throughout this describe
  // block: LLMProvider always calls the chat client for an ordinary turn
  // (see generateResponse's `const result = autoConfirmCall ? ... :
  // await this.client.chat(...)`) — only a handful of narrow, EARLY-
  // RETURN cases (buildDeclineResponse, the recurring-without-simulator
  // escalation, and autoConfirmCall itself firing) skip that call
  // entirely. The hours-validation-before-confirmation block that
  // proposes/applies a time correction runs AFTER the model is
  // consulted, and OVERRIDES its reply/bookingState — so these tests
  // deliberately hand the fake client an unrelated, clearly-wrong
  // response (a plain acknowledgement) and assert the DETERMINISTIC
  // override wins regardless of what the model said — proving the
  // model's own output is never authoritative here, the stronger and
  // more accurate property (see P0 — a reschedule correction never
  // creates a NEW booking, below, for the one case that genuinely does
  // skip the model call entirely).
  it("an out-of-hours time deterministically proposes a specific AM/PM-flipped correction, overriding whatever the model itself said", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));

    const result = await provider.generateResponse(request("2am", { bookingState: baseRescheduleState }));

    expect(result.bookingState.time).toBe("02:00");
    expect(result.bookingState.pendingCorrection).toBe("14:00");
    expect(result.reply).toMatch(/did you mean/i);
    expect(result.reply).toMatch(/2:00 PM/);
    expect(result.actions).toHaveLength(0);
  });

  it("YES to the proposed correction applies it to `time`, clears pendingCorrection, and stays in the reschedule flow — never switches to booking a new appointment", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));
    const withPendingCorrection: BookingState = {
      ...baseRescheduleState,
      time: "02:00",
      pendingCorrection: "14:00",
    };

    const result = await provider.generateResponse(request("yes", { bookingState: withPendingCorrection }));

    expect(result.bookingState.time).toBe("14:00");
    expect(result.bookingState.pendingCorrection).toBeUndefined();
    expect(result.bookingState.intent).toBe("reschedule_appointment");
    expect(result.reply).not.toMatch(/which service/i);
    expect(result.reply).toMatch(/reschedule/i);
    // This "yes" resolves the correction and re-presents the full
    // reschedule confirmation — it does not itself execute anything yet
    // (see the next describe block for the confirmation's own "yes").
    expect(result.actions).toHaveLength(0);
    expect(result.bookingState.pendingAction).toBe("confirm_service");
  });

  it("NO to the proposed correction discards both the correction and the invalid time, and stays in the reschedule flow", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));
    const withPendingCorrection: BookingState = {
      ...baseRescheduleState,
      time: "02:00",
      pendingCorrection: "14:00",
    };

    const result = await provider.generateResponse(request("no", { bookingState: withPendingCorrection }));

    expect(result.bookingState.time).toBeUndefined();
    expect(result.bookingState.pendingCorrection).toBeUndefined();
    expect(result.bookingState.intent).toBe("reschedule_appointment");
  });

  it("a fresh explicit time (instead of yes/no) overrides the stale proposed correction — latest stated value always wins", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));
    const withPendingCorrection: BookingState = {
      ...baseRescheduleState,
      time: "02:00",
      pendingCorrection: "14:00",
    };

    const result = await provider.generateResponse(request("3pm", { bookingState: withPendingCorrection }));

    // The customer's own fresh "3pm" — NOT the stale "14:00" (2pm)
    // proposed correction — must win.
    expect(result.bookingState.time).toBe("15:00");
    expect(result.bookingState.pendingCorrection).toBeUndefined();
  });
});

describe("P0 — a reschedule correction never creates a NEW booking", () => {
  it("the final action after accepting a correction is request_reschedule, never request_appointment", async () => {
    // This turn genuinely bypasses the model entirely — pendingAction is
    // already "confirm_service", nothing confirmation-relevant changed,
    // and the message is an unambiguous "yes" (see buildAutoConfirmToolCall)
    // — a real (non-throwing) client would simply never be called.
    const provider = new LLMProvider(new ThrowingLlmChatClient());
    // Post-correction state, exactly as the previous describe block's
    // "YES to the proposed correction" test produced it: pendingAction
    // is now "confirm_service" and every required field is known.
    const readyToConfirm: BookingState = {
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      service: "Dental consultation / basic exam",
      date: NEXT_MONDAY,
      time: "14:00",
      pendingAction: "confirm_service",
    };

    const result = await provider.generateResponse(request("yes", { bookingState: readyToConfirm }));

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("request_reschedule");
    expect(result.actions[0].type).not.toBe("request_appointment");
    if (result.actions[0].type === "request_reschedule") {
      expect(result.actions[0].payload.newPreferredDate).toBe(NEXT_MONDAY);
      expect(result.actions[0].payload.newPreferredTime).toBe("14:00");
      expect(result.actions[0].payload.name).toBe("Trevor");
      expect(result.actions[0].payload.phone).toBe("+12428012847");
    }
  });
});

describe("P1 — hard confirmation gate preserved for reschedule", () => {
  it("a bare YES with nothing actually pending never produces a completing action, even if the model hallucinates one", async () => {
    const provider = new LLMProvider(
      new FakeLlmChatClient({
        content: "Sure, I'll reschedule that now.",
        toolCalls: [
          {
            id: "hallucinated",
            name: "request_reschedule",
            argumentsJson: JSON.stringify({
              name: "Trevor",
              phone: "+12428012847",
              newPreferredDate: NEXT_MONDAY,
              newPreferredTime: "14:00",
            }),
          },
        ],
      }),
    );
    // Every field is known, but pendingAction was never armed — nothing
    // was actually shown to the customer as ready to confirm yet.
    const notYetConfirmed: BookingState = {
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      service: "Dental consultation / basic exam",
      date: NEXT_MONDAY,
      time: "14:00",
    };

    const result = await provider.generateResponse(request("yes", { bookingState: notYetConfirmed }));

    expect(result.actions.find((a) => a.type === "request_reschedule")).toBeUndefined();
  });
});

describe("P1 — reschedule regression variants (exact transcript + required variations)", () => {
  it("variant: reschedule -> change date only, keeping the pre-filled service", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));

    const result = await provider.generateResponse(
      request("can i change my appointment", { bookingState: JUST_COMPLETED_BOOKING }),
    );
    const afterDate = await provider.generateResponse(
      request(`sept 21 at 10am`, { bookingState: result.bookingState }), // a Monday — must be a real business day
    );

    expect(afterDate.bookingState.date).toBe("2026-09-21");
    expect(afterDate.bookingState.time).toBe("10:00");
    expect(afterDate.bookingState.service).toBe("Dental consultation / basic exam");
    expect(afterDate.bookingState.intent).toBe("reschedule_appointment");
  });

  it("variant: reschedule -> 'tomorrow at 2pm' resolves date and time from one message", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));
    const rescheduling: BookingState = {
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      service: "Dental consultation / basic exam",
    };
    const expectedTomorrow = resolveDateWord("tomorrow")!;

    const result = await provider.generateResponse(request("tomorrow at 2pm", { bookingState: rescheduling }));

    expect(result.bookingState.date).toBe(expectedTomorrow);
    expect(result.bookingState.time).toBe("14:00");
  });

  it("variant: reschedule -> 'tomorrow at 2am' resolves the date and proposes a time correction in the same turn", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));
    const rescheduling: BookingState = {
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      service: "Dental consultation / basic exam",
    };
    const expectedTomorrow = resolveDateWord("tomorrow")!;

    const result = await provider.generateResponse(request("tomorrow at 2am", { bookingState: rescheduling }));

    expect(result.bookingState.date).toBe(expectedTomorrow);
    expect(result.bookingState.time).toBe("02:00");
    expect(result.bookingState.pendingCorrection).toBe("14:00");
  });

  it("variant: reschedule -> invalid time -> NO -> a genuinely different (valid) time is accepted normally", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));
    const rescheduling: BookingState = {
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      service: "Dental consultation / basic exam",
      date: NEXT_MONDAY,
    };

    const afterInvalid = await provider.generateResponse(request("2am", { bookingState: rescheduling }));
    expect(afterInvalid.bookingState.pendingCorrection).toBe("14:00");

    const afterDecline = await provider.generateResponse(request("no", { bookingState: afterInvalid.bookingState }));
    expect(afterDecline.bookingState.time).toBeUndefined();
    expect(afterDecline.bookingState.pendingCorrection).toBeUndefined();

    const afterNewTime = await provider.generateResponse(
      request("11am", { bookingState: afterDecline.bookingState }),
    );
    expect(afterNewTime.bookingState.time).toBe("11:00");
    expect(afterNewTime.bookingState.pendingCorrection).toBeUndefined();
  });

  it("variant: reschedule -> NO to one correction -> a second invalid time -> a second correction -> YES completes with the SECOND corrected value", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));
    const rescheduling: BookingState = {
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      service: "Dental consultation / basic exam",
      date: NEXT_MONDAY,
    };

    const first = await provider.generateResponse(request("3am", { bookingState: rescheduling }));
    expect(first.bookingState.pendingCorrection).toBe("15:00");

    const declined = await provider.generateResponse(request("no", { bookingState: first.bookingState }));
    expect(declined.bookingState.time).toBeUndefined();

    const second = await provider.generateResponse(request("4am", { bookingState: declined.bookingState }));
    expect(second.bookingState.pendingCorrection).toBe("16:00");

    const accepted = await provider.generateResponse(request("yes", { bookingState: second.bookingState }));
    expect(accepted.bookingState.time).toBe("16:00");
    expect(accepted.bookingState.pendingCorrection).toBeUndefined();
    expect(accepted.bookingState.intent).toBe("reschedule_appointment");

    // Confirm the full loop: the FINAL yes still produces request_reschedule
    // with the second (not the first, discarded) corrected time.
    const finalYes = await provider.generateResponse(request("yes", { bookingState: accepted.bookingState }));
    expect(finalYes.actions).toHaveLength(1);
    expect(finalYes.actions[0].type).toBe("request_reschedule");
    if (finalYes.actions[0].type === "request_reschedule") {
      expect(finalYes.actions[0].payload.newPreferredTime).toBe("16:00");
    }
  });

  it("variant: reschedule -> service correction ('actually, a cleaning instead') updates service without leaving the reschedule flow", async () => {
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));
    const readyToConfirm: BookingState = {
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      service: "Dental consultation / basic exam",
      date: NEXT_MONDAY,
      time: "14:00",
      pendingAction: "confirm_service",
    };

    const result = await provider.generateResponse(
      request("actually, a cleaning instead", { bookingState: readyToConfirm }),
    );

    expect(result.bookingState.service).toBe("Routine cleaning");
    expect(result.bookingState.intent).toBe("reschedule_appointment");
    // Changing a confirmation-relevant field must invalidate the stale
    // pending confirmation — never silently carry it forward.
    expect(result.actions.find((a) => a.type === "request_reschedule")).toBeUndefined();
  });

  it("variant: reschedule -> change time only, keeping the already-known date", async () => {
    // pendingAction is already "confirm_service" going in, so this
    // correction doesn't re-trigger the deterministic fresh-confirmation
    // bypass (that only fires the turn a booking FIRST becomes complete)
    // — the model is consulted for its own follow-up reply, same as the
    // service-correction variant above; only the deterministic FIELD
    // update is under test here.
    const provider = new LLMProvider(new FakeLlmChatClient(NON_COMMITTING_REPLY));
    const rescheduling: BookingState = {
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      service: "Dental consultation / basic exam",
      date: NEXT_MONDAY,
      time: "10:00",
      pendingAction: "confirm_service",
    };

    const result = await provider.generateResponse(
      request("actually, make it 3pm", { bookingState: rescheduling }),
    );

    expect(result.bookingState.date).toBe(NEXT_MONDAY);
    expect(result.bookingState.time).toBe("15:00");
  });
});
