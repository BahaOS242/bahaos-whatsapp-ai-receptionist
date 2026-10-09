import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { ConversationStatus } from "../db/conversations";
import { conversations, handoffs, staffUsers } from "../db/schema";
import { cancelSupersededAiRows } from "../messaging/outbox-supersede";
import { recordAudit, type InboxAuditEvent } from "./audit";
import { evaluate, type ActorRef, type InboxAction } from "./permissions";

/**
 * CONVERSATION OWNERSHIP — the state machine behind the human inbox.
 *
 *            ┌──────── accept / takeover / assign ───────┐
 *            ▼                                           │
 *   ai_active ──(AI handoff)──► human_pending ───────────┤
 *      ▲  │                           │                  │
 *      │  └────── takeover ───────────┼──────────► staff_owned (HUMAN_ACTIVE)
 *      │                              │                  │
 *      └──────────── release ◄────────┴──────────────────┘
 *   (any non-closed state) ──close──► resolved ──reopen──► staff_owned
 *
 * Every transition:
 *   1. runs in ONE transaction that first takes the conversation's ROW LOCK
 *      (`FOR NO KEY UPDATE`) — the very lock an in-flight AI turn must take to
 *      revalidate ownership before it queues a reply — so a takeover and an
 *      AI reply are strictly serialized, never interleaved;
 *   2. is scoped to the actor's tenant (the tenant comes from the verified
 *      session, never from the request); another tenant's conversation is
 *      indistinguishable from a nonexistent one;
 *   3. is validated by permissions.ts (the single source of truth);
 *   4. optionally rejects a STALE request (`expectedVersion` — the
 *      conversation changed since the caller loaded it);
 *   5. writes an append-only audit record — also for refusals.
 */

export interface TransitionActor extends ActorRef {
  tenantId: string;
}

export interface TransitionOptions {
  /** Reject unless the conversation is still at this ownership_version. */
  expectedVersion?: number;
}

export interface ConversationSnapshot {
  id: string;
  status: ConversationStatus;
  assignedStaffUserId: string | null;
  ownershipVersion: number;
  handoffReason: string | null;
  waitingSince: Date | null;
}

export type TransitionResult =
  | { ok: true; conversation: ConversationSnapshot; withdrawnAiReplies: number }
  | {
      ok: false;
      reason: "not_found" | "invalid_transition" | "forbidden" | "stale" | "invalid_assignee" | "customer_has_active_conversation";
      detail?: string;
      currentStatus?: ConversationStatus;
    };

interface Locked {
  id: string;
  tenant_id: string;
  customer_id: string;
  status: ConversationStatus;
  assigned_staff_user_id: string | null;
  ownership_version: number;
  handoff_reason: string | null;
  waiting_since: Date | null;
}

async function lockConversation(tx: Db, tenantId: string, conversationId: string): Promise<Locked | undefined> {
  const r = await tx.execute(sql`
    SELECT id, tenant_id, customer_id, status, assigned_staff_user_id, ownership_version, handoff_reason, waiting_since
      FROM conversations WHERE id = ${conversationId}::uuid AND tenant_id = ${tenantId}::uuid FOR NO KEY UPDATE`);
  return r.rows[0] as unknown as Locked | undefined;
}

const snapshot = (row: Locked, over: Partial<ConversationSnapshot> = {}): ConversationSnapshot => ({
  id: row.id,
  status: row.status,
  assignedStaffUserId: row.assigned_staff_user_id,
  ownershipVersion: row.ownership_version,
  handoffReason: row.handoff_reason,
  waitingSince: row.waiting_since,
  ...over,
});

interface Plan {
  action: InboxAction;
  audit: InboxAuditEvent;
  to: ConversationStatus;
  assignee: string | null;
  /** Withdraw unsent AI replies (takeover-like moves). */
  withdraw: boolean;
  handoffTo: "claimed" | "resolved" | null;
  /** Keep the customer-waiting flag, or clear it. */
  clearWaiting: boolean;
  closing?: { note?: string };
  reopening?: boolean;
}

