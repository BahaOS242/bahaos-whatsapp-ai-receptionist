import { formatTime12h } from "./business-hours";
import { resolveAppointmentTimestamp } from "./appointment-timestamp";
import { isIsoDateString, weekdayForIsoDate } from "./date-time";
import { generateOccurrenceDates, RECURRING_OCCURRENCE_COUNT } from "./recurrence";
import type { AIProviderRequest, BookingState, BusinessContext, ReceptionistAction, Weekday } from "./types";

/**
 * The ONE shared, application-owned confirmation contract both AIProvider
 * implementations (LLMProvider, DevRuleBasedAIProvider) are built on —
 * Objective 2's explicit, non-negotiable requirement: "Do not rely on an
 * LLM prompt to enforce this. The application/action layer must enforce
 * it." Nothing in this file trusts a model's prose or tool-call choice;
 * it only ever reasons about BookingState (deterministically derived
 * from the customer's own messages) and the ReceptionistAction a
 * provider is proposing.
 *
 * Two things live here:
 *   1. isConfirmedCompletingAction — the hard gate. A completing action
 *      (request_appointment/request_reschedule/request_cancellation) is
 *      authorized ONLY if a confirmation was already pending BEFORE this
 *      turn, nothing confirmation-relevant changed this turn, and the
 *      action's own proposed values match exactly what was pending. Any
 *      caller (both providers) MUST run every completing action through
 *      this before ever letting it reach ReceptionistTools.
 *   2. composeConfirmationPrompt — the customer-facing summary+ask, e.g.
 *      "I have you down for a cleaning on Tuesday, August 25 at 3:00 PM.
 *      Reply YES to confirm the booking, or NO if you'd like to change
 *      anything." Includes the real resolved calendar date (via
 *      appointment-timestamp.ts) when it can be computed, not just the
 *      weekday name — letting the customer catch a wrong-week
 *      misunderstanding before anything is created, not just a wrong day
 *      name.
 */

/** Every field whose value materially changes what a completing action
 * would actually do. A change to ANY of these while a confirmation is
 * pending invalidates that confirmation — Objective 2: "any material
 * change invalidates the previous confirmation... the old confirmation
 * must NEVER authorize the changed booking." Deliberately broader than
 * the task's own explicit list (service/date/time/provider): name/phone
 * are included too, since a corrected phone/name is exactly the same
 * kind of "this is now a materially different request" case, and
 * `intent` is included so switching from booking to reschedule/
 * cancellation (or vice versa) can never ride on a stale confirmation
 * either. */
const CONFIRMATION_RELEVANT_FIELDS = [
  "intent",
  "service",
  "date",
  "time",
  "name",
  "phone",
  // Section 7's own required scenario: "every 6 months" -> "actually
  // every 3 months" must invalidate a pending recurring confirmation
  // exactly like any other material change — see this array's own
  // docstring below.
  "recurrenceIntervalMonths",
  // An unresolved time qualifier ("3pm or 4pm") means the stored time is not what the customer meant.
  "timeClarification",
] as const;

/** True only when NONE of the confirmation-relevant fields differ
 * between `before` (the state going into this turn) and `after` (the
 * state once this turn's deterministic extraction has been merged in).
 * A difference means the customer's own message this turn changed
 * something material — a correction — which must invalidate whatever
 * was previously pending, regardless of anything else the same message
 * said (e.g. "yes, actually 3pm" is a correction, not a confirmation of
 * the new time). */
export function bookingStateUnchangedForConfirmation(
  before: BookingState,
  after: BookingState,
): boolean {
  return CONFIRMATION_RELEVANT_FIELDS.every((field) => before[field] === after[field]);
}

/**
 * The hard gate. `before` must be the BookingState as it stood BEFORE
 * this turn's own extraction/derivation ran (i.e. what a PRIOR turn's
 * applyPendingAction/finishFlowTurn already computed and persisted) —
 * never the post-extraction state, since that could already reflect a
 * same-turn correction this function exists specifically to catch.
 * `after` is the state once this turn's extraction has been merged in.
 *
 * Returns false (never authorized) unless:
 *   - a confirmation was already pending (before.pendingAction is a
 *     confirming kind) — never "yes, we'll go straight from zero
 *     context to booking in one turn," which is exactly what a
 *     hallucinating or overly-eager model might otherwise attempt;
 *   - nothing confirmation-relevant changed this turn (see
 *     bookingStateUnchangedForConfirmation);
 *   - the action's OWN proposed payload values match `before` exactly —
 *     defends against a provider constructing a plausible-looking action
 *     whose values were never actually part of what was confirmed.
 */
