import type { BusinessContext, Weekday } from "./types";
import { formatTime12h, validateAppointmentTime } from "./business-hours";

/**
 * Slot availability — distinct from, and checked AFTER, business-hours
 * validity (src/ai/business-hours.ts). A time can be perfectly within
 * business hours and still be unavailable because another appointment
 * already holds it.
 */

/** Whether `date`+`time` is free for a NEW booking. */
export function isSlotAvailable(business: BusinessContext, date: string, time: string): boolean {
  const held = business.unavailableSlots ?? [];
  return !held.some((slot) => slot.date === date && slot.time === time);
}

const CANDIDATE_STEP_MINUTES = 30;

function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Up to `count` other times on the SAME day that are both within business
 * hours (for this service's duration) and not already held, in
 * chronological order. Deliberately same-day only — if none are found,
 * describeUnavailable falls back to asking for a different day/time
 * instead of expanding the search, keeping this a minimal, predictable
 * suggestion rather than a full scheduling search.
 */
export function findAlternativeTimes(
  business: BusinessContext,
  date: string,
  time: string,
  durationMinutes: number,
  count = 3,
): string[] {
  const dayHours = business.weeklyHours[date as Weekday];
  if (!dayHours) return [];

  const [openHour, openMinute] = dayHours.open.split(":").map(Number);
  const [closeHour, closeMinute] = dayHours.close.split(":").map(Number);
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;

  const alternatives: string[] = [];
  for (
    let minutes = openMinutes;
    minutes < closeMinutes && alternatives.length < count;
    minutes += CANDIDATE_STEP_MINUTES
  ) {
    const candidate = minutesToTime(minutes);
    if (candidate === time) continue;
    if (!validateAppointmentTime(business, date, candidate, durationMinutes).valid) continue;
    if (!isSlotAvailable(business, date, candidate)) continue;
    alternatives.push(candidate);
  }
  return alternatives;
}

/** Customer-facing message for an unavailable (but in-hours) slot: explain
 * it's taken, then offer same-day alternatives — mirrors
 * describeInvalidTime's explain-then-ask-for-a-valid-alternative shape. */
export function describeUnavailable(date: string, time: string, alternatives: string[]): string {
  const requested = formatTime12h(time);
  if (alternatives.length === 0) {
    return `${requested} on ${date} is already booked, and we don't have any other openings that day. What other day or time would you like to try?`;
  }
  const options = alternatives.map((alt) => formatTime12h(alt)).join(", ");
  return `${requested} on ${date} is already booked. We do have ${options} available that day — would one of those work?`;
}
