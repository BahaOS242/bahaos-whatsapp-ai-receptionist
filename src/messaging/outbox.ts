import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { customers, messages, outboxMessages } from "../db/schema";
import type { OutboundMessageResult } from "./messaging-provider";

/**
 * DURABLE OUTBOUND OUTBOX — the policy and the write side.
 *
 *   BahaOS owns the business decision (what to say).
 *   Postgres owns the durable outbound state (this table).
 *   The worker (outbox-worker.ts) owns delivery.
 *   Meta owns transport, nothing more.
 *
 * LIFECYCLE (every transition is deterministic and covered by tests):
 *
 *   pending ──claim──► processing ──provider accepted──► sent
 *      ▲                  │
 *      │                  ├─ transient failure, attempts left ──► retry_wait ──claim──► processing
 *      │                  ├─ permanent failure ─────────────────► dead_letter
 *      │                  ├─ transient failure, attempts spent ─► dead_letter
 *      │                  └─ worker died (lease expired) ───────► (re-claimed; or dead_letter if no attempts left)
 *
 * WRITE SIDE: enqueueOutboundMessage runs INSIDE the same transaction that
 * commits the business state (booking/handoff/conversation state), so
 * "the decision was made" and "the message is queued" are one atomic fact.
 * A crash after COMMIT loses nothing: the row is durable and the worker
 * will find it. Delivery never happens inside that transaction.
 */

/** Total delivery attempts before a retryable failure is dead-lettered.
 * Unchanged from the previous retry mechanism (1 initial + 4 retries). */
export const OUTBOX_MAX_ATTEMPTS = 5;

/** Base backoff in seconds, indexed by (attemptNumber - 1), capped at the
 * last entry. Unchanged from the previous mechanism: 30s / 1m / 2m / 4m.
 * A ±20% jitter is applied so retries from many conversations that failed
 * together (a Meta outage) do not all land on the same instant. */
export const OUTBOX_BACKOFF_SECONDS = [30, 60, 120, 240];

/** How long a claim is valid. Must comfortably exceed the provider timeout
 * (15 s) plus the worker's own send ceiling; recovery of a dead worker's
 * claim waits at least this long. */
export const OUTBOX_LEASE_SECONDS = 120;

/** A worker refuses to START a send unless at least this much of its
 * lease remains — so a stalled worker cannot begin a send that would
 * outlive its own claim and race the recovery worker. (Provider timeout
 * 15 s + slack.) */
export const OUTBOX_SEND_MARGIN_MS = 25_000;

/** Hard ceiling on one provider call, independent of the provider's own
 * timeout — a misbehaving provider implementation can never pin a claim. */
export const OUTBOX_SEND_CEILING_MS = 20_000;

export function backoffSeconds(attemptNumber: number, rng: () => number = Math.random): number {
  const base = OUTBOX_BACKOFF_SECONDS[Math.min(attemptNumber - 1, OUTBOX_BACKOFF_SECONDS.length - 1)];
  return Math.round(base * (0.8 + 0.4 * rng()));
}

export type FailureDecision =
  | { kind: "retry"; availableAt: Date; delaySeconds: number }
  | { kind: "dead_letter"; reason: "permanent" | "exhausted" };

/**
 * THE single retry decision. Preserves the existing classification
 * contract exactly: only `result.retryable === true` is retried; an
 * unclassified failure is treated as permanent (the documented safe
 * default). No second error taxonomy exists — the provider's
 * `retryable` flag remains the sole input.
 */
export function decideAfterFailure(params: {
  attemptNumber: number;
  maxAttempts: number;
  result: OutboundMessageResult;
  now: Date;
  rng?: () => number;
}): FailureDecision {
  if (params.result.retryable !== true) return { kind: "dead_letter", reason: "permanent" };
  if (params.attemptNumber >= params.maxAttempts) return { kind: "dead_letter", reason: "exhausted" };
  const delaySeconds = backoffSeconds(params.attemptNumber, params.rng);
  return { kind: "retry", delaySeconds, availableAt: new Date(params.now.getTime() + delaySeconds * 1000) };
}

export interface EnqueueOutboundInput {
  tenantId: string;
  conversationId: string;
  customerId: string;
  /** The conversation-log row (`messages`) this delivery is for. */
  messageId: string;
  body: string;
  /** One logical outbound message = one key. Re-enqueueing the same key
   * is a no-op that returns the original row. */
  idempotencyKey: string;
  /** "ai" (default) or "staff". Only "ai" messages are withdrawn when a
   * human takes the conversation over. */
  origin?: "ai" | "staff";
  now?: Date;
}

export interface EnqueueOutboundResult {
  id: string;
  /** True when this idempotency key (or message) was already queued. */
  deduplicated: boolean;
}

/**
 * Persists one logical outbound message. Pass the transaction handle
 * (`tx`) of the business transaction so the decision and the queued
 * message commit together. Idempotent on (tenant, idempotencyKey).
 */
export async function enqueueOutboundMessage(db: Db, input: EnqueueOutboundInput): Promise<EnqueueOutboundResult> {
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, input.customerId), eq(customers.tenantId, input.tenantId)),
  });
  if (!customer) throw new Error("enqueueOutboundMessage: customer not found for this tenant");

  const now = input.now ?? new Date();
  const [inserted] = await db
    .insert(outboxMessages)
    .values({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      messageId: input.messageId,
      recipient: customer.whatsappId,
      payload: { body: input.body },
      idempotencyKey: input.idempotencyKey,
      origin: input.origin ?? "ai",
      maxAttempts: OUTBOX_MAX_ATTEMPTS,
      availableAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: outboxMessages.id });

  if (inserted) {
    await db.update(messages).set({ status: "queued" }).where(eq(messages.id, input.messageId));
    return { id: inserted.id, deduplicated: false };
  }

  // Conflict on (tenant, idempotency key) OR on message_id: either way
  // this logical message is already queued — return the original.
  const existing =
    (await db.query.outboxMessages.findFirst({
      where: and(eq(outboxMessages.tenantId, input.tenantId), eq(outboxMessages.idempotencyKey, input.idempotencyKey)),
    })) ?? (await db.query.outboxMessages.findFirst({ where: eq(outboxMessages.messageId, input.messageId) }));
  if (!existing) throw new Error("enqueueOutboundMessage: conflict reported but no existing outbox row was found");
  return { id: existing.id, deduplicated: true };
}
