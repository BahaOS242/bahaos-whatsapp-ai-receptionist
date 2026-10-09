import { and, asc, eq, isNull, or, ne } from "drizzle-orm";
import { messages } from "./schema";
import type { ConversationTurn } from "../ai/types";
import type { Db } from "./client";

/**
 * Durable message/event log — Objective 1's audit trail and the source
 * a conversation's history is reloaded from after a restart. Idempotent
 * by construction for anything carrying a real WhatsApp message ID: the
 * schema's `messages_whatsapp_message_id_key` unique index (a plain
 * index — Postgres never treats two NULLs as duplicates of each other,
 * so outbound/AI-generated messages, which have no WhatsApp ID, are
 * completely unaffected) is the actual backstop; `recordMessage` below
 * just makes hitting it a normal, handled outcome instead of a thrown
 * error.
 */


export interface RecordMessageInput {
  tenantId: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  senderType: "customer" | "ai" | "staff" | "system";
  content: string;
  /** The webhook delivery's own message ID, when there is one — only
   * ever set for real inbound WhatsApp messages once that layer exists.
   * Its presence is what makes a redelivered webhook event idempotent:
   * a second call with the SAME id returns the original row instead of
   * creating a duplicate. */
  whatsappMessageId?: string;
  /** Staff author, for sender_type "staff" messages. */
  authorStaffUserId?: string;
  /** Initial delivery status (e.g. "suppressed" for an AI reply that was
   * withdrawn because a human took over first). */
  status?: "queued" | "suppressed";
}

export interface RecordMessageResult {
  id: string;
  /** True when this exact whatsappMessageId was already recorded —
   * the caller should treat this turn as a no-op replay, never process
   * it again (see Objective 1's "duplicate incoming message/event
   * handling" requirement). Always false when whatsappMessageId wasn't
   * given, since there's nothing to deduplicate against. */
  wasDuplicate: boolean;
  /** Only set when `wasDuplicate` is true — the EXISTING row's own
   * conversationId, so the caller can detect the one genuinely anomalous
   * case this global-uniqueness design accepts as a tradeoff: the same
   * whatsappMessageId claimed by what is, per THIS call's `input`, a
   * DIFFERENT conversation. See recordMessage's own docstring for why
   * the constraint stays global rather than being narrowed to fix this,
   * and webhook-processing.ts for what the caller does with it. */
  existingConversationId?: string;
}

/** Records one message, deduplicating on whatsappMessageId when given.
 * Race-safe: two concurrent deliveries of the same WhatsApp message ID
 * both call this, at most one insert wins, the loser re-reads and
 * returns the winner's row — never two rows for the same real message.
 *
 * Deliberately GLOBAL uniqueness (not scoped to conversation/customer),
 * even though this means a message id claimed by two DIFFERENT
 * customers collides and the second is (correctly, per this design)
 * treated as a duplicate and never processed: real WhatsApp message ids
 * are unique across Meta's ENTIRE platform, not just within one
 * conversation, and that is exactly the property genuine idempotency
 * needs — a redelivery of the same message must dedupe even if, between
 * the original delivery and the retry, this customer's conversation was
 * resolved and a NEW one started (a per-conversation-scoped constraint
 * would fail to catch that real case, which is a worse bug than the one
 * it would "fix"). A same-id collision across two DIFFERENT customers
 * can only happen via a payload that violates Meta's own id-uniqueness
 * guarantee — i.e. a forged/malformed request, which signature
 * verification (see webhook-signature.ts) already gates when configured
 * — so this is accepted as a narrow, defense-in-depth edge case rather
 * than "fixed" by weakening the real guarantee; see
 * `existingConversationId` above for how the caller at least detects and
 * loudly logs it instead of it being silently invisible. */
export async function recordMessage(db: Db, input: RecordMessageInput): Promise<RecordMessageResult> {
  const [inserted] = await db
    .insert(messages)
    .values({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: input.direction,
      senderType: input.senderType,
      content: input.content,
      whatsappMessageId: input.whatsappMessageId,
      authorStaffUserId: input.authorStaffUserId,
      status: input.status,
    })
    .onConflictDoNothing({ target: messages.whatsappMessageId })
    .returning();

  if (inserted) return { id: inserted.id, wasDuplicate: false };

  // Only reachable when whatsappMessageId was given and already existed
  // — onConflictDoNothing on a column with no rows sharing that value
  // (including the common case of no whatsappMessageId at all, which
  // Postgres never conflicts on) always returns the inserted row above.
  const existing = await db.query.messages.findFirst({
    where: eq(messages.whatsappMessageId, input.whatsappMessageId!),
  });
  if (!existing) {
    throw new Error(
      `recordMessage: insert reported a conflict for whatsappMessageId "${input.whatsappMessageId}" but no existing row was found — this should be unreachable.`,
    );
  }
  return { id: existing.id, wasDuplicate: true, existingConversationId: existing.conversationId };
}

/** Reloads a conversation's history in the exact shape
 * ConversationManager.buildRequest expects, oldest first — what makes
 * "conversation restoration" after a process restart actually possible:
 * the persisted BookingState alone isn't enough for a provider that also
 * reads `history` (e.g. LLMProvider's system prompt). Staff/system
 * messages are included as "assistant" role, matching how the rest of
 * this codebase already treats anything that isn't the customer's own
 * words. */
export async function loadConversationHistory(
  db: Db,
  conversationId: string,
  limit = 50,
): Promise<ConversationTurn[]> {
  const rows = await db.query.messages.findMany({
    // A suppressed reply was never delivered, so the AI must not believe
    // it said it.
    where: and(eq(messages.conversationId, conversationId), or(isNull(messages.status), ne(messages.status, "suppressed"))),
    orderBy: asc(messages.createdAt),
    limit,
  });
  return rows.map((row) => ({
    role: row.senderType === "customer" ? "customer" : "assistant",
    content: row.content,
  }));
}