export function isConfirmedCompletingAction(
  before: BookingState,
  after: BookingState,
  action: ReceptionistAction,
): boolean {
  if (!isConfirmingPendingAction(before.pendingAction)) return false;
  if (!bookingStateUnchangedForConfirmation(before, after)) return false;

  switch (action.type) {
    case "request_appointment":
      // Objective 3: "never convert a reschedule/cancellation into a new
      // appointment." The `before.intent` check is load-bearing, not
      // redundant with the field comparisons below — request_cancellation
      // in particular carries only name/phone, fields EVERY intent has in
      // common, so without this a pending cancellation confirmation could
      // otherwise authorize a completely different action type.
      return (
        before.intent === "book_appointment" &&
        action.payload.name === before.name &&
        action.payload.phone === before.phone &&
        action.payload.service === before.service &&
        action.payload.preferredDate === before.date &&
        action.payload.preferredTime === before.time
      );
    case "request_reschedule":
      return (
        before.intent === "reschedule_appointment" &&
        action.payload.name === before.name &&
        action.payload.phone === before.phone &&
        action.payload.newPreferredDate === before.date &&
        action.payload.newPreferredTime === before.time
      );
    case "request_cancellation":
      return (
        before.intent === "cancel_appointment" &&
        action.payload.name === before.name &&
        action.payload.phone === before.phone
      );
    case "request_recurring_appointment":
      // occurrenceDates is deliberately NOT compared — it's derived
      // data (generateOccurrenceDates(startDate, interval, count)), not
      // part of `before`'s own confirmation-relevant fields; if
      // startDate/interval match, it's identical by construction.
      return (
        before.intent === "book_recurring_appointment" &&
        action.payload.name === before.name &&
        action.payload.phone === before.phone &&
        action.payload.service === before.service &&
        action.payload.startDate === before.date &&
        action.payload.startTime === before.time &&
        action.payload.recurrenceIntervalMonths === before.recurrenceIntervalMonths
      );
    default:
      // create_lead/escalate are not completing actions and never reach
      // this gate — see COMPLETING_ACTION_TYPES in llm-provider.ts.
      return false;
  }
}

/** Which PendingAction values represent "the customer was already shown
 * the exact final details and asked to explicitly confirm" — as opposed
 * to an earlier, different kind of yes/no question (e.g.
 * DevRuleBasedAIProvider's early "would you like to book this service?"
 * step, tracked separately as "confirm_service", which is NOT a
 * confirmation of the full, final booking and must never authorize a
 * completing action on its own). */
function isConfirmingPendingAction(pendingAction: BookingState["pendingAction"]): boolean {
  return pendingAction === "confirm_service" || pendingAction === "confirm_booking";
}

/** Best-effort real calendar date ("August 25") for the currently-known
 * date, resolved via appointment-timestamp.ts. Returns undefined rather
 * than throwing when it can't be resolved (e.g. date/time missing or
 * malformed) — the confirmation prompt degrades gracefully to the
 * weekday name alone in that case, never blocks on this being available. */
function resolveDisplayDate(business: BusinessContext, bookingState: BookingState, now?: Date): string | undefined {
  if (!bookingState.date || !bookingState.time) return undefined;
  const isIso = isIsoDateString(bookingState.date);
  const resolved = resolveAppointmentTimestamp({
    business,
    ...(isIso
      ? { isoDate: bookingState.date }
      : { weekday: bookingState.date as Weekday }),
    time: bookingState.time,
    now,
  });
  if (!resolved.ok) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: business.timezone,
    month: "long",
    day: "numeric",
  }).format(resolved.startsAt);
}

/** "a cleaning on Tuesday, August 25 at 3:00 PM" — degrades to
 * "Tuesday at 3:00 PM" if the real calendar date can't be resolved, and
 * further to whatever subset of service/date/time is actually known
 * (used for the pre-final-confirmation "here's what I have so far"
 * framing too, not just the hard-gated final prompt). */
