import { describe, expect, it } from "vitest";
import {
  combineBareTime,
  normalizeTime,
  parseBareHour,
  parseBareMeridiem,
  parseTime,
  resolveDateWord,
} from "../../src/ai/date-time";

describe("resolveDateWord", () => {
  const wednesday = new Date("2026-08-19T12:00:00Z"); // a known Wednesday

  // Genuine bug found live (context-state regression, reschedule flow):
  // "today"/"tomorrow" used to resolve to a bare weekday NAME with no
  // real calendar anchor at all — ambiguous across multi-turn drift and
  // impossible to check against the reference calendar's per-date
  // conflict data. Now resolved to a real "YYYY-MM-DD", deterministically
  // anchored to the authoritative `now` passed in, never the model.
  it("resolves 'today' to a real ISO date, relative to now", () => {
    expect(resolveDateWord("today", wednesday)).toBe("2026-08-19");
  });

  it("resolves 'tomorrow' to a real ISO date, relative to now", () => {
    expect(resolveDateWord("tomorrow", wednesday)).toBe("2026-08-20");
  });

  it("resolves 'day after tomorrow' to a real ISO date — checked before bare 'tomorrow', which it textually contains", () => {
    expect(resolveDateWord("day after tomorrow", wednesday)).toBe("2026-08-21");
  });

  it("resolves 'yesterday' to a real ISO date", () => {
    expect(resolveDateWord("yesterday", wednesday)).toBe("2026-08-18");
  });

  it("resolves 'next <weekday>' to the occurrence strictly after today, even for today's own weekday", () => {
    // wednesday is 2026-08-19 — "next Wednesday" must NOT mean today.
    expect(resolveDateWord("next wednesday", wednesday)).toBe("2026-08-26");
    expect(resolveDateWord("next monday", wednesday)).toBe("2026-08-24");
    expect(resolveDateWord("next Tuesday", wednesday)).toBe("2026-08-25");
  });

  it("normalizes an explicit weekday name", () => {
    expect(resolveDateWord("how about tuesday?")).toBe("Tuesday");
    expect(resolveDateWord("Tues works")).toBe("Tuesday");
  });

  it("returns undefined for text with no date", () => {
    expect(resolveDateWord("sometime soon")).toBeUndefined();
  });

  it("REGRESSION (ROOT CAUSE #8): recognizes texting shorthand for 'tomorrow'", () => {
    expect(resolveDateWord("tmrw", wednesday)).toBe("2026-08-20");
    expect(resolveDateWord("tmr 9", wednesday)).toBe("2026-08-20");
    expect(resolveDateWord("2mrw", wednesday)).toBe("2026-08-20");
  });
});

describe("parseTime", () => {
  it("parses a bare hour with pm", () => {
    expect(parseTime("6pm")).toBe("18:00");
  });

  it("parses hour:minute with am", () => {
    expect(parseTime("9:30am")).toBe("09:30");
  });

  it("treats 12pm as noon and 12am as midnight", () => {
    expect(parseTime("12pm")).toBe("12:00");
    expect(parseTime("12am")).toBe("00:00");
  });

  it("refuses to guess a bare, ambiguous hour with no am/pm", () => {
    expect(parseTime("6")).toBeUndefined();
    expect(parseTime("tomorrow and 6")).toBeUndefined();
  });
});

describe("parseBareHour / parseBareMeridiem / combineBareTime (ROOT CAUSE #2 fix)", () => {
  it("parses a bare hour with no am/pm", () => {
    expect(parseBareHour("tomorrow at 9")).toEqual({ hour: 9, minute: 0 });
    expect(parseBareHour("around 2")).toEqual({ hour: 2, minute: 0 });
  });

  it("does not treat an already-fully-resolved time as a bare hour", () => {
    expect(parseBareHour("9pm")).toBeUndefined();
  });

  it("ignores a phone-number-shaped digit run", () => {
    expect(parseBareHour("242-801-2847")).toBeUndefined();
    expect(parseBareHour("Trevor 2428012847")).toBeUndefined();
  });

  it("recognizes a message that is JUST an am/pm qualifier", () => {
    expect(parseBareMeridiem("pm")).toBe("pm");
    expect(parseBareMeridiem("am")).toBe("am");
  });

  it("does not misread an unrelated sentence containing 'am'", () => {
    expect(parseBareMeridiem("I am available")).toBeUndefined();
  });

  it("combines a bare hour with a meridiem exactly like parseTime would", () => {
    expect(combineBareTime({ hour: 9, minute: 0 }, "pm")).toBe("21:00");
    expect(combineBareTime({ hour: 10, minute: 0 }, "am")).toBe("10:00");
    expect(combineBareTime({ hour: 12, minute: 0 }, "pm")).toBe("12:00");
    expect(combineBareTime({ hour: 12, minute: 0 }, "am")).toBe("00:00");
  });
});

describe("normalizeTime — REGRESSION: standalone action-payload time normalization", () => {
  // Live finding (Anthropic evaluation): a model reporting `preferredTime`
  // in a non-canonical format (e.g. "2:00 PM" instead of "14:00") was
  // silently rejected by business-hours validation's strict "HH:MM"
  // parser with a misleading "outside our hours" message, even for
  // objectively in-hours times. This is the fix, tested per the task's
  // own required examples.
  it("passes an already-canonical 24-hour value straight through", () => {
    expect(normalizeTime("14:00")).toBe("14:00");
    expect(normalizeTime("09:00")).toBe("09:00");
  });

  it("normalizes '2pm' to '14:00'", () => {
    expect(normalizeTime("2pm")).toBe("14:00");
  });

  it("normalizes '2:00 PM' to '14:00'", () => {
    expect(normalizeTime("2:00 PM")).toBe("14:00");
  });

  it("normalizes '6pm' to '18:00'", () => {
    expect(normalizeTime("6pm")).toBe("18:00");
  });

  it("rejects a bare hour with no am/pm rather than guessing", () => {
    expect(normalizeTime("2")).toBeUndefined();
    expect(normalizeTime("14")).toBeUndefined();
  });

  it("rejects an out-of-range hour", () => {
    expect(normalizeTime("24:00")).toBeUndefined();
    expect(normalizeTime("25:00")).toBeUndefined();
  });

  it("rejects genuinely invalid/ambiguous text rather than guessing", () => {
    expect(normalizeTime("afternoon")).toBeUndefined();
    expect(normalizeTime("")).toBeUndefined();
    expect(normalizeTime("whenever works")).toBeUndefined();
  });

  it("tolerates surrounding whitespace", () => {
    expect(normalizeTime("  14:00  ")).toBe("14:00");
    expect(normalizeTime(" 2pm ")).toBe("14:00");
  });
});
