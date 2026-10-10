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

/** Narrow, explicitly-listed texting shorthand for "tomorrow" — not a
 * general slang dictionary, just the same relative-day concept the
 * literal word already covers, written the way customers actually type
 * it on a phone. */
const TOMORROW_SHORTHAND_RE = /\b(tmrw|tmr|2mrw|2moro|tomoro)\b/i;

const DAY_AFTER_TOMORROW_RE = /\bday after tomorrow\b/i;
const TODAY_WORD_RE = /\btoday\b/i;
const TOMORROW_WORD_RE = /\btomorrow\b/i;
const YESTERDAY_RE = /\byesterday\b/i;
const NEXT_WEEKDAY_RE =
  /\bnext\s+(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;

/** "next week Friday", "next week on Friday", "Friday next week". The qualifier is NOT optional
 * decoration: dropping it silently books the wrong week. Policy: weeks run Monday–Sunday and
 * "next week" is the calendar week after the current one; the named weekday is that week's. */
const WEEKDAY_ALT =
  "(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const NEXT_WEEK_WEEKDAY_RE = new RegExp(
  `\\bnext\\s+week\\b[\\s,]*(?:on\\s+|for\\s+)?${WEEKDAY_ALT}\\b`,
  "i",
);
const WEEKDAY_NEXT_WEEK_RE = new RegExp(
  `\\b${WEEKDAY_ALT}\\b[\\s,]*(?:of\\s+|in\\s+)?next\\s+week\\b`,
  "i",
);

