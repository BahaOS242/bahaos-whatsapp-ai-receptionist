import { describe, expect, it } from "vitest";
import { createClinicSimulator } from "../../src/simulator/clinic-simulator";
import { CalendarAdapter } from "../../src/simulator/calendar-adapter";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";

/**
 * Clinic simulator — Section 1/3/4 of the mission. Booking, cancellation,
 * rescheduling, availability lookup, conflict detection, next-available
 * times, service duration, and operating-hour boundary cases, all
 * against the REAL reference calendar file (test-data/clinic-calendar/)
 * — never a hand-built fixture, so these tests double as proof the
 * adapter reads the real data correctly.
 */

// A known-empty weekday early in the reference range with no seeded
// conflicts on it, confirmed by inspection of the raw file.
const CLEAN_MONDAY = "2026-08-31";

describe("CalendarAdapter — read-only reference access", () => {
  it("loads real metadata from the reference file", () => {
    const adapter = new CalendarAdapter();
    expect(adapter.metadata.timezone).toBe("America/Nassau");
    expect(adapter.metadata.dateStart).toBe("2026-08-24");
    expect(adapter.metadata.dateEnd).toBe("2027-08-24");
    expect(adapter.metadata.openingTime).toBe("09:00");
    expect(adapter.metadata.closingTime).toBe("17:00");
  });

  it("loads the real seeded service catalogue", () => {
    const adapter = new CalendarAdapter();
    expect(adapter.getServiceDuration("consultation")).toBe(30);
    expect(adapter.getServiceDuration("cleaning")).toBe(60);
    expect(adapter.getServiceDuration("filling")).toBe(45);
    expect(adapter.getServiceDuration("root_canal")).toBe(90);
  });

  it("reflects the real seeded conflicts on the reference calendar's first day", () => {
    const adapter = new CalendarAdapter();
    expect(adapter.getReferenceSlot("2026-08-24", "10:00")?.status).toBe("booked");
    expect(adapter.getReferenceSlot("2026-08-24", "10:00")?.existingServiceId).toBe("consultation");
    expect(adapter.getReferenceSlot("2026-08-24", "11:00")?.status).toBe("booked");
    expect(adapter.getReferenceSlot("2026-08-24", "11:00")?.existingServiceId).toBe("root_canal");
    expect(adapter.getReferenceSlot("2026-08-24", "09:00")?.status).toBe("available");
  });

  it("isWithinReferenceRange bounds the known ~1-year window", () => {
    const adapter = new CalendarAdapter();
    expect(adapter.isWithinReferenceRange("2026-08-24")).toBe(true);
    expect(adapter.isWithinReferenceRange("2027-08-24")).toBe(true);
    expect(adapter.isWithinReferenceRange("2026-08-23")).toBe(false);
    expect(adapter.isWithinReferenceRange("2027-08-25")).toBe(false);
  });
});

describe("ClinicSimulator — availability, booking, conflict detection", () => {
  it("a plain open slot is bookable", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    expect(sim.checkBookable(CLEAN_MONDAY, "09:00", 60)).toEqual({ ok: true });
  });

  it("REGRESSION: a service that spans PAST a seeded booking's own 30-minute row is still caught — the raw file only marks the start row 'booked', not the rows it overlaps", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    // Seeded: 2026-08-24 11:00 root_canal (90 min) -> occupies 11:00-12:30.
    // 11:30 and 12:00 are literally marked "available" in the raw file.
    expect(sim.checkBookable("2026-08-24", "11:30", 30).ok).toBe(false);
    expect(sim.checkBookable("2026-08-24", "12:00", 30).ok).toBe(false);
    expect(sim.checkBookable("2026-08-24", "12:30", 30).ok).toBe(true); // root canal just ended
  });

  it("a NEW appointment overlapping a seeded booking's start time directly conflicts", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const result = sim.checkBookable("2026-08-24", "10:00", 30);
    expect(result).toEqual({ ok: false, reason: "conflict" });
  });

  it("books successfully, then the same slot conflicts for a second booking", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const first = sim.book(CLEAN_MONDAY, "10:00", "cleaning", 60, "Trevor", "+12428012847");
    expect(first.ok).toBe(true);

    const second = sim.book(CLEAN_MONDAY, "10:00", "filling", 45, "Someone Else", "+12428019999");
    expect(second).toEqual({ ok: false, reason: "conflict" });
  });

  it("a partial overlap with an existing SIMULATED booking is also caught", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    sim.book(CLEAN_MONDAY, "10:00", "cleaning", 60, "Trevor", "+12428012847"); // 10:00-11:00
    // A filling (45 min) starting at 10:30 would run 10:30-11:15,
    // overlapping the tail of the cleaning.
    expect(sim.checkBookable(CLEAN_MONDAY, "10:30", 45).ok).toBe(false);
    // Starting exactly when the cleaning ends does NOT conflict.
    expect(sim.checkBookable(CLEAN_MONDAY, "11:00", 45).ok).toBe(true);
  });

  it("cancellation frees the slot", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const booked = sim.book(CLEAN_MONDAY, "10:00", "cleaning", 60, "Trevor", "+12428012847");
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;

    expect(sim.checkBookable(CLEAN_MONDAY, "10:00", 60).ok).toBe(false);
    const cancelled = sim.cancel(booked.booking.id);
    expect(cancelled).toEqual({ ok: true });
    expect(sim.checkBookable(CLEAN_MONDAY, "10:00", 60).ok).toBe(true);
  });

  it("cancelling an unknown booking id fails cleanly", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    expect(sim.cancel("not-a-real-id")).toEqual({ ok: false, reason: "not_found" });
  });

  it("reschedule moves the appointment: old slot frees, new slot occupies", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const booked = sim.book(CLEAN_MONDAY, "10:00", "cleaning", 60, "Trevor", "+12428012847");
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;

    const rescheduled = sim.reschedule(booked.booking.id, CLEAN_MONDAY, "13:00", 60);
    expect(rescheduled.ok).toBe(true);

    // Old slot is free again.
    expect(sim.checkBookable(CLEAN_MONDAY, "10:00", 60).ok).toBe(true);
    // New slot is occupied.
    expect(sim.checkBookable(CLEAN_MONDAY, "13:00", 60).ok).toBe(false);
  });

  it("rescheduling to a conflicting slot fails and leaves the ORIGINAL appointment intact", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const a = sim.book(CLEAN_MONDAY, "10:00", "cleaning", 60, "Trevor", "+12428012847");
    const b = sim.book(CLEAN_MONDAY, "13:00", "filling", 45, "Someone Else", "+12428019999");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok) return;

    const result = sim.reschedule(a.booking.id, CLEAN_MONDAY, "13:00", 60);
    expect(result).toEqual({ ok: false, reason: "conflict" });
    // The original 10:00 appointment is still there, untouched.
    expect(sim.checkBookable(CLEAN_MONDAY, "10:00", 60).ok).toBe(false);
  });

  it("rescheduling to overlap its OWN current slot (e.g. shifting 30 min later) never falsely conflicts with itself", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const booked = sim.book(CLEAN_MONDAY, "10:00", "cleaning", 60, "Trevor", "+12428012847"); // 10:00-11:00
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;
    // Shift to 10:30-11:30 — overlaps the OLD 10:00-11:00 slot, but that's fine.
    const result = sim.reschedule(booked.booking.id, CLEAN_MONDAY, "10:30", 60);
    expect(result.ok).toBe(true);
  });
});

