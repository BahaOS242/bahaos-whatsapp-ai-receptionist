import { and, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { appointments } from "./schema";
import { resolveAppointmentTimestamp, addMinutes } from "../ai/appointment-timestamp";
import { validateAppointmentTime } from "../ai/business-hours";
import type { BusinessContext, Weekday } from "../ai/types";
import type { Db } from "./client";

/**
 * Real, database-backed availability — distinct from
 * src/ai/availability.ts, which only ever checks a static in-memory
 * list and exists purely for conversational guidance (see
 * PHASE1_PROGRESS.md's design note). This is the actual source of truth
 * used to offer alternatives after a real conflict; it is a genuine
 * database query, not a second copy of the exclusion constraint's own
 * logic — the constraint remains the ONLY thing that can ever actually
 * reject a write.
 */


/** Same "NULL staff = one shared resource per tenant" semantics as the
 * appointments_no_overlap exclusion constraint (see
 * drizzle/0002_appointments_no_overlap.sql) — matches BOTH-null or
 * BOTH-equal, never "NULL is distinct from itself." */
function sameStaffCondition(staffUserId: string | null) {
  return staffUserId === null
    ? isNull(appointments.staffUserId)
    : eq(appointments.staffUserId, staffUserId);
}

async function isDbSlotAvailable(
  db: Db,
  tenantId: string,
  staffUserId: string | null,
  startsAt: Date,
  endsAt: Date,
): Promise<boolean> {
  const conflict = await db.query.appointments.findFirst({
    where: and(
      eq(appointments.tenantId, tenantId),
      sameStaffCondition(staffUserId),
      ne(appointments.status, "cancelled"),
      // Standard interval-overlap predicate — the same thing the
      // exclusion constraint enforces atomically at write time; this is
      // a read-only preview of the same truth; see the constraint's own
      // migration comment for why '[)' semantics (back-to-back
      // appointments never conflict).
      lt(appointments.startsAt, endsAt),
      gt(appointments.endsAt, startsAt),
    ),
  });
  return !conflict;
}

const CANDIDATE_STEP_MINUTES = 30;

/**
 * Up to `count` other same-day times that are both within business hours
 * (for this service's duration) and actually free in the database, in
 * chronological order — the DB-backed sibling of
 * src/ai/availability.ts's findAlternativeTimes, used specifically when
 * offering alternatives after a real database conflict (never guessed,
 * never sourced from the static in-memory list).
 */
export async function findDbAlternativeTimes(
  db: Db,
  tenantId: string,
  staffUserId: string | null,
  business: BusinessContext,
  weekday: Weekday,
  durationMinutes: number,
  excludeTime: string,
  now: Date,
  count = 3,
): Promise<string[]> {
  const dayHours = business.weeklyHours[weekday];
  if (!dayHours) return [];

  const [openHour, openMinute] = dayHours.open.split(":").map(Number);
  const [closeHour, closeMinute] = dayHours.close.split(":").map(Number);
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;

  const alternatives: string[] = [];
  for (
    let minutes = openMinutes;
    minutes < closeMinutes && alternatives.length < count;
    minutes += CANDIDATE_STEP_MINUTES
  ) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const candidateTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    if (candidateTime === excludeTime) continue;
    if (!validateAppointmentTime(business, weekday, candidateTime, durationMinutes).valid) continue;

    const resolved = resolveAppointmentTimestamp({ business, weekday, time: candidateTime, now });
    if (!resolved.ok) continue;
    const endsAt = addMinutes(resolved.startsAt, durationMinutes);

    if (await isDbSlotAvailable(db, tenantId, staffUserId, resolved.startsAt, endsAt)) {
      alternatives.push(candidateTime);
    }
  }
  return alternatives;
}

export { isDbSlotAvailable };