async function run(
  db: Db,
  actor: TransitionActor,
  conversationId: string,
  action: InboxAction,
  options: TransitionOptions,
  target: { assigneeId?: string } | undefined,
  plan: (row: Locked) => Plan,
): Promise<TransitionResult> {
  return db.transaction(async (tx): Promise<TransitionResult> => {
    const row = await lockConversation(tx, actor.tenantId, conversationId);
    if (!row) return { ok: false, reason: "not_found" };

    const reject = async (reason: Extract<TransitionResult, { ok: false }>["reason"], detail: string): Promise<TransitionResult> => {
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actor: { type: "staff", id: actor.staffUserId },
        event: "transition.rejected",
        conversationId,
        metadata: { attempted: action, reason, status: row.status },
      });
      return { ok: false, reason, detail, currentStatus: row.status };
    };

    if (options.expectedVersion !== undefined && options.expectedVersion !== row.ownership_version) {
      return reject("stale", "this conversation changed since you loaded it; refresh and try again");
    }
    const verdict = evaluate(action, { status: row.status, assignedStaffUserId: row.assigned_staff_user_id }, actor, target);
    if (!verdict.ok) return reject(verdict.reason, verdict.detail);

    if (target?.assigneeId) {
      // The assignee must be an ACTIVE staff member of THIS tenant.
      const assignee = await tx.query.staffUsers.findFirst({
        where: and(eq(staffUsers.id, target.assigneeId), eq(staffUsers.tenantId, actor.tenantId), eq(staffUsers.isActive, true)),
      });
      if (!assignee) return reject("invalid_assignee", "assignee is not an active staff member of this business");
    }

    const p = plan(row);

    if (p.reopening) {
      // Reopening must never leave a customer with two open conversations
      // (the webhook resolves "the" active conversation by customer).
      const other = await tx.query.conversations.findFirst({
        where: and(eq(conversations.tenantId, actor.tenantId), eq(conversations.customerId, row.customer_id), ne(conversations.id, row.id), ne(conversations.status, "resolved")),
      });
      if (other) return reject("customer_has_active_conversation", "this customer already has a newer open conversation");
    }

    const closing = p.to === "resolved";
    const [updated] = await tx
      .update(conversations)
      .set({
        status: p.to,
        assignedStaffUserId: p.assignee,
        ownershipVersion: sql`${conversations.ownershipVersion} + 1`,
        ownershipChangedAt: new Date(),
        lastActivityAt: new Date(),
        updatedAt: new Date(),
        waitingSince: p.clearWaiting ? null : sql`coalesce(${conversations.waitingSince}, now())`,
        closedAt: closing ? new Date() : p.reopening ? null : sql`${conversations.closedAt}`,
        closedByStaffUserId: closing ? actor.staffUserId : p.reopening ? null : sql`${conversations.closedByStaffUserId}`,
        closeNote: closing ? (p.closing?.note ?? null) : p.reopening ? null : sql`${conversations.closeNote}`,
      })
      .where(and(eq(conversations.id, row.id), eq(conversations.tenantId, actor.tenantId)))
      .returning();

    // Keep the existing handoff records in step with ownership.
    if (p.handoffTo === "claimed") {
      await tx.update(handoffs).set({ status: "claimed", claimedByStaffUserId: p.assignee, updatedAt: new Date() })
        .where(and(eq(handoffs.conversationId, row.id), eq(handoffs.tenantId, actor.tenantId), eq(handoffs.status, "open")));
    } else if (p.handoffTo === "resolved") {
      await tx.update(handoffs).set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(handoffs.conversationId, row.id), eq(handoffs.tenantId, actor.tenantId), inArray(handoffs.status, ["open", "claimed"])));
    }

    const withdrawn = p.withdraw ? await cancelSupersededAiRows(tx, { conversationId: row.id }) : 0;

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actor: { type: "staff", id: actor.staffUserId },
      event: p.audit,
      conversationId,
      metadata: { from: row.status, to: p.to, assignee: p.assignee, previousAssignee: row.assigned_staff_user_id, withdrawnAiReplies: withdrawn },
    });

    return {
      ok: true,
      withdrawnAiReplies: withdrawn,
      conversation: snapshot(row, {
        status: updated.status,
        assignedStaffUserId: updated.assignedStaffUserId,
        ownershipVersion: updated.ownershipVersion,
        waitingSince: updated.waitingSince,
      }),
    };
  });
}

/** Staff accept a PENDING handoff and become its owner. */
export function acceptHandoff(db: Db, actor: TransitionActor, conversationId: string, o: TransitionOptions = {}) {
  return run(db, actor, conversationId, "accept", o, undefined, () => ({
    action: "accept", audit: "handoff.accepted", to: "staff_owned", assignee: actor.staffUserId,
    withdraw: true, handoffTo: "claimed", clearWaiting: false,
  }));
}

/** Staff take over an AI-active (or pending) conversation; an admin may
 * take over one owned by someone else. */
export function takeOverConversation(db: Db, actor: TransitionActor, conversationId: string, o: TransitionOptions = {}) {
  return run(db, actor, conversationId, "takeover", o, undefined, () => ({
    action: "takeover", audit: "conversation.taken_over", to: "staff_owned", assignee: actor.staffUserId,
    withdraw: true, handoffTo: "claimed", clearWaiting: false,
  }));
}

/** Assign (or reassign) ownership. Admins to anyone active in the tenant;
 * staff only to themselves. */
export function assignConversation(db: Db, actor: TransitionActor, conversationId: string, assigneeId: string, o: TransitionOptions = {}) {
  return run(db, actor, conversationId, "assign", o, { assigneeId }, () => ({
    action: "assign", audit: "conversation.assigned", to: "staff_owned", assignee: assigneeId,
    withdraw: true, handoffTo: "claimed", clearWaiting: false,
  }));
}

/** Hand the conversation back to the AI. */
export function returnToAi(db: Db, actor: TransitionActor, conversationId: string, o: TransitionOptions = {}) {
  return run(db, actor, conversationId, "release", o, undefined, () => ({
    action: "release", audit: "conversation.released_to_ai", to: "ai_active", assignee: null,
    withdraw: false, handoffTo: "resolved", clearWaiting: true,
  }));
}

/** Close (resolve) a conversation. The customer's NEXT message starts a
 * fresh conversation with the AI; staff may instead reopen this one. */
export function closeConversation(db: Db, actor: TransitionActor, conversationId: string, note?: string, o: TransitionOptions = {}) {
  return run(db, actor, conversationId, "close", o, undefined, (row) => ({
    action: "close", audit: "conversation.closed", to: "resolved", assignee: row.assigned_staff_user_id,
    withdraw: true, handoffTo: "resolved", clearWaiting: true, closing: { note },
  }));
}

/** Reopen a closed conversation; the reopening staff member owns it. */
export function reopenConversation(db: Db, actor: TransitionActor, conversationId: string, o: TransitionOptions = {}) {
  return run(db, actor, conversationId, "reopen", o, undefined, () => ({
    action: "reopen", audit: "conversation.reopened", to: "staff_owned", assignee: actor.staffUserId,
    withdraw: false, handoffTo: null, clearWaiting: true, reopening: true,
  }));
}
