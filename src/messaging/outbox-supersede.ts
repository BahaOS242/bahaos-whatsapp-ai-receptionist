import { sql } from "drizzle-orm";
import type { Db } from "../db/client";

/**
 * Cancels AI-authored outbox rows that must no longer be delivered because a
 * human owns the conversation, and mirrors that to the message log as
 * `suppressed`.
 *
 * Covers rows that have NOT reached the provider: `pending`, `retry_wait`,
 * and `processing` rows whose lease has EXPIRED (a worker that died; nobody
 * is mid-send). A `processing` row with a live lease is left to its worker's
 * pre-send recheck.
 *
 * Truthfulness: a row with earlier attempts (a timeout, a 5xx, a crashed
 * worker) may in fact have been accepted by WhatsApp. Those rows are still
 * cancelled — nothing further will be sent — but the number of earlier
 * attempts is recorded in `error_metadata.withdrawn.priorAttempts` so the
 * inbox can say "may have been delivered" instead of "not sent".
 *
 * Scope: one conversation (the caller — a staff transition — has already
 * decided it must stop) or, with no conversation, every staff-owned conversation (worker sweep, so a stranded row can never block
 * the staff replies queued behind it).
 */
export async function cancelSupersededAiRows(
  db: Db,
  scope: { conversationId?: string; tenantId?: string; now?: Date } = {},
): Promise<number> {
  const now = (scope.now ?? new Date()).toISOString();
  const cancelled = await db.execute(sql`
    UPDATE outbox_messages o
       SET status = 'cancelled', failed_at = ${now}::timestamptz, lease_expires_at = NULL, claim_token = NULL,
           last_error = 'superseded: a staff member took over the conversation before delivery',
           error_code = 'superseded_by_human',
           error_metadata = COALESCE(o.error_metadata, '{}'::jsonb)
                            || jsonb_build_object('withdrawn', jsonb_build_object('priorAttempts', o.attempt_count)),
           updated_at = ${now}::timestamptz
      FROM conversations cv
     WHERE cv.id = o.conversation_id
       ${scope.conversationId ? sql`` : sql`AND cv.status = 'staff_owned'`}
       AND o.origin = 'ai'
       AND (o.status IN ('pending', 'retry_wait') OR (o.status = 'processing' AND o.lease_expires_at <= ${now}::timestamptz))
       ${scope.conversationId ? sql`AND o.conversation_id = ${scope.conversationId}::uuid` : sql``}
       ${scope.tenantId ? sql`AND o.tenant_id = ${scope.tenantId}::uuid` : sql``}
 RETURNING o.message_id`);
  const ids = (cancelled.rows as Array<{ message_id: string }>).map((r) => r.message_id);
  if (ids.length > 0) {
    await db.execute(sql`UPDATE messages SET status = 'suppressed', next_retry_at = NULL
                          WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
  }
  return ids.length;
}
