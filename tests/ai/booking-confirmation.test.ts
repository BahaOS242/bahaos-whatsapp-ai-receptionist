import { describe, expect, it } from "vitest";
import {
  bookingStateUnchangedForConfirmation,
  composeConfirmationPrompt,
  isConfirmedCompletingAction,
} from "../../src/ai/booking-confirmation";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { BookingState, ReceptionistAction } from "../../src/ai/types";

/**
 * Dedicated unit coverage for booking-confirmation.ts — the ONE shared
 * hard-confirmation gate both AIProvider implementations are built on
 * (Objective 2). Previously only exercised indirectly through
 * llm-provider.test.ts / dev-rule-based-provider.test.ts; this file
 * tests the gate's own logic directly, independent of either provider.
 */

// A fixed instant so date-inclusive assertions are deterministic
// regardless of what day the suite actually runs. 2026-08-24 is a
// Monday in America/Nassau (EDT, UTC-4) — see appointment-timestamp.test.ts
// for the same verified weekday facts.
const FIXED_NOW = new Date("2026-08-24T12:00:00-04:00");

const BOOKING_STATE: BookingState = {
  intent: "book_appointment",
  service: "Routine cleaning",
  date: "Tuesday",
  time: "14:00",
  name: "Trevor",
  phone: "+12428012847",
  pendingAction: "confirm_service",
};

const BOOK_ACTION: ReceptionistAction = {
  type: "request_appointment",
  payload: {
    name: "Trevor",
    phone: "+12428012847",
    service: "Routine cleaning",
    preferredDate: "Tuesday",
    preferredTime: "14:00",
  },
};

describe("bookingStateUnchangedForConfirmation", () => {
  it("returns true when every confirmation-relevant field is identical", () => {
    expect(bookingStateUnchangedForConfirmation(BOOKING_STATE, { ...BOOKING_STATE })).toBe(true);
  });

  it("returns true when only irrelevant fields (pendingAction, pendingBareTime, bookingJustCompleted) differ", () => {
    const after: BookingState = { ...BOOKING_STATE, pendingAction: undefined, pendingBareTime: "9:00" };
    expect(bookingStateUnchangedForConfirmation(BOOKING_STATE, after)).toBe(true);
  });

  it.each(["intent", "service", "date", "time", "name", "phone"] as const)(
    "returns false when %s differs",
    (field) => {
      const after: BookingState = { ...BOOKING_STATE };
      // @ts-expect-error -- deliberately assigning a different value per field for the test
      after[field] = field === "intent" ? "cancel_appointment" : "something-else";
      expect(bookingStateUnchangedForConfirmation(BOOKING_STATE, after)).toBe(false);
    },
  );
});

