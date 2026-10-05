import { validateAppointmentTime } from "../ai/business-hours";
import { CalendarAdapter } from "./calendar-adapter";
import { ClinicSimulationState, type BookResult, type SimulatedBooking } from "./simulation-state";
import type { BusinessContext } from "../ai/types";

/**
 * Public facade tying the read-only CalendarAdapter and the mutable
 * ClinicSimulationState together with the application's OWN,
 * already-existing, deterministic business-hours validation
 * (src/ai/business-hours.ts) — the one thing the reference calendar's
 * own metadata duplicates (Mon-Fri 9-5) but which must stay authoritative
 * from the application's `BusinessContext`, not re-derived from the
 * calendar file, so a single business definition remains the source of
 * truth for hours the way it already is everywhere else in this
 * codebase.
 *
 * This is what `createClinicSimulatorReceptionistTools` (see
 * src/tools/clinic-simulator-receptionist-tools.ts) is built on, and
 * what the reference-integrity test exercises directly.
 */
export interface ClinicSimulator {
  readonly calendar: CalendarAdapter;
  readonly state: ClinicSimulationState;

  /** Full deterministic check for a NEW appointment: business hours
   * (open day, fits before closing) AND calendar/simulation
   * availability (no conflict) AND within the reference calendar's known
   * date range. Never guesses, never asks the LLM — every reason is one
   * of these four, checked in this exact order so the customer always
   * gets the most specific, actionable explanation. */
  checkBookable(
    date: string,
    time: string,
    durationMinutes: number,
  ): { ok: true } | { ok: false; reason: "closed_day" | "outside_hours" | "out_of_range" | "conflict" };

  book(
    date: string,
    time: string,
    serviceId: string,
    durationMinutes: number,
    customerName: string,
    customerPhone: string,
  ): BookResult;

  cancel(bookingId: string): { ok: true } | { ok: false; reason: "not_found" };

  reschedule(
    bookingId: string,
    newDate: string,
    newTime: string,
    durationMinutes: number,
  ): { ok: true; booking: SimulatedBooking } | { ok: false; reason: "not_found" | "conflict" | "closed_day" | "outside_hours" | "out_of_range" };

  /** Scans forward in 30-minute-aligned, business-hours-only candidate
   * slots (skipping non-business days entirely, never a weekend/closed
   * day) starting from (fromDate, fromTime) — inclusive of that exact
   * slot — up to the reference calendar's own `dateEnd`, collecting up
   * to `count` genuinely bookable (hours + no conflict) results. Never
   * returns fewer than it could find within the reference window unless
   * the window itself is exhausted first. */
  findNextAvailable(
    fromDate: string,
    fromTime: string,
    durationMinutes: number,
    count: number,
  ): { date: string; time: string }[];
}

export function createClinicSimulator(
  business: BusinessContext,
  calendarPath?: string,
): ClinicSimulator {
  const calendar = new CalendarAdapter(calendarPath);
  const state = new ClinicSimulationState(calendar);

  function checkBookable(
    date: string,
    time: string,
    durationMinutes: number,
  ): { ok: true } | { ok: false; reason: "closed_day" | "outside_hours" | "out_of_range" | "conflict" } {
    const hours = validateAppointmentTime(business, date, time, durationMinutes);
    if (!hours.valid) return { ok: false, reason: hours.reason };
    if (!calendar.isWithinReferenceRange(date)) return { ok: false, reason: "out_of_range" };
    if (!state.isRangeAvailable(date, time, durationMinutes)) return { ok: false, reason: "conflict" };
    return { ok: true };
  }

  function book(
    date: string,
    time: string,
    serviceId: string,
    durationMinutes: number,
    customerName: string,
    customerPhone: string,
  ): BookResult {
    const check = checkBookable(date, time, durationMinutes);
    if (!check.ok) {
      return { ok: false, reason: check.reason === "conflict" ? "conflict" : "out_of_range" };
    }
    return state.book(date, time, durationMinutes, serviceId, customerName, customerPhone);
  }

  function cancel(bookingId: string): { ok: true } | { ok: false; reason: "not_found" } {
    return state.cancel(bookingId);
  }

  function reschedule(
    bookingId: string,
    newDate: string,
    newTime: string,
    durationMinutes: number,
  ) {
    const existing = state.getBooking(bookingId);
    if (!existing || existing.status !== "booked") return { ok: false as const, reason: "not_found" as const };

    const hours = validateAppointmentTime(business, newDate, newTime, durationMinutes);
    if (!hours.valid) return { ok: false as const, reason: hours.reason };
    if (!calendar.isWithinReferenceRange(newDate)) return { ok: false as const, reason: "out_of_range" as const };

    return state.reschedule(bookingId, newDate, newTime);
  }

  function findNextAvailable(
    fromDate: string,
    fromTime: string,
    durationMinutes: number,
    count: number,
  ): { date: string; time: string }[] {
    const results: { date: string; time: string }[] = [];
    const increment = calendar.metadata.slotIncrementMinutes;

    let cursorDate = fromDate;
    let cursorMinutes = toMinutes(fromTime);

    // Bounded by the reference calendar's own known range — never scans
    // forever, and never claims availability past what the simulator
    // actually has data for.
    while (cursorDate <= calendar.metadata.dateEnd && results.length < count) {
      const candidateTime = minutesToHHMM(cursorMinutes);
      const check = checkBookable(cursorDate, candidateTime, durationMinutes);
      if (check.ok) {
        results.push({ date: cursorDate, time: candidateTime });
      }

      cursorMinutes += increment;
      const closingMinutes = toMinutes(calendar.metadata.closingTime);
      if (cursorMinutes >= closingMinutes) {
        cursorDate = nextCalendarDate(cursorDate);
        cursorMinutes = toMinutes(calendar.metadata.openingTime);
      }
    }

    return results;
  }

  return { calendar, state, checkBookable, book, cancel, reschedule, findNextAvailable };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((part) => Number.parseInt(part, 10));
  return h * 60 + m;
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nextCalendarDate(date: string): string {
  const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10));
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
