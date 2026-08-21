import { describe, expect, it } from "vitest";
import { parseTime, resolveDateWord } from "../../src/ai/date-time";

describe("resolveDateWord", () => {
  const wednesday = new Date("2026-08-19T12:00:00Z"); // a known Wednesday

  it("resolves 'today' relative to now", () => {
    expect(resolveDateWord("today", wednesday)).toBe("Wednesday");
  });

  it("resolves 'tomorrow' relative to now", () => {
    expect(resolveDateWord("tomorrow", wednesday)).toBe("Thursday");
  });

  it("normalizes an explicit weekday name", () => {
    expect(resolveDateWord("how about tuesday?")).toBe("Tuesday");
    expect(resolveDateWord("Tues works")).toBe("Tuesday");
  });

  it("returns undefined for text with no date", () => {
    expect(resolveDateWord("sometime soon")).toBeUndefined();
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
