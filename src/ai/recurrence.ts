/**
 * Recurring-appointment intent detection + occurrence-date generation —
 * Sections 5/6. Deliberately narrow, same "no general dictionary" shape
 * as every other deterministic pattern in this codebase: only the
 * mission's own explicitly-listed intervals (3/6/12 months, "every
 * year") are recognized; nothing here guesses an interval from vaguer
 * phrasing ("regularly", "often").
 */

const RECURRENCE_WORD_TO_MONTHS: Record<string, number> = {
  "3": 3,
  three: 3,
  "6": 6,
  six: 6,
  "12": 12,
  twelve: 12,
};

const RECURRENCE_INTERVAL_RE = /\bevery\s+(3|three|6|six|12|twelve)\s+months?\b/i;
const RECURRENCE_YEAR_RE = /\bevery\s+year\b/i;

/** Detects an explicit recurrence interval, in months — "every 6
 * months," "every six months," "every year" (-> 12). Returns undefined
 * for anything not explicitly one of these, including a bare "every
 * month" (not in the mission's own list) or a vaguer "regularly" — never
 * guessed. */
export function detectRecurrenceIntervalMonths(message: string): number | undefined {
  if (RECURRENCE_YEAR_RE.test(message)) return 12;
  const match = message.match(RECURRENCE_INTERVAL_RE);
  if (!match) return undefined;
  return RECURRENCE_WORD_TO_MONTHS[match[1].toLowerCase()];
}

/** True when the message expresses a RECURRING booking intent — an
 * explicit interval (see above) mentioned alongside ordinary booking
 * language, OR the bare word "recurring"/"repeating". Deliberately
 * requires a real interval OR one of those two explicit words — "every
 * 6 months" alone (no "book"/"cleaning" in the same message) still
 * counts, since the mission's own examples show exactly that phrasing
 * ("I need a cleaning every 3 months," "Schedule this every year"). */
export function isRecurringIntentMessage(message: string): boolean {
  return (
    detectRecurrenceIntervalMonths(message) !== undefined ||
    /\brecurring\b|\brepeating\b/i.test(message)
  );
}

/** Adds `months` calendar months to "YYYY-MM-DD", clamping the day to
 * the target month's actual length (e.g. Jan 31 + 1 month -> Feb 28 or
 * 29, never "Feb 31" / a silent rollover into March) — the standard,
 * least-surprising convention for recurring monthly/annual billing-style
 * dates, and the only sane behavior for a service booked on the 29th,
 * 30th, or 31st repeating into a shorter month. Pure calendar math (no
 * timezone involved — a calendar date has no timezone of its own). */
function addCalendarMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  const totalMonths = (month - 1) + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

/** Generates `count` occurrence dates starting at `startDate` (INCLUDED
 * as the first element), each `intervalMonths` after the previous —
 * Section 6's own example: a Sept 10, 2026 start with a 6-month interval
 * produces ["2026-09-10", "2027-03-10", "2027-09-10"] for count=3. Pure
 * date generation — never checks availability itself (see
 * AIProviderRequest.checkAvailability for that, applied by the caller to
 * each date this returns). */
export function generateOccurrenceDates(startDate: string, intervalMonths: number, count: number): string[] {
  const dates: string[] = [startDate];
  for (let i = 1; i < count; i++) {
    dates.push(addCalendarMonths(startDate, intervalMonths * i));
  }
  return dates;
}

/** How many occurrences a recurring confirmation shows/creates by
 * default — the mission's own example shows exactly 3 (start + 2 more).
 * Not user-configurable this pass; a fixed, honest, small number rather
 * than generating a full year+ of occurrences customers never asked to
 * review individually. */
export const RECURRING_OCCURRENCE_COUNT = 3;
