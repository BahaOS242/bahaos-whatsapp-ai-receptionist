import { describe, expect, it } from "vitest";
import {
  addMinutes,
  nextDateForWeekday,
  toCalendarRange,
} from "../../src/tools/calendar/calendar-datetime";

describe("nextDateForWeekday", () => {
  const wednesday = new Date("2026-08-19T12:00:00Z"); // confirmed Wednesday

  it("returns today's date when today already matches", () => {
    expect(nextDateForWeekday("Wednesday", wednesday)).toBe("2026-08-19");
  });

  it("returns the next occurrence for a future-this-week day", () => {
    expect(nextDateForWeekday("Friday", wednesday)).toBe("2026-08-21");
  });

  it("wraps to next week for a day earlier in the week", () => {
    expect(nextDateForWeekday("Monday", wednesday)).toBe("2026-08-24");
  });

  it("throws for an unrecognized weekday string", () => {
    expect(() => nextDateForWeekday("Someday", wednesday)).toThrow();
  });
});

describe("addMinutes", () => {
  it("adds minutes within the same hour", () => {
    expect(addMinutes("14:00", 45)).toBe("14:45");
  });

  it("rolls over to the next hour", () => {
    expect(addMinutes("14:30", 45)).toBe("15:15");
  });

  it("rolls over multiple hours", () => {
    expect(addMinutes("09:00", 90)).toBe("10:30");
  });
});

describe("toCalendarRange", () => {
  it("combines the resolved date, time, and duration into naive local datetimes", () => {
    const now = new Date("2026-08-19T12:00:00Z"); // Wednesday
    const range = toCalendarRange("Tuesday", "14:00", 45, now);
    // Next Tuesday from Wed 2026-08-19 is 2026-08-25.
    expect(range.startDateTime).toBe("2026-08-25T14:00:00");
    expect(range.endDateTime).toBe("2026-08-25T14:45:00");
  });
});
