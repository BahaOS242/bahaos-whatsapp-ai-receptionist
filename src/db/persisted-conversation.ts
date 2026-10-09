import { resolveCustomer, resolveTenant } from "./domain-resolution";
import {
  findOrCreateActiveConversation,
  isHumanOwned,
  persistConversationTurn,
  resolveConversation,
  type ConversationStatus,
} from "./conversations";
import { eq, sql } from "drizzle-orm";
import { conversations } from "./schema";
import { loadConversationHistory, recordMessage } from "./messages";
import { createHandoff } from "./handoffs";
import type { HandoffContext } from "./schema";
import { createLeadRecord } from "./leads";
import { enqueueOutboundMessage } from "../messaging/outbox";
import type { AIProviderRequest, BusinessContext, ConversationTurn, CustomerContext } from "../ai/types";
import type { Db } from "./client";

/**
 * The DB-backed analog of ConversationManager (src/ai/conversation-manager.ts)
 * — Objective 1's actual load-bearing piece. ConversationManager itself
 * is deliberately untouched: it's still exactly right for every caller
 * that doesn't need persistence (scripts/dev-chat.ts, the eval
 * harnesses, most tests). This is a SEPARATE class, not a modification,
 * for the same reason ReceptionistTools has three separate
 * implementations rather than one with branches — different backing
 * store, same contract shape where it matters, chosen explicitly by
 * whoever constructs it.
 *
 * Owns: durable conversation identity (via customers/conversations),
 * BookingState persistence across restarts, the message log (with
 * built-in duplicate-delivery handling), and handoff/lead creation. Does
 * NOT own tenant/customer identity resolution logic itself — that's
 * domain-resolution.ts, reused here exactly as database-receptionist-tools.ts
 * reuses it, so a customer resolved through a booking and a customer
 * resolved through this manager are guaranteed to be the same row.
 */


export class PersistedConversationManager {
  private constructor(
    private readonly db: Db,
    private readonly business: BusinessContext,
    public readonly tenantId: string,
    public readonly customerId: string,
    public readonly conversationId: string,
    private bookingState: AIProviderRequest["bookingState"],
    private handoffActive: boolean,
    private status: ConversationStatus,
  ) {}

  /** Resolves (or creates) the tenant, customer, and this customer's
   * current open conversation, and hydrates BookingState/handoff status
   * from whatever was last persisted — the actual "survives a restart"
   * mechanism. `phone` must already be normalized (E.164-ish, see
   * src/ai/phone.ts) — this never guesses at an unnormalized one. */
  static async loadOrCreate(
    db: Db,
    business: BusinessContext,
    phone: string,
    name?: string,
  ): Promise<PersistedConversationManager> {
    const tenantId = await resolveTenant(db, business);
    const customerId = await resolveCustomer(db, tenantId, phone, name);
    const conversation = await findOrCreateActiveConversation(db, tenantId, customerId);
    return new PersistedConversationManager(
      db,
      business,
      tenantId,
      customerId,
      conversation.id,
      conversation.bookingState,
      isHumanOwned(conversation.status),
      conversation.status,
    );
  }

  getBookingState(): AIProviderRequest["bookingState"] {
    return { ...this.bookingState };
  }

  getHandoffActive(): boolean {
    return this.handoffActive;
  }

  /** Reloads this conversation's message history from the database, in
   * the shape AIProvider implementations expect — what makes
   * "conversation restoration" actually meaningful for a provider that
   * reads `history` (e.g. LLMProvider's system prompt), not just
   * BookingState. */
  async loadHistory(limit?: number): Promise<ConversationTurn[]> {
    return loadConversationHistory(this.db, this.conversationId, limit);
  }

  /** Records an inbound customer message. Returns `wasDuplicate: true`
   * when `whatsappMessageId` was already recorded — the caller must
   * treat that as a no-op and never process the same delivery twice
   * (Objective 1: "duplicate incoming message/event handling").
   * `existingConversationId` (only set alongside `wasDuplicate: true`) is
   * the conversation the ORIGINAL message with this id actually belongs
   * to — see recordMessage's own docstring for why comparing this
   * against `this.conversationId` is how a caller detects the narrow,
   * only-possible-via-a-forged-payload "same id, different customer"
   * anomaly, rather than that case being silently invisible. */
  async recordInboundMessage(
    content: string,
    whatsappMessageId?: string,
  ): Promise<{ id: string; wasDuplicate: boolean; existingConversationId?: string }> {
    const result = await recordMessage(this.db, {
      tenantId: this.tenantId,
      conversationId: this.conversationId,
      direction: "inbound",
      senderType: "customer",
      content,
      whatsappMessageId,
    });
    return { id: result.id, wasDuplicate: result.wasDuplicate, existingConversationId: result.existingConversationId };
  }

  /** Returns the recorded message's own id — the webhook route uses it
   * to mark delivery status (sent/failed) once the actual send attempt
   * (which happens AFTER this, outside any transaction — see
   * webhook-processing.ts) resolves. */
  async recordOutboundMessage(content: string): Promise<{ id: string }> {
    const result = await recordMessage(this.db, {
      tenantId: this.tenantId,
      conversationId: this.conversationId,
      direction: "outbound",
      senderType: "ai",
      content,
    });
    return { id: result.id };
  }

