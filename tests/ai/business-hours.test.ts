import { describe, expect, it } from "vitest";
import {
  describeInvalidTime,
  formatTime12h,
  isWithinOperatingWindow,
  validateAppointmentTime,
} from "../../src/ai/business-hours";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";

// Basic filling: 45 minutes. Business hours (from BAHAMAS_DENTAL_SERVICE):
// Mon–Fri 09:00–17:00, Sat/Sun closed.
const FILLING_DURATION = 45;

describe("validateAppointmentTime — inside hours", () => {
  it("accepts a normal mid-day appointment that fits before closing", () => {
    const result = validateAppointmentTime(
      BAHAMAS_DENTAL_SERVICE,
      "Tuesday",
      "14:00",
      FILLING_DURATION,
    );
    expect(result).toEqual({ valid: true });
  });
});

describe("validateAppointmentTime — boundaries", () => {
  it("accepts exactly opening time as a valid start", () => {
    const result = validateAppointmentTime(
      BAHAMAS_DENTAL_SERVICE,
      "Tuesday",
      "09:00",
      FILLING_DURATION,
    );
    expect(result).toEqual({ valid: true });
  });

  it("rejects exactly closing time as a start, because the appointment would run past closing", () => {
    // 17:00 + 45 minutes = 17:45, past the 17:00 close — this is the
    // documented boundary decision: closing time is never an acceptable
    // start time for any service with a positive duration.
    const result = validateAppointmentTime(
      BAHAMAS_DENTAL_SERVICE,
      "Tuesday",
      "17:00",
      FILLING_DURATION,
    );
    expect(result).toEqual({ valid: false, reason: "outside_hours" });
  });

  it("accepts a start time that ends exactly at closing", () => {
    // 16:15 + 45 minutes = 17:00 exactly — finishes within hours, so valid.
    const result = validateAppointmentTime(
      BAHAMAS_DENTAL_SERVICE,
      "Tuesday",
      "16:15",
      FILLING_DURATION,
    );
    expect(result).toEqual({ valid: true });
  });
});

describe("validateAppointmentTime — after hours", () => {
  it("rejects an evening request after closing", () => {
    const result = validateAppointmentTime(
      BAHAMAS_DENTAL_SERVICE,
      "Tuesday",
      "18:00",
      FILLING_DURATION,
    );
    expect(result).toEqual({ valid: false, reason: "outside_hours" });
  });

  it("rejects an early-morning request before opening", () => {
    const result = validateAppointmentTime(
      BAHAMAS_DENTAL_SERVICE,
      "Tuesday",
      "06:00",
      FILLING_DURATION,
    );
    expect(result).toEqual({ valid: false, reason: "outside_hours" });
  });
});

describe("validateAppointmentTime — closed days", () => {
  it("rejects a Sunday request regardless of time", () => {
    const result = validateAppointmentTime(
      BAHAMAS_DENTAL_SERVICE,
      "Sunday",
      "15:00",
      FILLING_DURATION,
    );
    expect(result).toEqual({ valid: false, reason: "closed_day" });
  });

  it("rejects a Saturday request regardless of time", () => {
    const result = validateAppointmentTime(
      BAHAMAS_DENTAL_SERVICE,
      "Saturday",
      "10:00",
      FILLING_DURATION,
    );
    expect(result).toEqual({ valid: false, reason: "closed_day" });
  });
});

describe("isWithinOperatingWindow (reschedule, duration-less)", () => {
  it("accepts a time within hours", () => {
    expect(isWithinOperatingWindow(BAHAMAS_DENTAL_SERVICE, "Wednesday", "10:00")).toEqual({
      valid: true,
    });
  });

  it("rejects a closed day", () => {
    expect(isWithinOperatingWindow(BAHAMAS_DENTAL_SERVICE, "Sunday", "10:00")).toEqual({
      valid: false,
      reason: "closed_day",
    });
  });

  it("rejects after-hours", () => {
    expect(isWithinOperatingWindow(BAHAMAS_DENTAL_SERVICE, "Wednesday", "19:00")).toEqual({
      valid: false,
      reason: "outside_hours",
    });
  });
});

describe("formatTime12h", () => {
  it("formats afternoon/evening times", () => {
    expect(formatTime12h("18:00")).toBe("6:00 PM");
    expect(formatTime12h("13:30")).toBe("1:30 PM");
  });

  it("formats morning times, including midnight/noon", () => {
    expect(formatTime12h("09:00")).toBe("9:00 AM");
    expect(formatTime12h("00:00")).toBe("12:00 AM");
    expect(formatTime12h("12:00")).toBe("12:00 PM");
  });
});

describe("describeInvalidTime", () => {
  it("explains a closed day and asks for another day", () => {
    const message = describeInvalidTime(
      BAHAMAS_DENTAL_SERVICE,
      { valid: false, reason: "closed_day" },
      "Sunday",
      "15:00",
    );
    expect(message).toMatch(/closed on sundays/i);
    expect(message).toMatch(/what day/i);
  });

  it("explains an out-of-hours time and asks for another time", () => {
    const message = describeInvalidTime(
      BAHAMAS_DENTAL_SERVICE,
      { valid: false, reason: "outside_hours" },
      "Tuesday",
      "18:00",
    );
    expect(message).toContain("6:00 PM");
    expect(message).toMatch(/outside our hours/i);
    expect(message).toMatch(/what time/i);
  });
});
