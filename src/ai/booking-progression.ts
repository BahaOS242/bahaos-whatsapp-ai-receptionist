import type { BookingIntent, BookingState, PendingAction } from "./types";

/**
 * Application-owned booking progression: a pure, stateless derivation of
 * "what field does the customer need to answer next," computed fresh from
 * BookingState every time — never stored, never a second copy of state.
 * LLMProvider uses this so the MODEL never decides field order on its
 * own; DevRuleBasedAIProvider already enforces its own field order
 * independently (see REQUIRED_FIELDS in dev-rule-based-provider.ts) and
 * is intentionally left untouched — this is a small, deliberate
 * duplication of that same ordering, not a shared source of truth for
 * booking state itself (the state stays exactly one place:
 * ConversationManager).
 */

export type BookingProgressionField =
  | "service"
  | "date"
  | "time"
  | "recurrenceIntervalMonths"
  | "name"
  | "phone";

const FIELD_ORDER: Record<BookingIntent, BookingProgressionField[]> = {
  book_appointment: ["service", "date", "time", "name", "phone"],
  reschedule_appointment: ["date", "time", "name", "phone"],
  cancel_appointment: ["name", "phone"],
  // Recurrence interval asked LAST, after date/time — a customer who
  // opens with "I want a cleaning every 6 months" already volunteered it
  // out of order, and extraction (see recurrence.ts) captures it
  // whenever stated regardless of what's "currently asked," same as
  // every other out-of-order field in this codebase; this only governs
  // what's asked NEXT when it's still missing.
  book_recurring_appointment: ["service", "date", "time", "recurrenceIntervalMonths", "name", "phone"],
};

/** The single next field still missing, in required order — undefined
 * when there's no active booking intent, or every required field is
 * already known (ready to finalize). */
export function nextRequiredField(state: BookingState): BookingProgressionField | undefined {
  if (!state.intent) return undefined;
  return FIELD_ORDER[state.intent].find(
    (field) => !state[field] || (field === "time" && state.timeClarification),
  );
}

/** Short, natural-language label for the next field — combines date+time
 * into one phrase when both are still missing (matching how they're
 * always asked together), since that's how a human receptionist would
 * actually pose the question. */
export function describeNextField(state: BookingState): string {
  const field = nextRequiredField(state);
  if (!field) {
    return state.intent ? "none — every required field is known" : "none — no booking in progress";
  }
  if (field === "date" && !state.time) return "date and time";
  if (field === "recurrenceIntervalMonths") return "how often to repeat it";
  return field;
}

/** Deterministic replacement for the model self-reporting pendingAction:
 * "confirm_service" whenever there's an active intent and nothing left to
 * ask (ready to finalize), otherwise undefined. LLMProvider computes this
 * fresh at the end of every turn rather than trusting whatever (if
 * anything) the model reported — see llm-provider.ts. */
export function computePendingAction(state: BookingState): PendingAction | undefined {
  return state.intent && nextRequiredField(state) === undefined ? "confirm_service" : undefined;
}