  /** Queues the reply durably for delivery. Call INSIDE the same
   * transaction that commits this turn's business state, so "the decision
   * was made" and "the message is queued" are one atomic fact. The
   * idempotency key is derived from the inbound message row, so the same
   * logical reply can never be queued twice. */
  async enqueueReply(outboundMessageId: string, body: string, inboundMessageId: string): Promise<{ id: string; deduplicated: boolean }> {
    return enqueueOutboundMessage(this.db, {
      tenantId: this.tenantId,
      conversationId: this.conversationId,
      customerId: this.customerId,
      messageId: outboundMessageId,
      body,
      idempotencyKey: `reply:${inboundMessageId}`,
    });
  }

  /** Persists BookingState + handoff status for this turn — call once
   * per processed message, after acting on the provider's result. */
  async commitTurn(
    bookingState: AIProviderRequest["bookingState"],
    handoffActive: boolean,
    handoffReason?: string,
  ): Promise<void> {
    this.bookingState = { ...bookingState };
    this.handoffActive = handoffActive;
    await persistConversationTurn(this.db, this.conversationId, this.bookingState, this.handoffActive, handoffReason);
  }

  /** Ownership as loaded at the start of this turn (may be stale — use
   * lockOwnership for any decision that must be race-free). */
  getStatus(): ConversationStatus {
    return this.status;
  }

  /**
   * Re-reads the CURRENT ownership under a row lock (`FOR NO KEY UPDATE`) and
   * holds it until this transaction ends. Call immediately before
   * enqueueing an AI reply: any staff transition (which also takes this
   * row lock) then either committed before this read — in which case we see
   * it and suppress — or waits until this transaction commits.
   */
  async lockOwnership(): Promise<ConversationStatus> {
    const result = await this.db.execute(sql`select status, ownership_version from conversations where id = ${this.conversationId}::uuid for no key update`);
    const row = result.rows[0] as { status: ConversationStatus; ownership_version: number } | undefined;
    if (!row) throw new Error("lockOwnership: conversation not found");
    this.status = row.status;
    this.lockedVersion = row.ownership_version;
    return row.status;
  }

  private turnStartVersion: number | null = null;
  private lockedVersion: number | null = null;

  /**
   * Records the ownership version this AI turn is based on, WITHOUT locking
   * (a lock here would be held through the whole LLM call and make staff
   * wait). Paired with `ownershipChangedDuringTurn()` after `lockOwnership()`.
   */
  async markTurnStart(): Promise<void> {
    const result = await this.db.execute(sql`select ownership_version from conversations where id = ${this.conversationId}::uuid`);
    this.turnStartVersion = (result.rows[0] as { ownership_version: number } | undefined)?.ownership_version ?? null;
  }

  /**
   * True if ANY staff transition committed since `markTurnStart()` — even one
   * that ended back in `ai_active` (takeover then release while the model was
   * thinking). A status check alone cannot see that A→B→A round trip; the
   * version can, and the reply it produced answers a world a human has since
   * touched.
   */
  ownershipChangedDuringTurn(): boolean {
    return this.turnStartVersion !== null && this.lockedVersion !== null && this.lockedVersion !== this.turnStartVersion;
  }

  /** A customer message arrived while a human owns the conversation: keep
   * it, mark the customer as waiting, bump activity. Never replies. */
  async markCustomerWaiting(): Promise<void> {
    await this.db
      .update(conversations)
      .set({
        waitingSince: sql`coalesce(${conversations.waitingSince}, now())`,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, this.conversationId));
  }

  /** Keeps the AI reply that a takeover superseded, for history, flagged
   * `suppressed` — never queued, never sent, never shown to the AI. */
  async recordSuppressedReply(body: string): Promise<{ id: string }> {
    const result = await recordMessage(this.db, {
      tenantId: this.tenantId,
      conversationId: this.conversationId,
      direction: "outbound",
      senderType: "ai",
      content: body,
      status: "suppressed",
    });
    return { id: result.id };
  }

  async resolve(): Promise<void> {
    await resolveConversation(this.db, this.conversationId);
  }

  /** Creates a durable handoff record referencing this exact
   * conversation/customer, with a structured context snapshot — see
   * HandoffContext. */
  async createHandoff(reason: string, context?: HandoffContext): Promise<{ id: string }> {
    return createHandoff(this.db, {
      tenantId: this.tenantId,
      conversationId: this.conversationId,
      reason,
      context,
    });
  }

  async createLead(serviceInterest?: string): Promise<{ id: string }> {
    return createLeadRecord(this.db, {
      tenantId: this.tenantId,
      customerId: this.customerId,
      sourceConversationId: this.conversationId,
      serviceInterest,
    });
  }

  buildRequest(params: { customer: CustomerContext; history: ConversationTurn[]; message: string }): AIProviderRequest {
    return {
      business: this.business,
      customer: params.customer,
      history: params.history,
      message: params.message,
      bookingState: this.getBookingState(),
      handoffActive: this.handoffActive,
      tenantId: this.tenantId,
    };
  }
}
