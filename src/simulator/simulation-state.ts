import { randomUUID } from "node:crypto";
import type { CalendarAdapter, ReferenceSlot } from "./calendar-adapter";

/**
 * The MUTABLE half of the clinic simulator — everything a simulated
 * conversation actually changes lives here, as a transaction log, and
 * NEVER in the read-only `CalendarAdapter`/reference files. The
 * "current simulated clinic state" for any slot is always computed as
 * `reference calendar (CalendarAdapter) + these transactions`, recomputed
 * on every query rather than cached/mutated in place — there is no
 * single stored "is this slot free" bit, so there's nothing to get out
 * of sync with the transaction log itself.
 *
 * A real seeded reference appointment only marks its OWN 30-minute
 * start-time row in the calendar file (confirmed by inspection — e.g. a
 * 90-minute Root canal seeded at 11:00 leaves 11:30/12:00 marked
 * "available" in the raw file even though they're really occupied) — so
 * this module reconstructs each reference "booked" row's actual occupied
 * MINUTE RANGE from its `existingServiceId` + the service catalogue's
 * duration, and checks genuine interval overlap, never just "is this one
 * 30-minute row's own status booked." A "blocked" row (staff
 * unavailability) has no associated service, so it's treated as
 * occupying only its own 30-minute slot — a longer block would appear as
 * multiple consecutive "blocked" rows in the seed data, which this
 * handles correctly for free since each is checked independently.
 * "cancelled" rows never occupy anything (see the reference calendar's
 * own README).
 */

export interface SimulatedBooking {
  id: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  durationMinutes: number;
  serviceId: string;
  customerName: string;
  customerPhone: string;
  status: "booked" | "cancelled";
}

export type BookResult =
  | { ok: true; booking: SimulatedBooking }
  | { ok: false; reason: "conflict" | "out_of_range" };

export type CancelResult = { ok: true } | { ok: false; reason: "not_found" };

export type RescheduleResult =
  | { ok: true; booking: SimulatedBooking }
  | { ok: false; reason: "conflict" | "not_found" | "out_of_range" };

interface MinuteInterval {
  startMinutes: number;
  endMinutes: number; // exclusive
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((part) => Number.parseInt(part, 10));
  return h * 60 + m;
}

function intervalsOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

export class ClinicSimulationState {
  private readonly bookings = new Map<string, SimulatedBooking>();

  constructor(private readonly calendar: CalendarAdapter) {}

  /** Every occupied interval the REFERENCE calendar alone implies for
   * `date` — never mutated, recomputed from CalendarAdapter each call. */
  private referenceOccupiedIntervals(date: string): MinuteInterval[] {
    const slots = this.calendar.listReferenceSlotsForDate(date);
    const intervals: MinuteInterval[] = [];
    for (const slot of slots) {
      if (slot.status === "booked" && slot.existingServiceId) {
        const duration = this.calendar.getServiceDuration(slot.existingServiceId) ?? this.calendar.metadata.slotIncrementMinutes;
        const start = toMinutes(slot.startTime);
        intervals.push({ startMinutes: start, endMinutes: start + duration });
      } else if (slot.status === "blocked") {
        const start = toMinutes(slot.startTime);
        intervals.push({ startMinutes: start, endMinutes: start + this.calendar.metadata.slotIncrementMinutes });
      }
      // "available" and "cancelled" never occupy anything.
    }
    return intervals;
  }

  /** Every occupied interval THIS simulation's own transactions imply
   * for `date` — active (non-cancelled) bookings only. */
  private simulatedOccupiedIntervals(date: string): MinuteInterval[] {
    const intervals: MinuteInterval[] = [];
    for (const booking of this.bookings.values()) {
      if (booking.status !== "booked" || booking.date !== date) continue;
      const start = toMinutes(booking.startTime);
      intervals.push({ startMinutes: start, endMinutes: start + booking.durationMinutes });
    }
    return intervals;
  }

