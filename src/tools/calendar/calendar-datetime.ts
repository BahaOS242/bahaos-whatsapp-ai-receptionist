/**
 * Pure conversion from BookingState's canonical shape (weekday name +
 * 24-hour "HH:MM") to what the Google Calendar API actually needs.
 *
 * Deliberately does NOT do its own UTC/timezone-offset math: Google
 * Calendar's API accepts a naive local datetime plus a separate IANA
 * `timeZone` field and handles DST-aware conversion itself — America/
 * Nassau observes US Eastern DST rules, and hand-rolling that here would
 * be exactly the kind of correctness risk this sidesteps entirely.
 */

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The next calendar date matching `weekdayName`, including today if
 * today already matches. */
export function nextDateForWeekday(weekdayName: string, now: Date = new Date()): string {
  const targetIndex = WEEKDAY_NAMES.indexOf(weekdayName);
  if (targetIndex === -1) {
    throw new Error(`Not a recognized weekday name: "${weekdayName}"`);
  }
  const current = new Date(now);
  const diff = (targetIndex - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + diff);
  return formatLocalDate(current);
}

/** "14:00" + 45 -> "14:45". Appointments in this business never cross
 * midnight, so no day-rollover handling is needed. */
export function addMinutes(time: string, minutes: number): string {
  const [hourStr, minuteStr] = time.split(":");
  const total = Number.parseInt(hourStr, 10) * 60 + Number.parseInt(minuteStr, 10) + minutes;
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface CalendarRange {
  /** Naive local datetime, no offset — e.g. "2026-08-25T14:00:00". */
  startDateTime: string;
  endDateTime: string;
}

/** Resolves a BookingState-shaped (weekday, "HH:MM", duration) into the
 * naive local datetime range Google Calendar needs, paired separately
 * with the business's IANA timezone. */
export function toCalendarRange(
  weekdayName: string,
  time: string,
  durationMinutes: number,
  now: Date = new Date(),
): CalendarRange {
  const date = nextDateForWeekday(weekdayName, now);
  const endTime = addMinutes(time, durationMinutes);
  return {
    startDateTime: `${date}T${time}:00`,
    endDateTime: `${date}T${endTime}:00`,
  };
}