export function buildBookingSummary(business: BusinessContext, bookingState: BookingState, now?: Date): string {
  const parts: string[] = [];
  if (bookingState.service) parts.push(bookingState.service);

  if (bookingState.date && bookingState.time) {
    // For an explicit calendar date ("2026-09-12"), resolveDisplayDate
    // would produce a redundant "September 12" — the customer-facing
    // weekday-name prefix must come from the ISO date itself (via
    // date-time.ts's weekdayForIsoDate), not from bookingState.date
    // verbatim, which is never shown to a customer as a raw ISO string.
    const displayDate = resolveDisplayDate(business, bookingState, now);
    const weekdayLabel = isIsoDateString(bookingState.date)
      ? weekdayForIsoDate(bookingState.date)
      : bookingState.date;
    const dateLabel = displayDate ? `${weekdayLabel}, ${displayDate}` : weekdayLabel;
    parts.push(`${dateLabel} at ${formatTime12h(bookingState.time)}`);
  } else if (bookingState.date) {
    parts.push(isIsoDateString(bookingState.date) ? weekdayForIsoDate(bookingState.date) : bookingState.date);
  }

  return parts.join(" on ");
}

/**
 * The customer-facing summary + explicit yes/no ask — Objective 2's
 * literal example: "I have you down for a cleaning on Tuesday, August 25
 * at 3:00 PM. Reply YES to confirm the booking, or NO if you'd like to
 * change anything." Verb/noun-aware for reschedule and cancellation too
 * (Objective 3), and tells the customer exactly what to type (Objective
 * 9's "tell customers exactly what to type when confirmation is
 * required" — sharpened further per the Context & Human Conversation
 * Pass's own explicit example: naming the actual editable fields, e.g.
 * "or tell me the service, date, or time you'd like to change," rather
 * than a vague "if you'd like to change anything." A bare "NO" is still
 * fully supported (see NEGATIVE_RE/buildDeclineResponse and
 * handleBookingConfirmation's own "no" branch) even though it's no
 * longer spelled out in the prompt text itself — naming the concrete
 * fields is more actionable, and a customer who just says "no" is still
 * handled exactly as before.
 */
export function composeConfirmationPrompt(
  business: BusinessContext,
  bookingState: BookingState,
  now?: Date,
): string {
  if (bookingState.intent === "cancel_appointment") {
    const who = bookingState.name ? ` for ${bookingState.name}` : "";
    return `I have your appointment${who} flagged for cancellation. Reply YES to confirm the cancellation, or NO if you'd like to keep it.`;
  }

  const summary = buildBookingSummary(business, bookingState, now);
  const summarySuffix = summary ? ` for ${summary}` : "";

  if (bookingState.intent === "reschedule_appointment") {
    return `I have you down to move your appointment${summarySuffix}. Reply YES to confirm the reschedule, or tell me the date or time you'd like to change.`;
  }

  return `I have you down${summarySuffix}. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.`;
}

/** "2026-09-10" -> "September 10" (`includeYear: true` -> "September 10,
 * 2027") — pure calendar formatting, no timezone conversion needed for a
 * date-only value. Small, separate local copy of the same idea as
 * business-hours.ts's displayDate/receptionist-agent.ts's formatSlotDate
 * (each caller needs a slightly different shape — with/without weekday,
 * with/without year — so this stays its own copy rather than a shared,
 * over-parameterized formatter). */
function formatOccurrenceDate(date: string, includeYear: boolean): string {
  const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10));
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
  return includeYear ? `${monthLabel} ${day}, ${year}` : `${monthLabel} ${day}`;
}

function describeRecurrenceInterval(months: number): string {
  return months === 12 ? "year" : `${months} months`;
}

/** Section 9's own literal example, generalized: "I can see you'd like a
 * cleaning every 6 months. Recurring scheduling needs to be finalized by
 * our front desk team, so I haven't booked the recurring series." Used
 * whenever recurring intent is recognized but
 * AIProviderRequest.checkAvailability isn't available (no clinic
 * simulator wired) — the ONE thing that makes it possible to safely
 * validate a recurring series at all. Never claims a recurring booking
 * exists; always paired with an `escalate` action, never a completing
 * one. */
