import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditEvents, outboxMessages } from "../db/schema";
import { wakeOutboxWorkers } from "./outbox-worker";

/**
 * DEAD-LETTER REQUEUE — the smallest safe operator action on the outbox.
 *
 * SEMANTICS (precisely):
 *
 *  • Identity is PRESERVED. Requeue resets the SAME row: same outbox id,
 *    same idempotency key, same `messages` log row. It never inserts a new
 *    row, so one logical message can never become two independently
 *    tracked ones, and the unique indexes make a second row impossible.
 *
 *  • Only a `dead_letter` row can be requeued. The transition is a single
 *    conditional UPDATE (`WHERE status = 'dead_letter'`), so concurrent
 *    requeues have exactly one winner; every other caller (and any repeated
 *    call) gets `not_dead_letter` and changes nothing — repeated requeue is
 *    a safe no-op.
 *
 *  • Tenant-owned. The row must belong to the caller's tenant; another
 *    tenant's row is reported as `not_found` (existence is not leaked).
 *
 *  • Retry state: `attempt_count` restarts at 0 (a fresh `max_attempts`
 *    budget — the operator is deliberately giving it another chance),
 *    `available_at` = now, `failed_at` cleared, claim/lease cleared (the
 *    next claim mints a fresh fencing token, so no earlier worker can ever
 *    write to it). `requeue_count` increments.
 *
 *  • History is preserved, never overwritten: the previous attempt count,
 *    error code, error text, failure time, dead-letter reason, who
 *    requeued it and when are APPENDED to `error_metadata.history`, and an
 *    `audit_events` row is written in the same transaction. The row's
 *    `last_error` / `error_code` keep showing the last failure until a
 *    delivery succeeds.
 *
 *  • Ordering: the row keeps its ORIGINAL position (`seq`), so it becomes
 *    the head of its conversation again — any LATER message that has not
 *    been sent yet waits behind it, exactly as for a retry. But a later
 *    message that was ALREADY SENT (a dead letter releases the line) cannot
 *    be un-sent; the result reports `outOfOrder: true` so the operator knows
 *    the customer will receive this message after newer ones.
 */

export interface RequeueParams {
  tenantId: string;
  /** Identify the message by outbox id OR by its conversation-log message id. */
  outboxId?: string;
  messageId?: string;
  /** Who is doing this (recorded in the history/audit trail). */
  requestedBy?: string;
  now?: Date;
}

export type RequeueResult =
  | {
      ok: true;
      outboxId: string;
      requeueCount: number;
      previousAttemptCount: number;
      /** A later message in this conversation was already sent. */
      outOfOrder: boolean;
    }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "not_dead_letter"; currentStatus: string };

export async function requeueDeadLetter(db: Db, params: RequeueParams): Promise<RequeueResult> {
  if (!params.outboxId && !params.messageId) throw new Error("requeueDeadLetter: provide outboxId or messageId");
  const now = (params.now ?? new Date()).toISOString();
  const by = params.requestedBy ?? "system";
  const target = params.outboxId
    ? sql`id = ${params.outboxId}::uuid`
    : sql`message_id = ${params.messageId}::uuid`;

  const result = await db.transaction(async (tx): Promise<RequeueResult & { _conversationId?: string }> => {
    const updated = await tx.execute(sql`
      UPDATE outbox_messages u
         SET status = 'pending',
             attempt_count = 0,
             available_at = ${now}::timestamptz,
             failed_at = NULL,
             claimed_at = NULL,
             lease_expires_at = NULL,
             claim_token = NULL,
             requeue_count = u.requeue_count + 1,
             error_metadata = jsonb_set(
               COALESCE(u.error_metadata, '{}'::jsonb) - 'deadLetterReason',
               '{history}',
               COALESCE(u.error_metadata->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                 'event', 'requeued',
                 'at', ${now}::text,
                 'by', ${by}::text,
                 'previousAttemptCount', u.attempt_count,
                 'previousErrorCode', u.error_code,
                 'previousError', u.last_error,
                 'previousFailedAt', u.failed_at,
                 'deadLetterReason', u.error_metadata->>'deadLetterReason')),
               true),
             updated_at = ${now}::timestamptz
       WHERE u.tenant_id = ${params.tenantId}::uuid AND ${target} AND u.status = 'dead_letter'
   RETURNING u.id, u.conversation_id, u.message_id, u.requeue_count, u.seq,
             (u.error_metadata->'history'->-1->>'previousAttemptCount')::int AS previous_attempts`);

    if (updated.rows.length === 0) {
      const existing = await tx.query.outboxMessages.findFirst({
        where: and(
          eq(outboxMessages.tenantId, params.tenantId),
          params.outboxId ? eq(outboxMessages.id, params.outboxId) : eq(outboxMessages.messageId, params.messageId!),
        ),
      });
      return existing ? { ok: false, reason: "not_dead_letter", currentStatus: existing.status } : { ok: false, reason: "not_found" };
    }

    const row = updated.rows[0] as { id: string; conversation_id: string; message_id: string; requeue_count: number; seq: string | number; previous_attempts: number };
    await tx.execute(sql`UPDATE messages SET status = 'queued', outbound_attempts = 0, next_retry_at = NULL WHERE id = ${row.message_id}::uuid`);
    const later = await tx.execute(sql`
      SELECT 1 FROM outbox_messages WHERE conversation_id = ${row.conversation_id}::uuid AND seq > ${row.seq} AND status = 'sent' LIMIT 1`);
    await tx.insert(auditEvents).values({
      tenantId: params.tenantId,
      actorType: params.requestedBy ? "staff" : "system",
      eventType: "outbox.requeued",
      entityType: "outbox_message",
      entityId: row.id,
      metadata: { requestedBy: by, previousAttemptCount: row.previous_attempts, requeueCount: row.requeue_count, outOfOrder: later.rows.length > 0 },
    });
    return {
      ok: true,
      outboxId: row.id,
      requeueCount: row.requeue_count,
      previousAttemptCount: row.previous_attempts,
      outOfOrder: later.rows.length > 0,
    };
  });

  if (result.ok) wakeOutboxWorkers(); // fire-and-forget; no-op without a poller
  return result;
}
