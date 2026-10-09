import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { conversations, messages, outboxMessages } from "../db/schema";
import { enqueueOutboundMessage } from "../messaging/outbox";
import { requeueDeadLetter } from "../messaging/outbox-requeue";
import { wakeOutboxWorkers } from "../messaging/outbox-worker";
import { recordAudit } from "./audit";
import { evaluate } from "./permissions";
import type { TransitionActor } from "./ownership";

/**
 * STAFF REPLIES go through the SAME durable outbox as AI replies — there is
 * no second delivery mechanism and nothing here (or in the browser) ever
 * calls Meta. One transaction does, atomically:
 *
 *   lock the conversation row (tenant-scoped)
 *   -> verify the actor may reply (must own it, or be an admin)
 *   -> de-duplicate on the client's idempotency key
 *   -> insert the `messages` row (sender_type 'staff', author recorded)
 *   -> enqueue the outbox row (origin 'staff')
 *   -> clear the customer-waiting flag, bump activity, audit
 *
 * Because the row lock is the same one AI turns and ownership transitions
 * take, a reply can never interleave with a takeover/close. Staff replies
 * join the conversation's single delivery line, so they stay in order with
 * everything else queued for that conversation.
 */

export const MAX_REPLY_LENGTH = 4096; // WhatsApp text message limit
const CLIENT_ID_RE = /^[A-Za-z0-9._:-]{8,100}$/;

export type SendReplyResult =
  | { ok: true; messageId: string; outboxId: string; deduplicated: boolean }
  | {
      ok: false;
      reason: "not_found" | "forbidden" | "invalid_transition" | "invalid_body" | "invalid_client_id" | "idempotency_conflict";
      detail?: string;
    };

export async function sendStaffReply(
  db: Db,
  actor: TransitionActor,
  conversationId: string,
  input: { body: unknown; clientMessageId: unknown },
): Promise<SendReplyResult> {
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return { ok: false, reason: "invalid_body", detail: "a reply cannot be empty" };
  if (body.length > MAX_REPLY_LENGTH) return { ok: false, reason: "invalid_body", detail: `a reply cannot exceed ${MAX_REPLY_LENGTH} characters` };
  if (typeof input.clientMessageId !== "string" || !CLIENT_ID_RE.test(input.clientMessageId)) {
    return { ok: false, reason: "invalid_client_id", detail: "clientMessageId must be 8–100 characters of [A-Za-z0-9._:-]" };
  }
  const idempotencyKey = `staff:${conversationId}:${input.clientMessageId}`;

  const result = await db.transaction(async (tx): Promise<SendReplyResult> => {
    const locked = await tx.execute(sql`
      SELECT id, customer_id, status, assigned_staff_user_id FROM conversations
       WHERE id = ${conversationId}::uuid AND tenant_id = ${actor.tenantId}::uuid FOR NO KEY UPDATE`);
    const conv = locked.rows[0] as unknown as
      | { id: string; customer_id: string; status: "ai_active" | "human_pending" | "staff_owned" | "resolved"; assigned_staff_user_id: string | null }
      | undefined;
    if (!conv) return { ok: false, reason: "not_found" };

    const verdict = evaluate("reply", { status: conv.status, assignedStaffUserId: conv.assigned_staff_user_id }, actor);
    if (!verdict.ok) {
      await recordAudit(tx, {
        tenantId: actor.tenantId, actor: { type: "staff", id: actor.staffUserId }, event: "transition.rejected",
        conversationId, metadata: { attempted: "reply", reason: verdict.reason, status: conv.status },
      });
      return { ok: false, reason: verdict.reason, detail: verdict.detail };
    }

    // Repeated submission of the same logical reply (double click, network
    // retry): return the original, create nothing.
    const existing = await tx.query.outboxMessages.findFirst({
      where: and(eq(outboxMessages.tenantId, actor.tenantId), eq(outboxMessages.idempotencyKey, idempotencyKey)),
    });
    if (existing) {
      if (existing.payload.body !== body) {
        return { ok: false, reason: "idempotency_conflict", detail: "this clientMessageId was already used for a different message" };
      }
      return { ok: true, messageId: existing.messageId, outboxId: existing.id, deduplicated: true };
    }

    const [message] = await tx
      .insert(messages)
      .values({
        tenantId: actor.tenantId,
        conversationId,
        direction: "outbound",
        senderType: "staff",
        content: body,
        authorStaffUserId: actor.staffUserId,
      })
      .returning({ id: messages.id });
    const queued = await enqueueOutboundMessage(tx, {
      tenantId: actor.tenantId,
      conversationId,
      customerId: conv.customer_id,
      messageId: message.id,
      body,
      idempotencyKey,
      origin: "staff",
    });
    await tx
      .update(conversations)
      .set({ waitingSince: null, lastActivityAt: new Date(), updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, actor.tenantId)));
    await recordAudit(tx, {
      tenantId: actor.tenantId, actor: { type: "staff", id: actor.staffUserId }, event: "staff.reply_submitted",
      conversationId, metadata: { messageId: message.id, outboxId: queued.id, length: body.length },
    });
    return { ok: true, messageId: message.id, outboxId: queued.id, deduplicated: false };
  });

  if (result.ok && !result.deduplicated) wakeOutboxWorkers(); // fire-and-forget; no provider call here
  return result;
}

export type RetryResult =
  | { ok: true; outboxId: string; requeueCount: number }
  | { ok: false; reason: "not_found" | "forbidden" | "invalid_transition"; detail?: string };

/**
 * Recovery path for a staff message that dead-lettered: re-queue THAT SAME
 * logical message (see OUTBOX.md "Dead-letter requeue"). Allowed for the
 * conversation's owner or an admin, and only while it is still theirs to
 * reply on.
 */
export async function retryFailedStaffMessage(
  db: Db,
  actor: TransitionActor,
  conversationId: string,
  messageId: string,
): Promise<RetryResult> {
  const conv = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.tenantId, actor.tenantId)),
  });
  const msg = conv
    ? await db.query.messages.findFirst({
        where: and(eq(messages.id, messageId), eq(messages.conversationId, conversationId), eq(messages.tenantId, actor.tenantId)),
      })
    : undefined;
  if (!conv || !msg) return { ok: false, reason: "not_found" };
  if (msg.senderType !== "staff") return { ok: false, reason: "invalid_transition", detail: "only a staff message can be retried from the inbox" };

  const verdict = evaluate("reply", { status: conv.status, assignedStaffUserId: conv.assignedStaffUserId }, actor);
  if (!verdict.ok) return { ok: false, reason: verdict.reason, detail: verdict.detail };

  const r = await requeueDeadLetter(db, { tenantId: actor.tenantId, messageId, requestedBy: actor.staffUserId });
  if (!r.ok) {
    return r.reason === "not_found"
      ? { ok: false, reason: "not_found" }
      : { ok: false, reason: "invalid_transition", detail: `message is ${r.currentStatus}; only a failed (dead-lettered) message can be retried` };
  }
  await recordAudit(db, {
    tenantId: actor.tenantId, actor: { type: "staff", id: actor.staffUserId }, event: "staff.reply_retried",
    conversationId, metadata: { messageId, outboxId: r.outboxId, requeueCount: r.requeueCount },
  });
  return { ok: true, outboxId: r.outboxId, requeueCount: r.requeueCount };
}