  /** True when an appointment of `durationMinutes` starting at
   * `startTime` on `date` would not overlap anything already occupying
   * that time — reference OR simulated. Does NOT check business hours
   * (see src/ai/business-hours.ts, an independent, already-existing
   * check every caller must ALSO run) or whether `date` itself falls
   * within the reference calendar's known range (see
   * CalendarAdapter.isWithinReferenceRange, checked separately by
   * `book`/`reschedule` below so a plain availability query can still
   * answer honestly for a date outside the seeded window: "not blocked
   * by anything," which is true, just not necessarily bookable). */
  isRangeAvailable(date: string, startTime: string, durationMinutes: number): boolean {
    const candidate: MinuteInterval = {
      startMinutes: toMinutes(startTime),
      endMinutes: toMinutes(startTime) + durationMinutes,
    };
    const occupied = [...this.referenceOccupiedIntervals(date), ...this.simulatedOccupiedIntervals(date)];
    return occupied.every((interval) => !intervalsOverlap(candidate, interval));
  }

  /** Books a new simulated appointment. Fails with `"conflict"` if
   * anything (reference or simulated) already occupies the range, or
   * `"out_of_range"` if `date` is outside the reference calendar's own
   * known window — never silently books past the data the simulator
   * actually knows about. Business-hours validation is the caller's
   * responsibility (see isRangeAvailable's docstring) — this function
   * only ever checks for a genuine SLOT conflict, the one thing it alone
   * knows about. */
  book(
    date: string,
    startTime: string,
    durationMinutes: number,
    serviceId: string,
    customerName: string,
    customerPhone: string,
  ): BookResult {
    if (!this.calendar.isWithinReferenceRange(date)) return { ok: false, reason: "out_of_range" };
    if (!this.isRangeAvailable(date, startTime, durationMinutes)) return { ok: false, reason: "conflict" };

    const booking: SimulatedBooking = {
      id: randomUUID(),
      date,
      startTime,
      durationMinutes,
      serviceId,
      customerName,
      customerPhone,
      status: "booked",
    };
    this.bookings.set(booking.id, booking);
    return { ok: true, booking };
  }

  cancel(bookingId: string): CancelResult {
    const booking = this.bookings.get(bookingId);
    if (!booking || booking.status !== "booked") return { ok: false, reason: "not_found" };
    this.bookings.set(bookingId, { ...booking, status: "cancelled" });
    return { ok: true };
  }

  /** Reschedule = atomically try the new slot, then cancel the old one —
   * same ordering principle as the DB-backed tools (never destroy the
   * customer's still-valid existing appointment before the new one is
   * confirmed to actually fit). Returns the NEW booking (a fresh id —
   * the old one is now cancelled, not reused, so it's never ambiguous
   * which is which in the transaction log). */
  reschedule(bookingId: string, newDate: string, newStartTime: string): RescheduleResult {
    const existing = this.bookings.get(bookingId);
    if (!existing || existing.status !== "booked") return { ok: false, reason: "not_found" };
    if (!this.calendar.isWithinReferenceRange(newDate)) return { ok: false, reason: "out_of_range" };

    // Temporarily treat the OLD slot as already freed while checking the
    // new one, so moving an appointment to overlap its own old slot
    // (e.g. shifting 30 minutes later on the same day) isn't rejected as
    // "conflicting with itself."
    const withoutExisting = new ClinicSimulationState(this.calendar);
    for (const booking of this.bookings.values()) {
      if (booking.id !== bookingId) withoutExisting.bookings.set(booking.id, booking);
    }
    if (!withoutExisting.isRangeAvailable(newDate, newStartTime, existing.durationMinutes)) {
      return { ok: false, reason: "conflict" };
    }

    this.bookings.set(bookingId, { ...existing, status: "cancelled" });
    const rebooked: SimulatedBooking = {
      id: randomUUID(),
      date: newDate,
      startTime: newStartTime,
      durationMinutes: existing.durationMinutes,
      serviceId: existing.serviceId,
      customerName: existing.customerName,
      customerPhone: existing.customerPhone,
      status: "booked",
    };
    this.bookings.set(rebooked.id, rebooked);
    return { ok: true, booking: rebooked };
  }

  getBooking(bookingId: string): SimulatedBooking | undefined {
    return this.bookings.get(bookingId);
  }

  /** Every currently-active (non-cancelled) simulated booking — for
   * tests and diagnostics, never read by any live booking decision
   * itself (those all go through isRangeAvailable). */
  listActiveBookings(): readonly SimulatedBooking[] {
    return [...this.bookings.values()].filter((b) => b.status === "booked");
  }
}

export type { ReferenceSlot };