describe("isConfirmedCompletingAction", () => {
  it("authorizes request_appointment when confirmation was pending, nothing changed, and payload matches exactly", () => {
    expect(isConfirmedCompletingAction(BOOKING_STATE, BOOKING_STATE, BOOK_ACTION)).toBe(true);
  });

  it("authorizes when pendingAction is confirm_booking too (DevRuleBasedAIProvider's final-gate value)", () => {
    const state: BookingState = { ...BOOKING_STATE, pendingAction: "confirm_booking" };
    expect(isConfirmedCompletingAction(state, state, BOOK_ACTION)).toBe(true);
  });

  it("rejects when no confirmation was pending at all", () => {
    const before: BookingState = { ...BOOKING_STATE, pendingAction: undefined };
    expect(isConfirmedCompletingAction(before, before, BOOK_ACTION)).toBe(false);
  });

  it("rejects when the time changed this turn — the old confirmation must never authorize a different time", () => {
    const after: BookingState = { ...BOOKING_STATE, time: "15:00" };
    // Even if the action's payload matches the OLD (before) time exactly,
    // any relevant field changing this turn invalidates the confirmation.
    expect(isConfirmedCompletingAction(BOOKING_STATE, after, BOOK_ACTION)).toBe(false);
    // And it's equally rejected if the action instead matches the NEW time.
    const newAction: ReceptionistAction = {
      ...BOOK_ACTION,
      payload: { ...BOOK_ACTION.payload, preferredTime: "15:00" },
    };
    expect(isConfirmedCompletingAction(BOOKING_STATE, after, newAction)).toBe(false);
  });

  it("rejects when the action's proposed values don't match what was actually pending, even with nothing changed", () => {
    const mismatched: ReceptionistAction = {
      ...BOOK_ACTION,
      payload: { ...BOOK_ACTION.payload, preferredTime: "09:00" }, // doesn't match before.time
    };
    expect(isConfirmedCompletingAction(BOOKING_STATE, BOOKING_STATE, mismatched)).toBe(false);
  });

  it("rejects when the service doesn't match, even if date/time/name/phone all do", () => {
    const mismatched: ReceptionistAction = {
      ...BOOK_ACTION,
      payload: { ...BOOK_ACTION.payload, service: "Basic filling" },
    };
    expect(isConfirmedCompletingAction(BOOKING_STATE, BOOKING_STATE, mismatched)).toBe(false);
  });

  it("authorizes request_reschedule matching a pending reschedule confirmation", () => {
    const state: BookingState = {
      intent: "reschedule_appointment",
      date: "Wednesday",
      time: "10:00",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    };
    const action: ReceptionistAction = {
      type: "request_reschedule",
      payload: {
        name: "Trevor",
        phone: "+12428012847",
        newPreferredDate: "Wednesday",
        newPreferredTime: "10:00",
      },
    };
    expect(isConfirmedCompletingAction(state, state, action)).toBe(true);
  });

  it("rejects request_appointment proposed while a reschedule was actually pending (action-type/intent mismatch)", () => {
    const state: BookingState = {
      intent: "reschedule_appointment",
      date: "Wednesday",
      time: "10:00",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    };
    // Doubly rejected: before.intent !== "book_appointment" (the
    // explicit guard), AND request_appointment's own service field can
    // never match — before has no `service` at all for a reschedule
    // intent.
    expect(isConfirmedCompletingAction(state, state, BOOK_ACTION)).toBe(false);
  });

  it("authorizes request_cancellation matching a pending cancellation confirmation", () => {
    const state: BookingState = {
      intent: "cancel_appointment",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    };
    const action: ReceptionistAction = {
      type: "request_cancellation",
      payload: { name: "Trevor", phone: "+12428012847" },
    };
    expect(isConfirmedCompletingAction(state, state, action)).toBe(true);
  });

  it("Objective 3: rejects request_cancellation proposed while a BOOKING confirmation was actually pending, even though name/phone match exactly", () => {
    // The real gap this guards against: request_cancellation's payload
    // is ONLY name+phone — fields every intent has in common. Without an
    // explicit before.intent check, a pending booking confirmation could
    // otherwise authorize a cancellation just because name/phone line up.
    const cancelAction: ReceptionistAction = {
      type: "request_cancellation",
      payload: { name: "Trevor", phone: "+12428012847" },
    };
    expect(isConfirmedCompletingAction(BOOKING_STATE, BOOKING_STATE, cancelAction)).toBe(false);
  });

  it("Objective 3: rejects request_reschedule proposed while a BOOKING confirmation was actually pending, even though date/time/name/phone all coincidentally match", () => {
    // The real gap this guards against: book_appointment and
    // reschedule_appointment both use bookingState.date/time for
    // fundamentally different things (the appointment's date/time vs.
    // the NEW target date/time) — a reschedule payload whose values
    // happen to equal the pending booking's date/time must still be
    // rejected without an explicit before.intent check.
    const rescheduleAction: ReceptionistAction = {
      type: "request_reschedule",
      payload: {
        name: "Trevor",
        phone: "+12428012847",
        newPreferredDate: BOOKING_STATE.date!,
        newPreferredTime: BOOKING_STATE.time!,
      },
    };
    expect(isConfirmedCompletingAction(BOOKING_STATE, BOOKING_STATE, rescheduleAction)).toBe(false);
  });

  it("Objective 3: rejects request_appointment proposed while a CANCELLATION confirmation was actually pending", () => {
    const cancelState: BookingState = {
      intent: "cancel_appointment",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    };
    // request_appointment's service/date/time can never match (cancelState
    // has none), and before.intent isn't "book_appointment" either — both
    // reject it, but the point is it's rejected regardless.
    expect(isConfirmedCompletingAction(cancelState, cancelState, BOOK_ACTION)).toBe(false);
  });

  it("rejects create_lead and escalate — never treated as completing actions regardless of pendingAction", () => {
    const createLead: ReceptionistAction = {
      type: "create_lead",
      payload: { name: "Trevor" },
    };
    const escalate: ReceptionistAction = {
      type: "escalate",
      payload: { reason: "test" },
    };
    expect(isConfirmedCompletingAction(BOOKING_STATE, BOOKING_STATE, createLead)).toBe(false);
    expect(isConfirmedCompletingAction(BOOKING_STATE, BOOKING_STATE, escalate)).toBe(false);
  });
});

