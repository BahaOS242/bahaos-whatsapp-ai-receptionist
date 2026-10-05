import { describe, expect, it } from "vitest";
import { addMinutes, resolveAppointmentTimestamp } from "../../src/ai/appointment-timestamp";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { BusinessContext } from "../../src/ai/types";

// BAHAMAS_DENTAL_SERVICE.timezone is "America/Nassau" (observes US
// Eastern time, EST/EDT) — used throughout to prove timezone-correctness
// against a REAL IANA zone with real DST transitions, not a fixed offset.
const business: BusinessContext = BAHAMAS_DENTAL_SERVICE;

function iso(businessLocalIso: string): Date {
  // Helper for test authors only: an ISO string already known to be a
  // specific UTC instant, used to construct deterministic `now` values.
  return new Date(businessLocalIso);
}

describe("resolveAppointmentTimestamp — weekday resolution", () => {
  it("resolves a future weekday within the same week", () => {
    // 2026-08-24 is a Monday (EDT, UTC-4).
    const now = iso("2026-08-24T14:00:00.000Z"); // Monday 10:00 AM EDT
    const result = resolveAppointmentTimestamp({ business, weekday: "Wednesday", time: "14:00", now });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Wednesday 2026-08-26 at 14:00 EDT = 18:00 UTC
      expect(result.startsAt.toISOString()).toBe("2026-08-26T18:00:00.000Z");
    }
  });

  it('"today": resolving the CURRENT weekday when the requested time has NOT yet passed resolves to today', () => {
    // Monday 2026-08-24, 10:00 AM EDT local time (14:00 UTC).
    const now = iso("2026-08-24T14:00:00.000Z");
    const result = resolveAppointmentTimestamp({ business, weekday: "Monday", time: "16:00", now });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Same day, 16:00 EDT = 20:00 UTC.
      expect(result.startsAt.toISOString()).toBe("2026-08-24T20:00:00.000Z");
    }
  });

  it('"Tuesday when today is Tuesday" AND the time has already passed: rolls forward to NEXT Tuesday, not today', () => {
    // Tuesday 2026-08-25, 4:00 PM EDT local time (20:00 UTC).
    const now = iso("2026-08-25T20:00:00.000Z");
    const result = resolveAppointmentTimestamp({ business, weekday: "Tuesday", time: "14:00", now });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // NOT today (14:00 already passed, it's 16:00 now) — next Tuesday,
      // 2026-09-01, 14:00 EDT = 18:00 UTC.
      expect(result.startsAt.toISOString()).toBe("2026-09-01T18:00:00.000Z");
    }
  });

  it('"Tuesday when today is Tuesday" AND the time has NOT yet passed: resolves to today', () => {
    // Tuesday 2026-08-25, 9:00 AM EDT local time (13:00 UTC).
    const now = iso("2026-08-25T13:00:00.000Z");
    const result = resolveAppointmentTimestamp({ business, weekday: "Tuesday", time: "14:00", now });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.startsAt.toISOString()).toBe("2026-08-25T18:00:00.000Z");
    }
  });

  it("a resolved weekday timestamp is NEVER in the past, across a full week of 'now' values", () => {
    const start = iso("2026-08-24T12:00:00.000Z"); // a Monday
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      for (const weekday of [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ] as const) {
        const now = new Date(start.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const result = resolveAppointmentTimestamp({ business, weekday, time: "09:00", now });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.startsAt.getTime()).toBeGreaterThan(now.getTime());
        }
      }
    }
  });

  it("wraps correctly from Saturday to next Sunday", () => {
    // Saturday 2026-08-29, EDT.
    const now = iso("2026-08-29T14:00:00.000Z");
    const result = resolveAppointmentTimestamp({ business, weekday: "Sunday", time: "10:00", now });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.startsAt.toISOString()).toBe("2026-08-30T14:00:00.000Z"); // Sunday 10:00 EDT = 14:00 UTC
    }
  });
});

