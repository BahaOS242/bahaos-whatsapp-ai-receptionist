/**
 * Pure date/time resolution for the booking flow. Deliberately narrow:
 * this app only ever needs a canonical weekday label (matching what a
 * human receptionist would actually write down) and a 24-hour time — not
 * a full calendar date. Never guesses: an ambiguous input (e.g. a bare
 * hour with no am/pm) returns undefined so the caller asks again instead
 * of silently assuming AM or PM.
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

const WEEKDAY_WORD_RE =
  /\b(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;

const WEEKDAY_PREFIX_TO_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Resolves "today" / "tomorrow" / a weekday name to a canonical weekday
 * label relative to `now`. Returns undefined if the text names no
 * recognizable date. */
export function resolveDateWord(text: string, now: Date = new Date()): string | undefined {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) return WEEKDAY_NAMES[now.getDay()];
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return WEEKDAY_NAMES[tomorrow.getDay()];
  }

  const match = lower.match(WEEKDAY_WORD_RE);
  if (match) {
    const prefix = match[1].slice(0, 3);
    const index = WEEKDAY_PREFIX_TO_INDEX[prefix];
    if (index !== undefined) return WEEKDAY_NAMES[index];
  }

  return undefined;
}

const TIME_WITH_MERIDIEM_RE = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i;

/** Parses a time into 24-hour "HH:MM". Requires an explicit am/pm — a
 * bare number like "6" is genuinely ambiguous for a business open past
 * noon, so this returns undefined rather than guessing, and the caller
 * asks specifically for the time again. */
export function parseTime(text: string): string | undefined {
  const match = text.match(TIME_WITH_MERIDIEM_RE);
  if (!match) return undefined;

  let hour = Number.parseInt(match[1], 10);
  if (hour < 1 || hour > 12) return undefined;
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (minute < 0 || minute > 59) return undefined;

  const meridiem = match[3].toLowerCase();
  if (hour === 12) hour = 0;
  if (meridiem === "pm") hour += 12;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
