import type { BusinessContext, Weekday } from "./types";

/**
 * Business-hours validation. This is the application-level authority on
 * whether a requested appointment time is real — no AIProvider decision
 * is trusted over this, and the tools layer (src/tools/receptionist-tools.ts)
 * re-checks this independently before ever reporting success, so neither
 * a buggy provider nor a model that ignores its instructions can produce
 * a booked appointment outside business hours.
 */

export type BusinessHoursValidation =
  | { valid: true }
  | { valid: false; reason: "closed_day" }
  | { valid: false; reason: "outside_hours" };

function toMinutes(hhmm: string): number | undefined {
  const match = hhmm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return undefined;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

/**
 * Validates that an appointment of `durationMinutes` starting at `time`
 * on `date` (a weekday name) fits entirely within that day's hours.
 *
 * Boundary decision (documented per requirement): starting exactly at
 * opening time is valid. Starting exactly at closing time is NOT treated
 * as valid whenever the appointment has a positive duration, because the
 * appointment would necessarily run past closing — an appointment must
 * *finish* within business hours, not merely start before the doors lock.
 * Only a hypothetical zero-duration "appointment" could start exactly at
 * closing; every real service in this business has a positive duration,
 * so in practice closing time is never an acceptable start time.
 */
export function validateAppointmentTime(
  business: BusinessContext,
  date: string,
  time: string,
  durationMinutes: number,
): BusinessHoursValidation {
  const dayHours = business.weeklyHours[date as Weekday];
  if (!dayHours) {
    return { valid: false, reason: "closed_day" };
  }

  const startMinutes = toMinutes(time);
  const openMinutes = toMinutes(dayHours.open);
  const closeMinutes = toMinutes(dayHours.close);
  if (startMinutes === undefined || openMinutes === undefined || closeMinutes === undefined) {
    return { valid: false, reason: "outside_hours" };
  }

  const endMinutes = startMinutes + durationMinutes;
  if (startMinutes < openMinutes || endMinutes > closeMinutes) {
    return { valid: false, reason: "outside_hours" };
  }

  return { valid: true };
}

/**
 * Duration-less variant for reschedule: the tools layer doesn't track
 * which existing appointment (and therefore which service/duration) is
 * being moved in this simulated system, so this only confirms the new
 * start time falls within the open/close window — it cannot confirm the
 * whole appointment fits, unlike validateAppointmentTime. Conservatively
 * treats exactly-closing as invalid too, for consistency.
 */
export function isWithinOperatingWindow(
  business: BusinessContext,
  date: string,
  time: string,
): BusinessHoursValidation {
  const dayHours = business.weeklyHours[date as Weekday];
  if (!dayHours) return { valid: false, reason: "closed_day" };

  const startMinutes = toMinutes(time);
  const openMinutes = toMinutes(dayHours.open);
  const closeMinutes = toMinutes(dayHours.close);
  if (startMinutes === undefined || openMinutes === undefined || closeMinutes === undefined) {
    return { valid: false, reason: "outside_hours" };
  }
  // Conservatively excludes exactly-closing as a start time too, for
  // consistency with validateAppointmentTime's boundary decision above,
  // even though the true duration isn't known here.
  if (startMinutes < openMinutes || startMinutes >= closeMinutes) {
    return { valid: false, reason: "outside_hours" };
  }
  return { valid: true };
}

/** "18:00" -> "6:00 PM", for customer-facing rejection messages. */
export function formatTime12h(time24: string): string {
  const minutes = toMinutes(time24);
  if (minutes === undefined) return time24;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

/** Builds the customer-facing explanation for a rejected time, per
 * requirement: explain why, then ask for a valid alternative. */
export function describeInvalidTime(
  business: BusinessContext,
  validation: Extract<BusinessHoursValidation, { valid: false }>,
  date: string,
  time: string,
): string {
  if (validation.reason === "closed_day") {
    return `We're closed on ${date}s. We're open ${business.hours}. What day would you like to come in instead?`;
  }
  return `${formatTime12h(time)} on ${date} is outside our hours — we're open ${business.hours}. What time works for you?`;
}