describe("resolveAppointmentTimestamp — explicit calendar dates", () => {
  it("resolves a valid future explicit date", () => {
    const now = iso("2026-08-24T12:00:00.000Z");
    const result = resolveAppointmentTimestamp({
      business,
      isoDate: "2026-09-05",
      time: "10:00",
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.startsAt.toISOString()).toBe("2026-09-05T14:00:00.000Z"); // EDT
    }
  });

  it("rejects an explicit date that is in the past", () => {
    const now = iso("2026-08-24T12:00:00.000Z");
    const result = resolveAppointmentTimestamp({
      business,
      isoDate: "2026-08-20",
      time: "10:00",
      now,
    });

    expect(result).toEqual({ ok: false, reason: "in_the_past" });
  });

  it("rejects a calendar date that doesn't exist, rather than silently normalizing it", () => {
    const result = resolveAppointmentTimestamp({
      business,
      isoDate: "2026-02-30", // February never has 30 days
      time: "10:00",
      now: iso("2026-01-01T12:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "invalid_date" });
  });

  it("rejects a malformed date string", () => {
    const result = resolveAppointmentTimestamp({
      business,
      isoDate: "not-a-date",
      time: "10:00",
      now: iso("2026-01-01T12:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "invalid_date" });
  });
});

describe("resolveAppointmentTimestamp — invalid input, never guessed", () => {
  it("rejects a malformed time", () => {
    const result = resolveAppointmentTimestamp({
      business,
      weekday: "Tuesday",
      time: "2pm", // not canonical HH:MM
      now: iso("2026-08-24T12:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "invalid_time" });
  });

  it("rejects an out-of-range time", () => {
    const result = resolveAppointmentTimestamp({
      business,
      weekday: "Tuesday",
      time: "25:00",
      now: iso("2026-08-24T12:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "invalid_time" });
  });

  it("rejects when neither weekday nor isoDate is given", () => {
    const result = resolveAppointmentTimestamp({
      business,
      time: "10:00",
      now: iso("2026-08-24T12:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "ambiguous_input" });
  });

  it("rejects when BOTH weekday and isoDate are given (caller bug, not something to silently resolve one way)", () => {
    const result = resolveAppointmentTimestamp({
      business,
      weekday: "Tuesday",
      isoDate: "2026-09-01",
      time: "10:00",
      now: iso("2026-08-24T12:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "ambiguous_input" });
  });
});

describe("resolveAppointmentTimestamp — DST / timezone boundary correctness (America/Nassau)", () => {
  it("resolves correctly on the EST side of the DST boundary (winter, UTC-5)", () => {
    // 2026-01-06 is a Tuesday, well into EST (UTC-5).
    const now = iso("2026-01-05T12:00:00.000Z"); // Monday
    const result = resolveAppointmentTimestamp({ business, weekday: "Tuesday", time: "14:00", now });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // 14:00 EST = 19:00 UTC (UTC-5, no DST in January).
      expect(result.startsAt.toISOString()).toBe("2026-01-06T19:00:00.000Z");
    }
  });

  it("resolves correctly on the EDT side of the DST boundary (summer, UTC-4)", () => {
    // Already covered by other tests above (August = EDT), asserted
    // explicitly here for clarity: the SAME wall-clock time produces a
    // DIFFERENT UTC offset than the winter case, proving DST is actually
    // being applied, not a fixed offset.
    const now = iso("2026-08-24T12:00:00.000Z"); // Monday, EDT
    const result = resolveAppointmentTimestamp({ business, weekday: "Tuesday", time: "14:00", now });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.startsAt.toISOString()).toBe("2026-08-25T18:00:00.000Z"); // UTC-4
    }
  });

  it("resolves the weekday/date correctly near UTC midnight, when the business-local date differs from the UTC date", () => {
    // 2026-08-25 03:00 UTC is still 2026-08-24, 23:00 EDT the PREVIOUS
    // day in Nassau — if "today" were computed from bare UTC instead of
    // the business timezone, this would incorrectly treat "today" as
    // Tuesday (Aug 25 UTC) instead of the correct Monday (Aug 24 local).
    const now = iso("2026-08-25T03:00:00.000Z");
    const result = resolveAppointmentTimestamp({ business, weekday: "Monday", time: "09:00", now });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // It's still Monday night locally, and 09:00 already passed
      // hours ago — so this resolves to NEXT Monday, not "today" a
      // second time and not the wrong day entirely.
      expect(result.startsAt.toISOString()).toBe("2026-08-31T13:00:00.000Z");
    }
  });
});

describe("addMinutes", () => {
  it("adds minutes to produce an ends_at from a starts_at + service duration", () => {
    const start = new Date("2026-08-25T18:00:00.000Z");
    expect(addMinutes(start, 30).toISOString()).toBe("2026-08-25T18:30:00.000Z");
    expect(addMinutes(start, 90).toISOString()).toBe("2026-08-25T19:30:00.000Z");
  });
});
