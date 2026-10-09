import { describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { resolveAppointmentTimestamp } from "../../src/ai/appointment-timestamp";
import { resolveDateWord, stripRecognizedDateTime } from "../../src/ai/date-time";

/** PURE date logic (no providers, no DB). Policy: weeks run Monday–Sunday; "next week X" is X in the following calendar week. */
const TZ = "America/Nassau";
const at = (iso: string) => new Date(iso);

describe("next week <weekday>", () => {
  it("the reported case: Fri 2026-10-09 noon Nassau -> 2026-10-16, and the UTC instant agrees", () => {
    const now = at("2026-10-09T16:00:00Z");
    const date = resolveDateWord("next week Friday at 2pm", now, TZ);
    expect(date).toBe("2026-10-16");
    // the resolver takes a real ISO date for qualified dates (a bare weekday would resolve to TODAY)
    const resolved = resolveAppointmentTimestamp({ business: BAHAMAS_DENTAL_SERVICE, isoDate: date!, time: "14:00", now });
    expect(resolved).toMatchObject({ ok: true });
    expect(JSON.stringify(resolved)).toContain("2026-10-16T18:00:00.000Z");
    // and demonstrates the original defect mechanism: the bare weekday label lands on today
    const bare = resolveAppointmentTimestamp({ business: BAHAMAS_DENTAL_SERVICE, weekday: "Friday", time: "14:00", now });
    expect(JSON.stringify(bare)).toContain("2026-10-09T18:00:00.000Z");
  });
  it("control: 'next Friday' keeps its documented meaning (strictly after today)", () => {
    expect(resolveDateWord("next Friday at 2pm", at("2026-10-09T16:00:00Z"), TZ)).toBe("2026-10-16");
  });
  it("word order and filler: 'Friday next week', 'next week on Friday', 'next week, Friday'", () => {
    const now = at("2026-10-09T16:00:00Z");
    for (const t of ["Friday next week", "next week on Friday", "next week, Friday", "NEXT WEEK fri"]) expect(resolveDateWord(t, now, TZ)).toBe("2026-10-16");
  });
  it.each([
    ["Sunday belongs to the current week", "2026-10-11T16:00:00Z", "Friday", "2026-10-16"],
    ["Monday boundary: next week is the week AFTER this one", "2026-10-12T16:00:00Z", "Friday", "2026-10-23"],
    ["Monday of next week from a Wednesday", "2026-10-07T16:00:00Z", "Monday", "2026-10-12"],
    ["Sunday of next week from a Wednesday", "2026-10-07T16:00:00Z", "Sunday", "2026-10-18"],
    ["same weekday next week from Friday", "2026-10-09T16:00:00Z", "Friday", "2026-10-16"],
    ["year rollover", "2026-12-30T16:00:00Z", "Monday", "2027-01-04"],
    ["year rollover (Friday)", "2026-12-30T16:00:00Z", "Friday", "2027-01-08"],
    ["local midnight: 23:30 Nassau Fri is still Fri", "2026-10-10T03:30:00Z", "Friday", "2026-10-16"],
    ["local midnight: 00:30 Nassau Sat (UTC still Sat 04:30)", "2026-10-10T04:30:00Z", "Monday", "2026-10-12"],
    ["UTC already Monday, Nassau still Sunday", "2026-10-12T01:00:00Z", "Friday", "2026-10-16"],
  ])("%s", (_l, now, weekday, expected) => {
    expect(resolveDateWord(`next week ${weekday}`, at(now), TZ)).toBe(expected);
  });
  it("'next week' alone names no day, so it is NOT resolved (the caller must ask which day)", () => {
    expect(resolveDateWord("sometime next week", at("2026-10-09T16:00:00Z"), TZ)).toBeUndefined();
  });
  it("the qualifier is stripped so it cannot be mistaken for a name", () => {
    expect(stripRecognizedDateTime("next week Friday at 2pm").trim()).toMatch(/^(at)?$/i); // a stray "at" is handled by the capitalization rule, as before
    expect(stripRecognizedDateTime("Friday next week 2pm").trim()).toBe("");
    expect(stripRecognizedDateTime("Trevor next week Friday 2pm").trim()).toBe("Trevor");
  });
  it("a bare weekday keeps its old behaviour (a label, unchanged)", () => {
    expect(resolveDateWord("Friday at 2pm", at("2026-10-09T16:00:00Z"), TZ)).toBe("Friday");
  });
});
