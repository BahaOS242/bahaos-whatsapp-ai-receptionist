import { sql } from "drizzle-orm";
import type { Db } from "../db/client";

/**
 * Reusable business-state checks for job handlers. A handler calls these
 * IMMEDIATELY before a side effect and returns `{ skipped: reason }` when the
 * answer is "no". They only read; they are tenant-scoped; they never decide
 * anything the application's own tools own (availability, pricing).
 *
 * A retried or requeued job passes through the same checks — a stale job can
 * never bypass today's state.
 */
export type Check = { ok: true } | { ok: false; reason: string };
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

/** AI-initiated automation is allowed only while the AI owns an OPEN conversation. */
export async function conversationAllowsAutomation(db: Db, tenantId: string, conversationId: string): Promise<Check> {
  const r = await db.execute(sql`SELECT status FROM conversations WHERE id = ${conversationId}::uuid AND tenant_id = ${tenantId}::uuid`);
  const status = (r.rows[0] as { status?: string } | undefined)?.status;
  if (!status) return no("conversation_not_found");
  if (status === "human_pending" || status === "staff_owned") return no("conversation_human_owned");
  if (status === "resolved") return no("conversation_closed");
  return yes;
}

/** An appointment must still exist and not be cancelled. */
export async function appointmentIsActive(db: Db, tenantId: string, appointmentId: string): Promise<Check> {
  const r = await db.execute(sql`SELECT status FROM appointments WHERE id = ${appointmentId}::uuid AND tenant_id = ${tenantId}::uuid`);
  const status = (r.rows[0] as { status?: string } | undefined)?.status;
  if (!status) return no("appointment_not_found");
  if (status === "cancelled" || status === "no_show" || status === "completed") return no(`appointment_${status}`);
  return yes;
}

/**
 * Consent. `transactional` (e.g. a reminder the customer asked for) is blocked only by an explicit
 * opt-out; `promotional` additionally requires an explicit opt-in.
 */
export async function customerMayBeContacted(db: Db, tenantId: string, customerId: string, purpose: "transactional" | "promotional"): Promise<Check> {
  const r = await db.execute(sql`SELECT consent_status FROM customers WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`);
  const c = (r.rows[0] as { consent_status?: string } | undefined)?.consent_status;
  if (!c) return no("customer_not_found");
  if (c === "opted_out") return no("customer_opted_out");
  if (purpose === "promotional" && c !== "opted_in") return no("no_promotional_consent");
  return yes;
}

/**
 * A job derived from a memory (or a customer statement) must not resurrect something removed
 * since it was scheduled: blocked if the slot was deleted/invalidated/superseded after `since`.
 */
export async function memorySlotNotRemovedSince(
  db: Db, scope: { tenantId: string; customerId: string }, kind: string, slot: string, since: Date,
): Promise<Check> {
  const r = await db.execute(sql`
    SELECT 1 FROM customer_memories
     WHERE tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid AND kind = ${kind}::memory_kind AND slot = ${slot}
       AND status IN ('deleted', 'invalidated', 'superseded') AND COALESCE(status_reason, '') <> 'expired'
       AND status_changed_at > ${since.toISOString()}::timestamptz LIMIT 1`);
  return r.rows.length ? no("memory_removed_since_scheduled") : yes;
}