describe("composeConfirmationPrompt", () => {
  it("book_appointment: includes the real resolved calendar date and asks to reply YES/NO", () => {
    const prompt = composeConfirmationPrompt(BAHAMAS_DENTAL_SERVICE, BOOKING_STATE, FIXED_NOW);
    expect(prompt).toBe(
      "I have you down for Routine cleaning on Tuesday, August 25 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.",
    );
  });

  it("reschedule_appointment: uses reschedule-specific wording", () => {
    const state: BookingState = {
      intent: "reschedule_appointment",
      date: "Wednesday",
      time: "10:00",
      name: "Trevor",
      phone: "+12428012847",
    };
    const prompt = composeConfirmationPrompt(BAHAMAS_DENTAL_SERVICE, state, FIXED_NOW);
    expect(prompt).toBe(
      "I have you down to move your appointment for Wednesday, August 26 at 10:00 AM. Reply YES to confirm the reschedule, or tell me the date or time you'd like to change.",
    );
  });

  it("cancel_appointment: uses cancellation-specific wording and interpolates the customer's name", () => {
    const state: BookingState = {
      intent: "cancel_appointment",
      name: "Trevor",
      phone: "+12428012847",
    };
    const prompt = composeConfirmationPrompt(BAHAMAS_DENTAL_SERVICE, state, FIXED_NOW);
    expect(prompt).toBe(
      "I have your appointment for Trevor flagged for cancellation. Reply YES to confirm the cancellation, or NO if you'd like to keep it.",
    );
  });

  it("cancel_appointment: omits the name clause entirely when name isn't known", () => {
    const state: BookingState = { intent: "cancel_appointment", phone: "+12428012847" };
    const prompt = composeConfirmationPrompt(BAHAMAS_DENTAL_SERVICE, state, FIXED_NOW);
    expect(prompt).toBe(
      "I have your appointment flagged for cancellation. Reply YES to confirm the cancellation, or NO if you'd like to keep it.",
    );
  });

  it("degrades gracefully (no real calendar date, raw time echoed) when the time is malformed — never reached in the real flow, since normalizeActionTime/hours validation reject a malformed time before pendingAction is ever set", () => {
    const state: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "not-a-time",
    };
    const prompt = composeConfirmationPrompt(BAHAMAS_DENTAL_SERVICE, state, FIXED_NOW);
    expect(prompt).toBe(
      "I have you down for Routine cleaning on Tuesday at not-a-time. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.",
    );
  });

  it("degrades gracefully when only service is known (no date/time yet)", () => {
    const state: BookingState = { intent: "book_appointment", service: "Routine cleaning" };
    const prompt = composeConfirmationPrompt(BAHAMAS_DENTAL_SERVICE, state, FIXED_NOW);
    expect(prompt).toBe(
      "I have you down for Routine cleaning. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.",
    );
  });

  it("degrades gracefully when nothing at all is known yet", () => {
    const state: BookingState = { intent: "book_appointment" };
    const prompt = composeConfirmationPrompt(BAHAMAS_DENTAL_SERVICE, state, FIXED_NOW);
    expect(prompt).toBe(
      "I have you down. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.",
    );
  });
});
