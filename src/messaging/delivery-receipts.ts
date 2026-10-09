import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { NormalizedDeliveryReceipt } from "../whatsapp/webhook-payload";

/**
 * Provider delivery receipts (Meta `statuses`), kept SEPARATE from API acceptance:
 *   outbox_messages.status = 'sent'   -> the provider's API accepted the message (set by the outbox worker);
 *   outbox_messages.delivery_status   -> what the provider later reported (provider_sent | delivered | read | failed),
 *                                        NULL until a receipt is seen.
 *
 * Receipts can arrive before the worker has saved provider_message_id, twice, or out of order. So every receipt is first
 * appended to outbox_delivery_receipts (idempotent on tenant+id+status+event time) and the outbox row's delivery_* columns
 * are DERIVED from that ledger, so the result does not depend on arrival order:
 *   read > delivered > failed > sent        (delivered/read are the stronger evidence and beat a contradicting failure).
 * A per-(tenant, provider id) advisory lock serialises "receipt recorded" against "worker saved the id", so neither can
 * miss the other. Everything is tenant-scoped; a receipt can never touch another tenant's row.
 */
export interface ReceiptApplyResult {
  received: number;
  recorded: number;
  duplicates: number;
  /** Distinct provider ids whose outbox row exists (derived columns refreshed). */
  matched: number;
  /** Distinct provider ids with no outbox row (yet): kept in the ledger, applied when the worker saves the id. */
  awaitingProviderId: number;
  failedReceipts: number;
}

/** Serialises receipt recording and the worker's id save for ONE provider message. Call inside a transaction. */
export async function lockProviderMessage(tx: Db, tenantId: string, providerMessageId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`dr:${tenantId}`}), hashtext(${providerMessageId}))`);
}

/** Recomputes delivery_* on the outbox row(s) for this provider id from the ledger. Returns whether a row exists. */
export async function reconcileDeliveryForProviderMessage(tx: Db, tenantId: string, providerMessageId: string): Promise<boolean> {
  const exists = await tx.execute(
    sql`SELECT 1 FROM outbox_messages WHERE tenant_id = ${tenantId}::uuid AND provider_message_id = ${providerMessageId} LIMIT 1`,
  );
  if (exists.rows.length === 0) return false;
  await tx.execute(sql`
    WITH agg AS (
      SELECT
        bool_or(status = 'read')      AS has_read,
        bool_or(status = 'delivered') AS has_delivered,
        bool_or(status = 'failed')    AS has_failed,
        bool_or(status = 'sent')      AS has_sent,
        min(event_at) FILTER (WHERE status IN ('delivered', 'read')) AS first_delivered_at,
        (array_agg(error_code  ORDER BY event_at DESC, id) FILTER (WHERE status = 'failed'))[1] AS err_code,
        (array_agg(error_title ORDER BY event_at DESC, id) FILTER (WHERE status = 'failed'))[1] AS err_title
      FROM outbox_delivery_receipts
      WHERE tenant_id = ${tenantId}::uuid AND provider_message_id = ${providerMessageId}
    ), derived AS (
      SELECT
        CASE WHEN has_read THEN 'read' WHEN has_delivered THEN 'delivered' WHEN has_failed THEN 'failed' WHEN has_sent THEN 'provider_sent' END AS status,
        first_delivered_at,
        CASE WHEN NOT has_read AND NOT has_delivered AND has_failed THEN err_code END  AS err_code,
        CASE WHEN NOT has_read AND NOT has_delivered AND has_failed THEN err_title END AS err_title
      FROM agg
    )
    UPDATE outbox_messages o
       SET delivery_status = d.status, delivered_at = d.first_delivered_at,
           delivery_error_code = d.err_code, delivery_error_title = d.err_title, delivery_updated_at = now()
      FROM derived d
     WHERE o.tenant_id = ${tenantId}::uuid AND o.provider_message_id = ${providerMessageId} AND d.status IS NOT NULL
       AND (o.delivery_status, o.delivered_at, o.delivery_error_code, o.delivery_error_title)
           IS DISTINCT FROM (d.status, d.first_delivered_at, d.err_code, d.err_title)`);
  return true;
}

export async function recordDeliveryReceipts(db: Db, tenantId: string, receipts: NormalizedDeliveryReceipt[]): Promise<ReceiptApplyResult> {
  const result: ReceiptApplyResult = { received: receipts.length, recorded: 0, duplicates: 0, matched: 0, awaitingProviderId: 0, failedReceipts: 0 };
  // Deterministic lock order across concurrent callers (no deadlocks): process distinct ids sorted.
  const byId = new Map<string, NormalizedDeliveryReceipt[]>();
  for (const r of receipts) byId.set(r.providerMessageId, [...(byId.get(r.providerMessageId) ?? []), r]);
  for (const providerMessageId of [...byId.keys()].sort()) {
    await db.transaction(async (tx) => {
      await lockProviderMessage(tx, tenantId, providerMessageId);
      for (const r of byId.get(providerMessageId)!) {
        const inserted = await tx.execute(sql`
          INSERT INTO outbox_delivery_receipts (id, tenant_id, provider_message_id, status, event_at, recipient, error_code, error_title)
          VALUES (gen_random_uuid(), ${tenantId}::uuid, ${r.providerMessageId}, ${r.status}, ${r.eventAt.toISOString()}::timestamptz,
                  ${r.recipient ?? null}, ${r.errorCode ?? null}, ${r.errorTitle ?? null})
          ON CONFLICT (tenant_id, provider_message_id, status, event_at) DO NOTHING
          RETURNING id`);
        if (inserted.rows.length > 0) result.recorded++;
        else result.duplicates++;
        if (r.status === "failed") result.failedReceipts++;
      }
      if (await reconcileDeliveryForProviderMessage(tx, tenantId, providerMessageId)) result.matched++;
      else result.awaitingProviderId++;
    });
  }
  return result;
}
