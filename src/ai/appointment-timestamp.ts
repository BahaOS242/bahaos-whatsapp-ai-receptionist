import type { BusinessContext, Weekday } from "./types";

/**
 * Deterministic, timezone-aware resolution from the application's own
 * canonical BookingState fields (a weekday name + "HH:MM", or an
 * explicit "YYYY-MM-DD" + "HH:MM") to a real UTC instant — the one thing
 * the database actually needs (`appointments.starts_at`/`ends_at`) that
 * nothing in this codebase produced before. The LLM is never the
 * authority for this: it only ever produces the raw conversational
 * signal that message-field-extraction.ts turns into a weekday name or
 * "HH:MM" deterministically; this module is the next, equally
 * deterministic step, turning that into the actual timestamp the
 * database's exclusion constraint and every downstream system reasons
 * about.
 *
 * No date library is used — Node has no stable built-in timezone-aware
 * date type yet (Temporal is not available in this runtime), and adding
 * one is unnecessary for what's actually needed here: resolving a wall-
 * clock date+time in a SPECIFIC, KNOWN IANA timezone (the business's) to
 * a UTC instant, and computing "what date is it right now, in that
 * timezone." Both are done correctly (including DST) using
 * Intl.DateTimeFormat, which already ships with Node.
 */

const WEEKDAY_ORDER: Weekday[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const STRICT_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const STRICT_ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface LocalDateParts {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: Weekday;
}

/** What the wall-clock date and weekday are, right now, IN the given IANA
 * timezone — not the server's own local time, and not bare UTC. This is
 * the piece that makes "today"/"tomorrow"/"is today Tuesday?" correct
 * regardless of what timezone the process happens to be running in. */
function currentLocalDate(timeZone: string, now: Date): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayShort = get("weekday"); // "Mon", "Tue", ...
  const weekdayIndex = WEEKDAY_SHORT_TO_INDEX[weekdayShort];
  if (weekdayIndex === undefined) {
    throw new Error(`appointment-timestamp: unrecognized weekday abbreviation "${weekdayShort}"`);
  }

  return {
    year: Number.parseInt(get("year"), 10),
    month: Number.parseInt(get("month"), 10),
    day: Number.parseInt(get("day"), 10),
    weekday: WEEKDAY_ORDER[weekdayIndex],
  };
}

const WEEKDAY_SHORT_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Adds `days` calendar days to a Y/M/D triple using UTC arithmetic
 * purely as a calendar calculator (no timezone meaning attached to this
 * intermediate Date — it's just a convenient proleptic-Gregorian
 * calculator that correctly handles month/year rollover). */
function addCalendarDays(
  parts: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Converts a wall-clock date+time that's meant to be interpreted IN
 * `timeZone` into the actual UTC instant it represents — correctly
 * across DST transitions. Standard "double conversion" technique: guess
 * the instant assuming UTC, ask the timezone what wall-clock time that
 * guess actually displays as, then correct by the difference (which
 * equals the zone's real UTC offset at that instant, DST included).
 */
function zonedWallClockToUtc(
  timeZone: string,
  parts: { year: number; month: number; day: number; hour: number; minute: number },
): Date {
  const guessUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const reported = formatter.formatToParts(new Date(guessUtcMs));
  const get = (type: string) => Number.parseInt(reported.find((p) => p.type === type)?.value ?? "0", 10);

  const reportedUtcMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), 0);
  const offsetMs = reportedUtcMs - guessUtcMs;

  return new Date(guessUtcMs - offsetMs);
}

export interface ResolveAppointmentTimestampInput {
  business: BusinessContext;
  /** Canonical weekday name, exactly what BookingState.date holds today
   * (see date-time.ts's resolveDateWord) — "today"/"tomorrow" have
   * already been resolved to a weekday name by that point. Mutually
   * exclusive with `isoDate`. */
  weekday?: Weekday;
  /** An explicit calendar date ("YYYY-MM-DD"). Nothing in the
   * conversational extraction layer produces one yet (see
   * PHASE1_PROGRESS.md — a documented, not-yet-implemented gap), but
   * this resolver supports it directly so that capability can be added
   * later without changing this function. Mutually exclusive with
   * `weekday`. */
  isoDate?: string;
  /** 24-hour "HH:MM", exactly what BookingState.time holds. */
  time: string;
  /** Defaults to the real current instant — injectable for deterministic
   * tests. */
  now?: Date;
}