function isoDateFromYMD(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Pure calendar-day arithmetic on a Y/M/D triple — deliberately NOT
 * timezone-aware (matches weekdayForIsoDate's own reasoning: once you
 * have a wall-clock calendar date, adding/subtracting whole days never
 * depends on timezone). Used to compute "tomorrow"/"yesterday"/etc.
 * relative to `todayInTimeZone`'s already-timezone-resolved result. */
function addCalendarDays(year: number, month: number, day: number, deltaDays: number) {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Resolves a RELATIVE date expression ("today", "tomorrow" or its
 * texting shorthand, "day after tomorrow", "yesterday", "next Monday")
 * to a real "YYYY-MM-DD", computed deterministically against the
 * application's own authoritative `now`/`timeZone` — never left for the
 * model to guess (a genuine root cause traced live: these previously
 * resolved to a bare weekday name with no real calendar anchor at all,
 * see resolveDateWord's history). Checked in an order where each more
 * specific phrase is tested before a shorter one it textually contains
 * ("day after tomorrow" before bare "tomorrow", which it would otherwise
 * also match as a substring). "next <weekday>" always means the OCCURRENCE
 * STRICTLY AFTER today, even if today already is that weekday — the
 * least surprising reading for a scheduling system (if today is Monday,
 * "next Monday" means next week's Monday, not today). Returns undefined
 * for text naming no recognizable relative date — a bare weekday name
 * ("Monday", no "next") is deliberately NOT handled here; that stays
 * resolveDateWord's separate, unchanged bare-weekday fallback. */
function resolveRelativeDateWord(text: string, now: Date, timeZone: string): string | undefined {
  const lower = text.toLowerCase();
  const today = todayInTimeZone(timeZone, now);

  if (DAY_AFTER_TOMORROW_RE.test(lower)) {
    const d = addCalendarDays(today.year, today.month, today.day, 2);
    return isoDateFromYMD(d.year, d.month, d.day);
  }
  if (TODAY_WORD_RE.test(lower)) {
    return isoDateFromYMD(today.year, today.month, today.day);
  }
  if (TOMORROW_WORD_RE.test(lower) || TOMORROW_SHORTHAND_RE.test(lower)) {
    const d = addCalendarDays(today.year, today.month, today.day, 1);
    return isoDateFromYMD(d.year, d.month, d.day);
  }
  if (YESTERDAY_RE.test(lower)) {
    const d = addCalendarDays(today.year, today.month, today.day, -1);
    return isoDateFromYMD(d.year, d.month, d.day);
  }
  const nextWeek = lower.match(NEXT_WEEK_WEEKDAY_RE) ?? lower.match(WEEKDAY_NEXT_WEEK_RE);
  if (nextWeek) {
    const targetIndex = WEEKDAY_PREFIX_TO_INDEX[nextWeek[1].slice(0, 3)];
    if (targetIndex !== undefined) {
      const todayIndex = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
      const sinceMonday = (todayIndex + 6) % 7; // Monday = 0 … Sunday = 6
      const targetFromMonday = (targetIndex + 6) % 7;
      const d = addCalendarDays(
        today.year,
        today.month,
        today.day,
        7 - sinceMonday + targetFromMonday,
      );
      return isoDateFromYMD(d.year, d.month, d.day);
    }
  }
  const nextMatch = lower.match(NEXT_WEEKDAY_RE);
  if (nextMatch) {
    const prefix = nextMatch[1].slice(0, 3);
    const targetIndex = WEEKDAY_PREFIX_TO_INDEX[prefix];
    if (targetIndex !== undefined) {
      const todayIndex = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
      const diff = (targetIndex - todayIndex + 7) % 7 || 7;
      const d = addCalendarDays(today.year, today.month, today.day, diff);
      return isoDateFromYMD(d.year, d.month, d.day);
    }
  }
  return undefined;
}

/** Resolves "today" / "tomorrow" (or its texting shorthand) / "day after
 * tomorrow" / "yesterday" / "next <weekday>" / a bare weekday name / an
 * explicit calendar date ("Sept 12", "October 4th") to either a real
 * "YYYY-MM-DD" (every path except the bare-weekday fallback — see
 * resolveRelativeDateWord and resolveCalendarDateWord) or a canonical
 * weekday label (bare-weekday only — UNCHANGED behavior). Checked in
 * order from most to least specific so a message combining more than one
 * form ("Tuesday, Sept 12") resolves to the more specific, authoritative
 * real date rather than the redundant weekday name. Returns undefined if
 * the text names no recognizable date. `timeZone` matters for every
 * real-date path (deciding "today" itself, and which year an explicit
 * month+day means — see resolveCalendarDateWord); defaults to this
 * product's one business's zone since every real caller in this codebase
 * already has that exact business. */
export function resolveDateWord(
  text: string,
  now: Date = new Date(),
  timeZone = "America/Nassau",
): string | undefined {
  const calendarDate = resolveCalendarDateWord(text, now, timeZone);
  if (calendarDate) return calendarDate;

  const relativeDate = resolveRelativeDateWord(text, now, timeZone);
  if (relativeDate) return relativeDate;

  const lower = text.toLowerCase();
  const match = lower.match(WEEKDAY_WORD_RE);
  if (match) {
    const prefix = match[1].slice(0, 3);
    const index = WEEKDAY_PREFIX_TO_INDEX[prefix];
    if (index !== undefined) return WEEKDAY_NAMES[index];
  }

  return undefined;
}

/** month name/abbreviation (lowercase, trailing "." stripped) -> 1-12.
 * Every form the mission explicitly lists — including "Sept"/"Sept."
 * alongside "Sep"/"Sep." — plus every OTHER month's own two most common
 * shapes (bare 3-letter abbreviation and full name), so a customer isn't
 * penalized for writing "October" in full when only "Oct"/"Oct." was
 * asked for. */
const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** Matches a month name/abbreviation (optionally followed by ".") plus a
 * 1-2 digit day (optionally followed by an ordinal suffix) — "Sept 12",
 * "Sept. 12", "September 12th", "Oct. 4". The month/day pair is captured;
 * a same-message time ("Oct 4 at 2pm") is handled separately by
 * parseTime, same as every other date form here. */
const MONTH_DAY_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;

/** Same month vocabulary as MONTH_DAY_RE, but with NO day following it —
 * "start in October," "sometime in December." Genuinely ambiguous (which
 * day?), so this is never used to produce a date — see
 * resolveCalendarDateWord, which requires a day and returns undefined
 * for exactly this input. Item 13's "tell the customer what it
 * understood, then ask for what's missing" instead of silently ignoring
 * the month entirely: a caller asking for the still-missing date can use
 * this to say "Got it — October. Which day?" rather than a generic
 * "what day works for you?" that gives no sign the month was heard. */
const BARE_MONTH_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\b(?!\.?\s*\d)/i;

/** "October" (Title Case) for a bare month mention in `text`, or
 * undefined if the text mentions no month at all OR the month IS
 * followed by a day (that's resolveCalendarDateWord's job, a real date,
 * not this). */
export function detectBareMonthMention(text: string): string | undefined {
  if (MONTH_DAY_RE.test(text)) return undefined;
  const match = text.match(BARE_MONTH_RE);
  if (!match) return undefined;
  const monthKey = match[1].toLowerCase().replace(/\.$/, "");
  const month = MONTH_NAME_TO_NUMBER[monthKey];
  if (!month) return undefined;
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  );
}

/** "What's today's Y/M/D, in `timeZone`" — the same technique
 * appointment-timestamp.ts's currentLocalDate uses (Intl.DateTimeFormat,
 * not the server's own local clock), duplicated here rather than
 * imported to keep these two modules decoupled, matching this
 * codebase's existing pattern for small, purely mechanical helpers used
 * on both sides of a module boundary. */
function todayInTimeZone(
  timeZone: string,
  now: Date,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Resolves an explicit month+day mention ("Sept 12", "October 4th") to
 * a real calendar date, "YYYY-MM-DD" — the mission's own requirement:
 * "actual calendar dates, not just weekday strings," up to a year out.
 * Year is INFERRED, never asked for (a customer never says "Sept 12,
 * 2026" to a receptionist): this year if that month/day hasn't already
 * passed yet today (in `timeZone`), otherwise next year — always
 * resolving to the NEAREST future occurrence, which is by construction
 * within about a year of `now`. Returns undefined for text naming no
 * recognizable month+day, or for a calendar date that doesn't exist
 * (e.g. "Feb 30") rather than silently normalizing it. */
export function resolveCalendarDateWord(
  text: string,
  now: Date,
  timeZone: string,
): string | undefined {
  const match = text.match(MONTH_DAY_RE);
  if (!match) return undefined;

  const monthKey = match[1].toLowerCase().replace(/\.$/, "");
  const month = MONTH_NAME_TO_NUMBER[monthKey];
  if (!month) return undefined;

  const day = Number.parseInt(match[2], 10);
  if (day < 1 || day > 31) return undefined;

  const today = todayInTimeZone(timeZone, now);
  const alreadyPassedThisYear = month < today.month || (month === today.month && day < today.day);
  const year = today.year + (alreadyPassedThisYear ? 1 : 0);

  // Reject a calendar date that doesn't round-trip (e.g. "Feb 30")
  // rather than silently normalizing it to something the customer
  // didn't say — same never-guess contract as every other parser here.
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** True for a "YYYY-MM-DD"-shaped string — the one thing that
 * distinguishes a real calendar date (resolveCalendarDateWord's output)
 * from a canonical weekday name (every other resolveDateWord output) in
 * BookingState.date, which is typed as a plain string covering both. */
export function isIsoDateString(value: string): boolean {
  return STRICT_ISO_DATE_RE.test(value);
}

const STRICT_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The weekday a "YYYY-MM-DD" calendar date falls on — pure calendar
 * arithmetic (proleptic Gregorian via Date.UTC), deliberately NOT
 * timezone-aware: which day of the week a given date is doesn't depend
 * on timezone, only which INSTANT a wall-clock time resolves to does
 * (see appointment-timestamp.ts's zonedWallClockToUtc for that separate
 * concern). Lets business-hours.ts validate an explicit real date
 * ("2026-09-12") against BusinessContext.weeklyHours (keyed by weekday
 * name) without needing its own date-parsing logic. Throws on a
 * malformed date — callers are expected to have already validated the
 * shape via isIsoDateString first. */
export function weekdayForIsoDate(isoDate: string): string {
  const match = isoDate.match(STRICT_ISO_DATE_RE);
  if (!match) throw new Error(`weekdayForIsoDate: not a valid "YYYY-MM-DD" string: "${isoDate}"`);
  const [year, month, day] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

const TIME_WITH_MERIDIEM_RE = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i;

const CLOCK = String.raw`\d{1,2}(?::\d{2})?(?:\s?(?:am|pm))?`;
const NEGATED_TIME_RE = /\bnot\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s?(?:am|pm)?\b/i;
const PRECEDING_TIME_RE = /\d{1,2}(?::\d{2})?\s?(?:am|pm)\b[^\d]*$/i;
const TIME_QUALIFIER_RES: RegExp[] = [
  // "quarter to 3pm", "half past 3", "a quarter after 3"
  /\b(?:quarter|half)\s+(?:to|past|after|till|until|of)\s+\d/i,
  // "10 to 3pm", "20 past 3pm" — a minutes offset from an hour (needs the am/pm hour right after)
  /\b\d{1,2}\s+(?:to|past|till|until)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i,
  // "around 3pm", "before 3pm", "after 3pm" (a bare "around 2" only asks am/pm, so it is left to parseBareHour)
  /\b(?:before|after|around|about|roughly|approximately|approx|earlier than|later than|by|until|till)\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i,
  // "3pm or 4pm", "3 or 4pm", "3pm/4pm"
  new RegExp(String.raw`\b${CLOCK}\s*(?:or|/)\s*${CLOCK}\b`, "i"),
  // "3pm-ish", "3ish"
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)?\s?-?ish\b/i,
  // ranges: "from 2pm to 4pm", "between 2 and 4pm", "2-4pm", "2pm - 4pm"
  new RegExp(
    String.raw`\b(?:from|between)\s+${CLOCK}\s*(?:to|-|–|until|till|and)\s*${CLOCK}\b`,
    "i",
  ),
  new RegExp(
    String.raw`\b${CLOCK}\s*(?:-|–|to|until|till)\s*\d{1,2}(?::\d{2})?\s?(?:am|pm)\b`,
    "i",
  ),
];

/** True when a message qualifies a clock time instead of stating ONE exact
 * time — "quarter to 3pm", "not 3pm", "3pm or 4pm", "from 2pm to 4pm",
 * "around 3pm". Picking any single hour out of such a message is a guess
 * (the first "N pm" is often the opposite of what was meant), so the time
 * parsers return undefined for it and the caller asks for ONE clear time. */
export function hasTimeQualifier(text: string): boolean {
  if (TIME_QUALIFIER_RES.some((re) => re.test(text))) return true;
  // "not 3pm" with no time stated before it. A time BEFORE the "not" is the stated one ("make it 3pm not 2pm").
  const negated = NEGATED_TIME_RE.exec(text);
  return negated !== null && !PRECEDING_TIME_RE.test(text.slice(0, negated.index));
}

/** Parses a time into 24-hour "HH:MM". Requires an explicit am/pm — a
 * bare number like "6" is genuinely ambiguous for a business open past
 * noon, so this returns undefined rather than guessing, and the caller
 * asks specifically for the time again. */
export function parseTime(raw: string): string | undefined {
  const text = raw.replace(/\b([ap])\.m\.?(?!\w)/gi, "$1m"); // "9 a.m." -> "9 am"
  const match = text.match(TIME_WITH_MERIDIEM_RE);
  if (!match) return undefined;
  if (hasTimeQualifier(text)) return undefined; // clarify, never guess

  let hour = Number.parseInt(match[1], 10);
  if (hour < 1 || hour > 12) return undefined;
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (minute < 0 || minute > 59) return undefined;

  const meridiem = match[3].toLowerCase();
  if (hour === 12) hour = 0;
  if (meridiem === "pm") hour += 12;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const STRICT_24H_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Normalizes a STANDALONE time value — an action payload field like
 * `preferredTime`, not a full customer sentence (see parseTime for that)
 * — to canonical 24-hour "HH:MM". Accepts either an already-canonical
 * value or a 12-hour am/pm form ("2pm", "2:00 PM", "6pm"). Returns
 * undefined for anything genuinely invalid or ambiguous (a bare hour with
 * no am/pm, garbage) rather than guessing — same never-guess contract as
 * parseTime/resolveDateWord.
 *
 * The fix for a specific failure observed live: a model that reports
 * `preferredTime: "2:00 PM"` instead of "14:00" was previously rejected
 * by business-hours validation's strict `toMinutes` parser (which only
 * accepts "HH:MM") with a misleading "outside our hours" message, even
 * though 2:00 PM is well within business hours — see llm-provider.ts's
 * normalizeActionTime, which runs this BEFORE the hours/availability
 * checks, exactly parallel to how normalizeActionPhone already normalizes
 * a reported phone number before it's trusted. */
export function normalizeTime(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (STRICT_24H_TIME_RE.test(trimmed)) return trimmed;
  return parseTime(trimmed);
}

const PHONE_LIKE_RE = /\+?\d[\d\s().-]{5,}\d/g;
// Genuine bug found live: "I want a cleaning every 6 months" made the
// bare-hour parser mistake the "6" in "every 6 months" for a bare hour
// — bookingState ended up with a spurious pendingBareTime alongside the
// correctly-extracted recurrenceIntervalMonths. Stripped the same way
// PHONE_LIKE_RE already strips a phone-number-shaped digit run, so the
// interval's own digit is never eligible to also become a bare hour.
const RECURRENCE_INTERVAL_LIKE_RE = /\bevery\s+(\d{1,2}|three|six|twelve)\s+(months?|years?)\b/gi;
// Global variant of MONTH_DAY_RE, for stripping (not just testing) — a
// second, related genuine bug found live: "October 5" made the SAME
// bare-hour parser mistake the day number "5" for a bare hour, even
// though resolveDateWord had already, correctly, consumed the whole
// "October 5" as a real calendar date. A stray "pm" reply later could
// then have wrongly resolved to "5:00 PM" using a digit that was never
// an hour at all — narrow, but genuinely reachable (a customer asked
// "what time?" replying with a lone "pm").
const MONTH_DAY_LIKE_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
const BARE_HOUR_RE = /\b(1[0-2]|[1-9])(?::([0-5]\d))?\b/;

/** A lone hour (optionally with minutes) mentioned with NO am/pm
 * qualifier — e.g. "9" in "tomorrow at 9". Only meaningful as half of a
 * two-message exchange: the caller remembers it and combines it with a
 * later bare "am"/"pm" reply via combineBareTime, instead of discarding
 * it (or, worse, letting "pm" alone be mistaken for something else — see
 * dev-rule-based-provider.ts). Never fires if the message already
 * resolves a full time via parseTime, and ignores any phone-number-shaped,
 * recurrence-interval-shaped ("every 6 months"), OR calendar-date-shaped
 * ("October 5") digit run so none of those can misfire as a bare hour. */
export function parseBareHour(text: string): { hour: number; minute: number } | undefined {
  if (parseTime(text) || hasTimeQualifier(text)) return undefined;
  const withoutPhoneLike = text
    .replace(PHONE_LIKE_RE, " ")
    .replace(RECURRENCE_INTERVAL_LIKE_RE, " ")
    .replace(MONTH_DAY_LIKE_RE, " ");
  const match = withoutPhoneLike.match(BARE_HOUR_RE);
  if (!match) return undefined;
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  return { hour, minute };
}

const BARE_MERIDIEM_RE = /^\s*(am|pm)[\s.!]*$/i;

/** True only when the ENTIRE message is just an am/pm qualifier — the
 * second half of a two-message time exchange ("9" ... "pm"). Deliberately
 * strict (the whole message, not a substring) so an unrelated sentence
 * that happens to contain "am" (e.g. "I am available") is never mistaken
 * for answering a pending bare hour. */
export function parseBareMeridiem(text: string): "am" | "pm" | undefined {
  const match = text.match(BARE_MERIDIEM_RE);
  return match ? (match[1].toLowerCase() as "am" | "pm") : undefined;
}

/** Combines a previously-stated bare hour with a now-given meridiem into
 * the same 24-hour "HH:MM" shape parseTime produces. */
export function combineBareTime(
  bare: { hour: number; minute: number },
  meridiem: "am" | "pm",
): string {
  let hour = bare.hour;
  if (hour === 12) hour = 0;
  if (meridiem === "pm") hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(bare.minute).padStart(2, "0")}`;
}

/** Encodes a parseBareHour result into the single string
 * BookingState.pendingBareTime stores (a plain object there would need
 * its own migration/type; this matches every other BookingState field
 * being a primitive). Decoded back via decodeBareTime. */
export function encodeBareTime(bare: { hour: number; minute: number }): string {
  return `${bare.hour}:${bare.minute}`;
}

export function decodeBareTime(value: string): { hour: number; minute: number } {
  const [hourText, minuteText] = value.split(":");
  return { hour: Number.parseInt(hourText, 10), minute: Number.parseInt(minuteText ?? "0", 10) };
}

/** Removes any date/time substring this module would itself recognize
 * (a weekday word, "today"/"tomorrow"/its shorthand/"day after
 * tomorrow"/"yesterday"/"next <weekday>", an am/pm-qualified time) from
 * text, leaving whatever's left. Used to isolate a plausible bare name
 * out of a message that ALSO states a date and/or time in the same
 * breath ("Trevor Tuesday 2pm") — see dev-rule-based-provider.ts's
 * out-of-order name capture. The multi-word relative phrases are
 * stripped BEFORE the single-word ones they contain ("day after
 * tomorrow" before bare "tomorrow", "next Monday" before bare "Monday"),
 * same ordering discipline as resolveDateWord itself. */
export function stripRecognizedDateTime(text: string): string {
  return text
    .replace(TIME_WITH_MERIDIEM_RE, " ")
    .replace(DAY_AFTER_TOMORROW_RE, " ")
    .replace(new RegExp(NEXT_WEEK_WEEKDAY_RE.source, "gi"), " ")
    .replace(new RegExp(WEEKDAY_NEXT_WEEK_RE.source, "gi"), " ")
    .replace(/\bnext\s+week\b/gi, " ")
    .replace(new RegExp(NEXT_WEEKDAY_RE.source, "gi"), " ")
    .replace(YESTERDAY_RE, " ")
    .replace(TODAY_WORD_RE, " ")
    .replace(TOMORROW_WORD_RE, " ")
    .replace(TOMORROW_SHORTHAND_RE, " ")
    .replace(WEEKDAY_WORD_RE, " ");
}

/** Toggles a "HH:MM" 24-hour time between its AM and PM reading — "02:00"
 * (2 AM) <-> "14:00" (2 PM), "09:30" <-> "21:30" — the deterministic
 * heuristic behind "did you mean 2 PM instead?" when a stated time turns
 * out to be outside business hours (see llm-provider.ts's
 * pendingCorrection proposal). Pure hour arithmetic mod 24; never
 * guesses beyond this one specific, narrow transformation. */
export function flipMeridiemHour(time: string): string {
  const [hourText, minuteText] = time.split(":");
  const hour = Number.parseInt(hourText, 10);
  return `${String((hour + 12) % 24).padStart(2, "0")}:${minuteText}`;
}