describe("ClinicSimulator — service duration / operating hours (Section 3)", () => {
  it("a normal appointment (30 min consultation) fits cleanly", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    expect(sim.checkBookable(CLEAN_MONDAY, "10:00", 30)).toEqual({ ok: true });
  });

  it("an appointment ending EXACTLY at 5 PM closing is valid", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    // Root canal (90 min) at 15:30 ends exactly at 17:00.
    expect(sim.checkBookable(CLEAN_MONDAY, "15:30", 90)).toEqual({ ok: true });
  });

  it("REGRESSION (mission's own example): Root canal at 4:00 PM is rejected — it would end at 5:30 PM", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    expect(sim.checkBookable(CLEAN_MONDAY, "16:00", 90)).toEqual({ ok: false, reason: "outside_hours" });
  });

  it("an appointment before opening (8:30 AM) is rejected", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    expect(sim.checkBookable(CLEAN_MONDAY, "08:30", 30)).toEqual({ ok: false, reason: "outside_hours" });
  });

  it("a weekend appointment is rejected as a closed day", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    // 2026-08-29 is a Saturday.
    expect(sim.checkBookable("2026-08-29", "10:00", 30)).toEqual({ ok: false, reason: "closed_day" });
  });

  it("an overlapping appointment (same reasoning as the gap-in-raw-data test above) is rejected as a conflict", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    sim.book(CLEAN_MONDAY, "10:00", "cleaning", 60, "Trevor", "+12428012847"); // 10:00-11:00
    expect(sim.checkBookable(CLEAN_MONDAY, "10:15", 30).ok).toBe(false);
  });

  it("a back-to-back appointment (starting exactly when another ends) is allowed", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    sim.book(CLEAN_MONDAY, "10:00", "cleaning", 60, "Trevor", "+12428012847"); // 10:00-11:00
    expect(sim.checkBookable(CLEAN_MONDAY, "11:00", 45).ok).toBe(true); // filling right after
  });

  it("a date outside the reference calendar's known ~1-year range is rejected, not silently treated as available", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    expect(sim.checkBookable("2099-01-05", "10:00", 30)).toEqual({ ok: false, reason: "out_of_range" });
  });
});

describe("ClinicSimulator — next available times", () => {
  it("returns the requested count of genuinely bookable slots, skipping the seeded conflicts", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const results = sim.findNextAvailable("2026-08-24", "09:00", 60, 3);
    expect(results).toHaveLength(3);
    // None of the returned slots may conflict with anything.
    for (const r of results) {
      expect(sim.checkBookable(r.date, r.time, 60).ok).toBe(true);
    }
    // The known seeded conflict windows are never among the results.
    expect(results).not.toContainEqual({ date: "2026-08-24", time: "10:00" });
    expect(results).not.toContainEqual({ date: "2026-08-24", time: "11:30" });
  });

  it("skips weekends entirely when scanning forward", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    // 2026-08-28 is a Friday; scanning from late Friday afternoon should
    // never return a Saturday/Sunday slot.
    const results = sim.findNextAvailable("2026-08-28", "16:00", 30, 5);
    for (const r of results) {
      expect(["2026-08-28", "2026-08-31", "2026-09-01"]).toContain(r.date);
    }
  });

  it("never returns a slot that would conflict once already claimed by an earlier simulated booking in the same scan window", () => {
    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    sim.book(CLEAN_MONDAY, "09:00", "cleaning", 60, "Trevor", "+12428012847");
    const results = sim.findNextAvailable(CLEAN_MONDAY, "09:00", 60, 1);
    expect(results[0]).not.toEqual({ date: CLEAN_MONDAY, time: "09:00" });
  });
});
