import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { outboxMessages } from "../db/schema";

/**
 * "Why didn't this customer receive this message?" — a read-only service
 * over the outbox (no dashboard; this is what one would build on). Every
 * lookup can be scoped to a tenant so one business can never inspect
 * another's deliveries.
 */

export interface OutboundDiagnostics {
  outboxId: string;
  messageId: string;
  tenantId: string;
  conversationId: string;
  customerId: string;
  recipient: string;
  channel: string;
  status: "pending" | "processing" | "retry_wait" | "sent" | "dead_letter" | "cancelled";
  idempotencyKey: string;
  createdAt: Date;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  /** When the next attempt may start (pending / retry_wait only). */
  nextAttemptAt: Date | null;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  providerMessageId: string | null;
  lastError: string | null;
  errorCode: string | null;
  errorMetadata: Record<string, unknown> | null;
  /** How many times an operator re-queued this message from dead_letter. */
  requeueCount: number;
  /** One plain-English sentence answering "what happened to this message?" */
  explanation: string;
}

function explain(r: typeof outboxMessages.$inferSelect, now: Date): string {
  switch (r.status) {
    case "sent":
      return r.providerMessageId
        ? `Delivered to the provider at ${r.sentAt?.toISOString()} (provider message id ${r.providerMessageId}) after ${r.attemptCount} attempt(s).`
        : `Accepted by the provider at ${r.sentAt?.toISOString()} but the response carried no message id, after ${r.attemptCount} attempt(s).`;
    case "pending":
      return r.requeueCount > 0
        ? `Re-queued by an operator (requeue #${r.requeueCount}) and waiting for a worker; eligible since ${r.availableAt.toISOString()}. Earlier failure: ${r.errorCode ?? "unclassified"}.`
        : `Queued and waiting for a worker; eligible since ${r.availableAt.toISOString()}.`;
    case "processing":
      return r.leaseExpiresAt && r.leaseExpiresAt <= now
        ? `A worker claimed it (attempt ${r.attemptCount}) but never reported back and its lease expired at ${r.leaseExpiresAt.toISOString()}; it will be recovered on the next worker pass.`
        : `A worker is delivering it right now (attempt ${r.attemptCount}); lease valid until ${r.leaseExpiresAt?.toISOString()}.`;
    case "retry_wait":
      return `Attempt ${r.attemptCount} of ${r.maxAttempts} failed (${r.errorCode ?? "unclassified"}: ${r.lastError ?? "no detail"}); the next attempt is scheduled for ${r.availableAt.toISOString()}.`;
    case "cancelled":
      return `Withdrawn before any delivery attempt reached the provider (${r.lastError ?? "superseded"}). It was never sent.`;
    case "dead_letter": {
      const why = (r.errorMetadata as { deadLetterReason?: string } | null)?.deadLetterReason;
      const reason =
        why === "exhausted"
          ? `all ${r.maxAttempts} attempts failed`
          : why === "permanent"
            ? "the provider reported a failure retrying cannot fix"
            : "its worker repeatedly died on the final attempt";
      return `Not delivered: ${reason} (${r.errorCode ?? "unclassified"}: ${r.lastError ?? "no detail"}). It will not be retried automatically and needs inspection.`;
    }
  }
}

function toDiagnostics(r: typeof outboxMessages.$inferSelect, now: Date): OutboundDiagnostics {
  return {
    outboxId: r.id,
    messageId: r.messageId,
    tenantId: r.tenantId,
    conversationId: r.conversationId,
    customerId: r.customerId,
    recipient: r.recipient,
    channel: r.channel,
    status: r.status,
    idempotencyKey: r.idempotencyKey,
    createdAt: r.createdAt,
    attemptCount: r.attemptCount,
    maxAttempts: r.maxAttempts,
    lastAttemptAt: r.lastAttemptAt,
    nextAttemptAt: r.status === "pending" || r.status === "retry_wait" ? r.availableAt : null,
    claimedAt: r.claimedAt,
    leaseExpiresAt: r.leaseExpiresAt,
    sentAt: r.sentAt,
    failedAt: r.failedAt,
    providerMessageId: r.providerMessageId,
    lastError: r.lastError,
    errorCode: r.errorCode,
    errorMetadata: r.errorMetadata,
    requeueCount: r.requeueCount,
    explanation: explain(r, now),
  };
}

export type OutboundLookup = { outboxId: string } | { messageId: string } | { idempotencyKey: string; tenantId: string };

/** Inspects one outbound message by outbox id, by the conversation-log
 * message id, or by (tenant, idempotency key). `scopeTenantId` hides any
 * row belonging to another tenant. */
export async function inspectOutbound(
  db: Db,
  lookup: OutboundLookup,
  options: { scopeTenantId?: string; now?: Date } = {},
): Promise<OutboundDiagnostics | null> {
  const where =
    "outboxId" in lookup
      ? eq(outboxMessages.id, lookup.outboxId)
      : "messageId" in lookup
        ? eq(outboxMessages.messageId, lookup.messageId)
        : and(eq(outboxMessages.tenantId, lookup.tenantId), eq(outboxMessages.idempotencyKey, lookup.idempotencyKey));
  const row = await db.query.outboxMessages.findFirst({ where });
  if (!row) return null;
  if (options.scopeTenantId && row.tenantId !== options.scopeTenantId) return null;
  return toDiagnostics(row, options.now ?? new Date());
}

/** Lists a tenant's outbound messages, newest first — e.g. all dead
 * letters, or everything in one conversation. */
export async function listOutbound(
  db: Db,
  params: { tenantId: string; status?: OutboundDiagnostics["status"]; conversationId?: string; limit?: number; now?: Date },
): Promise<OutboundDiagnostics[]> {
  const rows = await db.query.outboxMessages.findMany({
    where: and(
      eq(outboxMessages.tenantId, params.tenantId),
      params.status ? eq(outboxMessages.status, params.status) : undefined,
      params.conversationId ? eq(outboxMessages.conversationId, params.conversationId) : undefined,
    ),
    orderBy: [desc(outboxMessages.seq)],
    limit: params.limit ?? 50,
  });
  const now = params.now ?? new Date();
  return rows.map((r) => toDiagnostics(r, now));
}