export function composeRecurringUnavailableEscalation(service: string | undefined, intervalMonths: number): string {
  const serviceLabel = service ?? "an appointment";
  const intervalLabel = describeRecurrenceInterval(intervalMonths);
  return `I can see you'd like ${serviceLabel} every ${intervalLabel}. Recurring scheduling needs to be finalized by our front desk team, so I haven't booked the recurring series — they'll follow up with you to set it up.`;
}

export interface RecurringConfirmationResult {
  reply: string;
  /** True only when EVERY occurrence genuinely checked out — a
   * confirmation was actually presented and "YES" may now authorize
   * creating the series. False means a conflict was found and surfaced
   * instead (Section 6: "never silently create an incomplete series") —
   * the customer must respond to that before anything is ready to
   * confirm at all. */
  ready: boolean;
  /** The full set of occurrence dates this result was computed from —
   * ALWAYS returned (even when `ready` is false) so a caller can log/
   * inspect exactly what was checked. */
  occurrenceDates: string[];
}

/**
 * Section 6/8's recurring-specific confirmation: generates and checks
 * EVERY occurrence via `checkAvailability` (the clinic simulator — see
 * AIProviderRequest.checkAvailability) BEFORE ever presenting anything
 * to the customer as ready to confirm. Mirrors composeConfirmationPrompt
 * in spirit (deterministic, application-composed, never the model's
 * text) but returns a richer result: a genuine conflict on any
 * occurrence produces an explanation of exactly which one and asks the
 * customer what they'd like to do INSTEAD of a confirmation prompt —
 * never silently drops that occurrence, and never leaves the customer
 * able to say "yes" to something that can't actually be fully honored.
 */
export function composeRecurringConfirmationOrConflict(
  business: BusinessContext,
  bookingState: BookingState,
  checkAvailability: NonNullable<AIProviderRequest["checkAvailability"]>,
): RecurringConfirmationResult {
  const service = business.services.find((s) => s.name === bookingState.service);
  const durationMinutes = service?.durationMinutes ?? 0;
  const occurrenceDates = generateOccurrenceDates(
    bookingState.date!,
    bookingState.recurrenceIntervalMonths!,
    RECURRING_OCCURRENCE_COUNT,
  );
  const intervalLabel = describeRecurrenceInterval(bookingState.recurrenceIntervalMonths!);
  const timeLabel = formatTime12h(bookingState.time!);

  // Genuine bug found live: collapsing this into a plain boolean lost
  // WHY an occurrence wasn't available — an occurrence beyond the
  // reference calendar's own known ~1-year window (`out_of_range`) was
  // worded as "already taken" (a genuine `conflict`'s wording), which is
  // simply false. A recurring series checked a full year out — exactly
  // what a 6-month/3-occurrence series spans — hits this legitimately,
  // not just as a theoretical edge case (the reference calendar's own
  // window is itself almost exactly one year).
  let conflict: { date: string; reason: string } | undefined;
  for (const date of occurrenceDates) {
    const check = checkAvailability(date, bookingState.time!, durationMinutes);
    if (!check.ok) {
      conflict = { date, reason: check.reason };
      break;
    }
  }
  if (conflict) {
    const explanation =
      conflict.reason === "out_of_range"
        ? `the occurrence on ${formatOccurrenceDate(conflict.date, true)} is beyond what our calendar currently covers`
        : conflict.reason === "closed_day" || conflict.reason === "outside_hours"
          ? `the occurrence on ${formatOccurrenceDate(conflict.date, true)} would fall outside business hours`
          : `the occurrence on ${formatOccurrenceDate(conflict.date, true)} is already taken`;
    return {
      ready: false,
      occurrenceDates,
      reply:
        `I can set up ${bookingState.service} starting ${formatOccurrenceDate(occurrenceDates[0], false)} at ${timeLabel}, repeating every ${intervalLabel} — but ${explanation}. ` +
        "Would you like me to pick a different day for the whole series, skip just that occurrence, or something else?",
    };
  }

  const upcoming = occurrenceDates.slice(1).map((date) => formatOccurrenceDate(date, true)).join("\n");
  return {
    ready: true,
    occurrenceDates,
    reply:
      `I have you scheduled for a ${bookingState.service} starting ${formatOccurrenceDate(occurrenceDates[0], false)} at ${timeLabel}, repeating every ${intervalLabel}.\n\n` +
      `Upcoming appointments:\n${upcoming}\n\n` +
      "Reply YES to confirm the recurring schedule, or NO to change it.",
  };
}
