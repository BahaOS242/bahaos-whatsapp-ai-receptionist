import { resolveCustomer, resolveTenant } from "./domain-resolution";
import {
  findOrCreateActiveConversation,
  persistConversationTurn,
  resolveConversation,
} from "./conversations";
import { loadConversationHistory, recordMessage } from "./messages";
import { createHandoff } from "./handoffs";
import type { HandoffContext } from "./schema";
import { createLeadRecord } from "./leads";
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
      conversation.status === "staff_owned",
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
  ): Promise<{ wasDuplicate: boolean; existingConversationId?: string }> {
    const result = await recordMessage(this.db, {
      tenantId: this.tenantId,
      conversationId: this.conversationId,
      direction: "inbound",
      senderType: "customer",
      content,
      whatsappMessageId,
    });
    return { wasDuplicate: result.wasDuplicate, existingConversationId: result.existingConversationId };
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

  /** Persists BookingState + handoff status for this turn — call once
   * per processed message, after acting on the provider's result. */
  async commitTurn(bookingState: AIProviderRequest["bookingState"], handoffActive: boolean): Promise<void> {
    this.bookingState = { ...bookingState };
    this.handoffActive = handoffActive;
    await persistConversationTurn(this.db, this.conversationId, this.bookingState, this.handoffActive);
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
