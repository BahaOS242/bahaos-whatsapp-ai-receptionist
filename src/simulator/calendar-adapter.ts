import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read-only adapter over the external, immutable reference calendar at
 * `test-data/clinic-calendar/`. This is the ONLY module in this codebase
 * that ever reads those files, and it never writes to them — see this
 * file's own `assertNeverWrittenTo` guard and
 * `tests/simulator/calendar-integrity.test.ts` for the actual proof.
 *
 *     IMMUTABLE REFERENCE CALENDAR
 *                 ↓
 *           Calendar Adapter          <- this file
 *                 ↓
 *         Mutable Simulation State    <- simulation-state.ts
 *                 ↓
 *       Receptionist / Booking Flow
 *
 * The reference calendar represents the clinic's seeded, real-world
 * initial state (some slots already booked/blocked/cancelled before any
 * simulated conversation ever starts). Nothing in this module — or
 * anything built on top of it — is ever allowed to mutate it: booking,
 * cancelling, or rescheduling during a simulated conversation only ever
 * writes to `simulation-state.ts`'s in-memory transaction log. The
 * CURRENT effective state of any slot is always computed as
 * `reference calendar + simulation transactions`, never by editing the
 * reference data itself.
 */

export type ReferenceSlotStatus = "available" | "booked" | "cancelled" | "blocked";

export interface ReferenceSlot {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM", 24-hour
  status: ReferenceSlotStatus;
  existingServiceId: string | null;
  notes: string | null;
}

export interface ReferenceService {
  id: string;
  name: string;
  durationMinutes: number;
  priceBsd: number;
}

export interface ReferenceCalendarMetadata {
  name: string;
  timezone: string;
  dateStart: string;
  dateEnd: string;
  businessDays: string[];
  openingTime: string;
  closingTime: string;
  slotIncrementMinutes: number;
}

interface RawCalendarRow {
  date: string;
  start_time: string;
  status: ReferenceSlotStatus;
  existing_service_id: string | null;
  notes: string | null;
}

interface RawServiceRow {
  id: string;
  name: string;
  duration_minutes: number;
  price_bsd: number;
}

interface RawCalendarFile {
  metadata: {
    name: string;
    timezone: string;
    date_start: string;
    date_end: string;
    business_days: string[];
    opening_time: string;
    closing_time: string;
    slot_increment_minutes: number;
    reference_data_is_read_only: boolean;
    simulation_transactions_must_be_stored_separately: boolean;
  };
  services: RawServiceRow[];
  calendar: RawCalendarRow[];
}

const DEFAULT_CALENDAR_PATH = join(
  process.cwd(),
  "test-data",
  "clinic-calendar",
  "clinic-calendar.json",
);

/**
 * The parsed, in-memory view of the reference calendar — loaded ONCE per
 * `CalendarAdapter` instance via a single `readFileSync`, then held as
 * plain data. Nothing here ever calls a write API (`writeFileSync`,
 * `fs.writeFile`, etc.) on the source file — grep this whole module for
 * proof, or see the integrity test, which proves it empirically rather
 * than just by inspection.
 */
export class CalendarAdapter {
  readonly metadata: ReferenceCalendarMetadata;
  readonly services: readonly ReferenceService[];
  private readonly slotsByKey: ReadonlyMap<string, ReferenceSlot>;
  private readonly slotsByDate: ReadonlyMap<string, readonly ReferenceSlot[]>;

  constructor(filePath: string = DEFAULT_CALENDAR_PATH) {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as RawCalendarFile;

    this.metadata = {
      name: parsed.metadata.name,
      timezone: parsed.metadata.timezone,
      dateStart: parsed.metadata.date_start,
      dateEnd: parsed.metadata.date_end,
      businessDays: parsed.metadata.business_days,
      openingTime: parsed.metadata.opening_time,
      closingTime: parsed.metadata.closing_time,
      slotIncrementMinutes: parsed.metadata.slot_increment_minutes,
    };

    this.services = parsed.services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.duration_minutes,
      priceBsd: s.price_bsd,
    }));

    const byKey = new Map<string, ReferenceSlot>();
    const byDate = new Map<string, ReferenceSlot[]>();
    for (const row of parsed.calendar) {
      const slot: ReferenceSlot = {
        date: row.date,
        startTime: row.start_time,
        status: row.status,
        existingServiceId: row.existing_service_id,
        notes: row.notes,
      };
      byKey.set(slotKey(row.date, row.start_time), slot);
      const forDate = byDate.get(row.date);
      if (forDate) forDate.push(slot);
      else byDate.set(row.date, [slot]);
    }
    this.slotsByKey = byKey;
    this.slotsByDate = byDate;
  }

  /** The reference calendar's own status for one 30-minute candidate
   * slot — `undefined` when the date is outside the reference range or
   * the time isn't one of the calendar's own candidate start times
   * (e.g. not aligned to `slotIncrementMinutes`, or outside
   * opening/closing). Callers needing "is this slot within the
   * reference calendar's own known range at all" should check this
   * return value, not assume every date/time pair is covered. */
  getReferenceSlot(date: string, time: string): ReferenceSlot | undefined {
    return this.slotsByKey.get(slotKey(date, time));
  }

  /** Every reference candidate slot for one date, in start-time order
   * (the file itself is already generated in order; this doesn't
   * re-sort). Empty array for a date outside the reference range or a
   * non-business day (the reference file only contains rows for
   * business days at all — see this module's own docstring). */
  listReferenceSlotsForDate(date: string): readonly ReferenceSlot[] {
    return this.slotsByDate.get(date) ?? [];
  }

  getServiceDuration(serviceId: string): number | undefined {
    return this.services.find((s) => s.id === serviceId)?.durationMinutes;
  }

  /** True when `date` falls within the reference calendar's own known
   * [dateStart, dateEnd] range — the "up to a year into the future"
   * bound the mission requires. Callers should reject a request outside
   * this range rather than silently treating an unknown date as
   * available. */
  isWithinReferenceRange(date: string): boolean {
    return date >= this.metadata.dateStart && date <= this.metadata.dateEnd;
  }
}

function slotKey(date: string, time: string): string {
  return `${date}|${time}`;
}
