import { createHash } from "node:crypto";
import { eq, isNotNull } from "drizzle-orm";
import { appointments } from "./schema";
import type { Db } from "./client";

/**
 * The database-authoritative booking transaction — the actual source of
 * truth for whether a slot is taken, as distinct from the application-
 * level availability check (src/ai/availability.ts) that only ever
 * produces conversational guidance ("that time works" / "here are
 * alternatives"). That check is inherently check-then-act and gives no
 * atomicity guarantee across two concurrent requests for the same slot;
 * this function is where the real guarantee lives, enforced by Postgres
 * itself via the `appointments_no_overlap` exclusion constraint (see
 * drizzle/0002_appointments_no_overlap.sql) — not by any locking or
 * coordination performed in this process.
 *
 * Deliberately NOT wired into ReceptionistTools/LLMProvider in this
 * change: doing so would require resolving a raw WhatsApp phone number
 * and a spoken service/date/time into real tenant_id/customer_id/
 * service_id/starts_at/ends_at values, which needs the CRM and date-
 * resolution layers that src/tools/calendar/internal-appointment-store.ts
 * already documents as explicitly out of scope (Phase 2+) — building
 * those now would mean inventing an unrelated system as a side effect of
 * a concurrency-safety task. What's built here is the actual database
 * layer the task asks for, proven correct against a real Postgres
 * instance (see tests/db/appointments-concurrency.test.ts), ready for
 * that future wiring to call directly.
 */


export interface CreateAppointmentInput {
  tenantId: string;
  customerId: string;
  serviceId: string;
  /** Nullable in the schema (no per-staff scheduling exists yet) — see
   * schema.ts's comment on this column and the migration's comment on
   * how NULL is handled for conflict purposes. */
  staffUserId?: string | null;
  startsAt: Date;
  endsAt: Date;
}

export type CreateAppointmentResult =
  | {
      success: true;
      appointment: typeof appointments.$inferSelect;
      /** True when this call didn't insert a new row — an appointment
       * with the identical idempotency key already existed (a retried
       * request), and that existing row was returned instead. Never true
       * for two DIFFERENT customers/requests, even if they raced for the
       * same slot — see buildIdempotencyKey. */
      idempotentReplay: boolean;
    }
  | {
      success: false;
      /** The slot genuinely conflicts with another (non-cancelled)
       * appointment for the same tenant/provider — enforced by
       * appointments_no_overlap, not by anything checked in this
       * process. */
      reason: "conflict";
    };

/** Postgres error codes this function needs to recognize. See
 * https://www.postgresql.org/docs/current/errcodes-appendix.html —
 * class 23 (integrity constraint violation): exclusion_violation; class
 * 40 (transaction rollback): deadlock_detected. */
const EXCLUSION_VIOLATION_CODE = "23P01";
const DEADLOCK_CODE = "40P01";

/** The raw `pg` driver error (which carries `.code`) is not necessarily
 * the error this function catches directly — Drizzle wraps it in its own
 * error type, with the original underneath as `.cause`. Checks both. */
function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === "string") return nested;
  }
  return undefined;
}

/** Deterministic from the booking's own identifying fields — a retry of
 * the SAME logical request (duplicate WhatsApp delivery, a network/client
 * retry, a model repeating a tool call, a webhook retry) always produces
 * the same key, so it resolves to the same row via the partial unique
 * index on this column, rather than creating a second appointment. Two
 * DIFFERENT customers requesting the same slot get DIFFERENT keys (their
 * customerId differs), so this never masks a genuine conflict — that's
 * appointments_no_overlap's job, checked separately below. */
function buildIdempotencyKey(input: CreateAppointmentInput): string {
  const raw = [
    input.tenantId,
    input.customerId,
    input.serviceId,
    input.staffUserId ?? "",
    input.startsAt.toISOString(),
    input.endsAt.toISOString(),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 64);
}

/** Combining `ON CONFLICT DO NOTHING` (speculative insertion, for the
 * idempotency check) with a SEPARATE exclusion constraint on the same
 * table is a documented PostgreSQL interaction: two concurrent inserts
 * that both hold a speculative-insertion token can end up waiting on
 * each other's token during the exclusion check, which Postgres reports
 * as a deadlock (40P01) rather than letting one of them cleanly lose via
 * 23P01 — observed directly while building this against a real database
 * (see tests/db/appointments-concurrency.test.ts's race test). This is
 * NOT a sign of a broken constraint: Postgres's own guidance for a
 * deadlock is that it is inherently transient and the correct response
 * is to retry — after a retry, the two transactions are essentially
 * never interleaved the exact same way again. Retried at most once;
 * MAX_RETRIES exists to bound worst-case latency, not because more than
 * one retry is expected to ever be needed in practice for two competing
 * requests. */
const MAX_DEADLOCK_RETRIES = 3;

/**
 * Attempts to create exactly one appointment for the given slot. Never
 * throws for the outcomes callers must handle as normal control flow (a
 * genuine slot conflict, or a replayed duplicate of the same request);
 * any other database error (a bad foreign key, a connection failure,
 * etc.) still propagates, since those are real failures the caller has
 * no principled way to recover from here.
 */
export async function createAppointment(
  db: Db,
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  const idempotencyKey = buildIdempotencyKey(input);

  for (let attempt = 0; ; attempt++) {
    try {
      const inserted = await db
        .insert(appointments)
        .values({
          tenantId: input.tenantId,
          customerId: input.customerId,
          serviceId: input.serviceId,
          staffUserId: input.staffUserId ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: "booked",
          idempotencyKey,
        })
        // Atomic, race-safe idempotency: if a row with this exact key
        // already exists (including one inserted by a concurrent retry
        // of the SAME request that's racing this one), Postgres
        // suppresses this insert instead of raising an error — no row
        // is returned. `where` must repeat the partial index's own
        // predicate (appointments_idempotency_key_key is `WHERE
        // idempotency_key IS NOT NULL` — see schema.ts) — Postgres can
        // only use a PARTIAL unique index as an ON CONFLICT arbiter when
        // the conflict target states the identical predicate itself
        // (error 42P10 otherwise).
        .onConflictDoNothing({
          target: appointments.idempotencyKey,
          where: isNotNull(appointments.idempotencyKey),
        })
        .returning();

      if (inserted.length > 0) {
        return { success: true, appointment: inserted[0], idempotentReplay: false };
      }

      // Suppressed by onConflictDoNothing — a row with this idempotency
      // key already exists (the unique index above is scoped to exactly
      // this column, so there is no other reason this could return zero
      // rows).
      const existing = await db.query.appointments.findFirst({
        where: eq(appointments.idempotencyKey, idempotencyKey),
      });
      if (!existing) {
        // Should be unreachable given the index's semantics — fail
        // loudly rather than silently reporting success with nothing to
        // show for it.
        throw new Error(
          "createAppointment: insert was suppressed as a duplicate, but no existing row was found",
        );
      }
      return { success: true, appointment: existing, idempotentReplay: true };
    } catch (error) {
      const code = pgErrorCode(error);
      if (code === EXCLUSION_VIOLATION_CODE) {
        return { success: false, reason: "conflict" };
      }
      if (code === DEADLOCK_CODE && attempt < MAX_DEADLOCK_RETRIES) {
        continue; // see MAX_DEADLOCK_RETRIES's comment — transient, safe to retry
      }
      throw error;
    }
  }
}