export type ResolveAppointmentTimestampResult =
  | { ok: true; startsAt: Date }
  | { ok: false; reason: "invalid_time" | "invalid_date" | "ambiguous_input" | "in_the_past" };

/**
 * Resolves BookingState's weekday-or-explicit-date + time into a real
 * UTC instant, in the business's own timezone. Never guesses: malformed
 * input returns a typed failure rather than an approximate timestamp.
 *
 * Weekday resolution rule (the "Tuesday when today is Tuesday" case):
 * the NEXT occurrence of that weekday, where today itself counts as a
 * valid occurrence as long as the requested time hasn't already passed
 * yet today in the business's timezone — otherwise rolls forward to next
 * week. This matches how a human receptionist would actually interpret
 * "Tuesday at 2pm" said on a Tuesday: today if it's still morning,
 * next Tuesday if it's already evening. A resolved timestamp is
 * therefore NEVER in the past relative to `now` by construction for the
 * weekday path.
 */
export function resolveAppointmentTimestamp(
  input: ResolveAppointmentTimestampInput,
): ResolveAppointmentTimestampResult {
  const { business, weekday, isoDate, time } = input;
  const now = input.now ?? new Date();

  if (Boolean(weekday) === Boolean(isoDate)) {
    // Exactly one of weekday/isoDate must be given — both or neither is
    // a caller bug, not something to silently guess through.
    return { ok: false, reason: "ambiguous_input" };
  }

  const timeMatch = time.match(STRICT_TIME_RE);
  if (!timeMatch) {
    return { ok: false, reason: "invalid_time" };
  }
  const hour = Number.parseInt(timeMatch[1], 10);
  const minute = Number.parseInt(timeMatch[2], 10);

  const today = currentLocalDate(business.timezone, now);

  if (isoDate) {
    const dateMatch = isoDate.match(STRICT_ISO_DATE_RE);
    if (!dateMatch) {
      return { ok: false, reason: "invalid_date" };
    }
    const year = Number.parseInt(dateMatch[1], 10);
    const month = Number.parseInt(dateMatch[2], 10);
    const day = Number.parseInt(dateMatch[3], 10);
    // Reject a calendar date that doesn't round-trip (e.g. "2026-02-30")
    // rather than silently normalizing it to something the customer
    // didn't say.
    const roundTrip = new Date(Date.UTC(year, month - 1, day));
    if (
      roundTrip.getUTCFullYear() !== year ||
      roundTrip.getUTCMonth() !== month - 1 ||
      roundTrip.getUTCDate() !== day
    ) {
      return { ok: false, reason: "invalid_date" };
    }

    const startsAt = zonedWallClockToUtc(business.timezone, { year, month, day, hour, minute });
    if (startsAt.getTime() < now.getTime()) {
      return { ok: false, reason: "in_the_past" };
    }
    return { ok: true, startsAt };
  }

  // weekday path
  const targetIndex = WEEKDAY_ORDER.indexOf(weekday as Weekday);
  const todayIndex = WEEKDAY_ORDER.indexOf(today.weekday);
  let daysAhead = (targetIndex - todayIndex + 7) % 7;

  if (daysAhead === 0) {
    // Today IS the target weekday — only valid if the time hasn't
    // already passed; otherwise this is next week's occurrence.
    const candidate = zonedWallClockToUtc(business.timezone, { ...today, hour, minute });
    if (candidate.getTime() <= now.getTime()) {
      daysAhead = 7;
    }
  }

  const targetDate = addCalendarDays(today, daysAhead);
  const startsAt = zonedWallClockToUtc(business.timezone, { ...targetDate, hour, minute });
  return { ok: true, startsAt };
}

/** Convenience: `startsAt + durationMinutes`, as a plain UTC instant —
 * exactly what appointments.ends_at needs. */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
