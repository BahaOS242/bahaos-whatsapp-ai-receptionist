import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { ConversationStatus } from "../db/conversations";
import { allowedActions, type AllowedActions } from "./permissions";
import type { TransitionActor } from "./ownership";

/**
 * Read side of the inbox. EVERY query is scoped by the verified session's
 * tenant; a conversation id from another tenant is simply "not found".
 */

export type InboxFilter = "all" | "pending" | "human" | "ai" | "closed";
const FILTER_STATUS: Record<Exclude<InboxFilter, "all">, ConversationStatus> = {
  pending: "human_pending",
  human: "staff_owned",
  ai: "ai_active",
  closed: "resolved",
};

export type DeliveryState = "queued" | "sending" | "retrying" | "sent" | "failed" | "withdrawn";

export interface ConversationSummary {
  id: string;
  status: ConversationStatus;
  customerName: string | null;
  customerPhone: string;
  assignee: { id: string; name: string } | null;
  handoffReason: string | null;
  waitingSince: Date | null;
  lastActivityAt: Date;
  ownershipVersion: number;
  lastMessage: { preview: string; direction: "inbound" | "outbound"; senderType: string; at: Date } | null;
}

export interface InboxList {
  conversations: ConversationSummary[];
  counts: Record<InboxFilter, number>;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listConversations(
  db: Db,
  actor: TransitionActor,
  opts: { filter?: InboxFilter; q?: string; limit?: number } = {},
): Promise<InboxList> {
  const filter = opts.filter ?? "all";
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 100);
  const q = opts.q?.trim().slice(0, 100);
  const status = filter === "all" ? null : FILTER_STATUS[filter];
  const like = q ? `%${escapeLike(q)}%` : null;

  const rows = await db.execute(sql`
    SELECT c.id, c.status, c.handoff_reason, c.waiting_since, c.last_activity_at, c.ownership_version,
           cu.display_name AS customer_name, cu.whatsapp_id AS customer_phone,
           su.id AS assignee_id, su.name AS assignee_name,
           lm.content AS lm_content, lm.direction AS lm_direction, lm.sender_type AS lm_sender, lm.created_at AS lm_at
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id AND cu.tenant_id = c.tenant_id
      LEFT JOIN staff_users su ON su.id = c.assigned_staff_user_id AND su.tenant_id = c.tenant_id
      LEFT JOIN LATERAL (
        SELECT m.content, m.direction, m.sender_type, m.created_at FROM messages m
         WHERE m.conversation_id = c.id AND m.tenant_id = c.tenant_id
           AND (m.status IS NULL OR m.status <> 'suppressed')
         ORDER BY m.created_at DESC LIMIT 1) lm ON TRUE
     WHERE c.tenant_id = ${actor.tenantId}::uuid
       ${status ? sql`AND c.status = ${status}::conversation_status` : sql``}
       ${like ? sql`AND (cu.display_name ILIKE ${like} OR cu.whatsapp_id ILIKE ${like}
                         OR EXISTS (SELECT 1 FROM messages sm WHERE sm.conversation_id = c.id AND sm.tenant_id = c.tenant_id AND sm.content ILIKE ${like}))` : sql``}
     ORDER BY (c.waiting_since IS NOT NULL) DESC, c.last_activity_at DESC
     LIMIT ${limit}`);

  const countRows = await db.execute(sql`
    SELECT status, count(*)::int AS n FROM conversations WHERE tenant_id = ${actor.tenantId}::uuid GROUP BY status`);
  const by = Object.fromEntries((countRows.rows as unknown as Array<{ status: ConversationStatus; n: number }>).map((r) => [r.status, r.n]));
  const counts: Record<InboxFilter, number> = {
    pending: by.human_pending ?? 0,
    human: by.staff_owned ?? 0,
    ai: by.ai_active ?? 0,
    closed: by.resolved ?? 0,
    all: Object.values(by).reduce((a, b) => a + b, 0),
  };

  return {
    counts,
    conversations: (rows.rows as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      status: r.status as ConversationStatus,
      customerName: (r.customer_name as string | null) ?? null,
      customerPhone: r.customer_phone as string,
      assignee: r.assignee_id ? { id: r.assignee_id as string, name: r.assignee_name as string } : null,
      handoffReason: (r.handoff_reason as string | null) ?? null,
      waitingSince: (r.waiting_since as Date | null) ?? null,
      lastActivityAt: r.last_activity_at as Date,
      ownershipVersion: r.ownership_version as number,
      lastMessage: r.lm_at
        ? {
            preview: String(r.lm_content).replace(/\s+/g, " ").slice(0, 140),
            direction: r.lm_direction as "inbound" | "outbound",
            senderType: r.lm_sender as string,
            at: r.lm_at as Date,
          }
        : null,
    })),
  };
}

export interface MessageView {
  id: string;
  direction: "inbound" | "outbound";
  senderType: "customer" | "ai" | "staff" | "system";
  content: string;
  createdAt: Date;
  author: { id: string; name: string } | null;
  /** Outbound only; null for inbound. Derived from the REAL outbox state. */
  delivery: {
    state: DeliveryState;
    attempts: number;
    nextAttemptAt: Date | null;
    errorCode: string | null;
    error: string | null;
    sentAt: Date | null;
    /** A failed staff message the actor may retry. */
    retryable: boolean;
    /** Withdrawn after earlier send attempts: WhatsApp may already have accepted one. */
    mayHaveBeenDelivered: boolean;
  } | null;
}

export interface ConversationDetail {
  conversation: ConversationSummary & { closedAt: Date | null; closeNote: string | null };
  messages: MessageView[];
  allowedActions: AllowedActions;
  aiPaused: boolean;
}

const DELIVERY: Record<string, DeliveryState> = {
  pending: "queued", processing: "sending", retry_wait: "retrying", sent: "sent", dead_letter: "failed", cancelled: "withdrawn",
};

export async function getConversationDetail(
  db: Db,
  actor: TransitionActor,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const list = await db.execute(sql`
    SELECT c.id, c.status, c.handoff_reason, c.waiting_since, c.last_activity_at, c.ownership_version, c.closed_at, c.close_note,
           c.assigned_staff_user_id, cu.display_name AS customer_name, cu.whatsapp_id AS customer_phone,
           su.id AS assignee_id, su.name AS assignee_name
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id AND cu.tenant_id = c.tenant_id
      LEFT JOIN staff_users su ON su.id = c.assigned_staff_user_id AND su.tenant_id = c.tenant_id
     WHERE c.id = ${conversationId}::uuid AND c.tenant_id = ${actor.tenantId}::uuid`);
  const c = list.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!c) return null;

  const msgRows = await db.execute(sql`
    SELECT * FROM (
      SELECT m.id, m.direction, m.sender_type, m.content, m.created_at, m.status AS msg_status,
             au.id AS author_id, au.name AS author_name,
             o.status AS o_status, o.attempt_count, o.available_at, o.error_code, o.last_error, o.sent_at, (o.error_metadata->'withdrawn'->>'priorAttempts')::int AS withdrawn_prior
        FROM messages m
        LEFT JOIN staff_users au ON au.id = m.author_staff_user_id AND au.tenant_id = m.tenant_id
        LEFT JOIN outbox_messages o ON o.message_id = m.id AND o.tenant_id = m.tenant_id
       WHERE m.conversation_id = ${conversationId}::uuid AND m.tenant_id = ${actor.tenantId}::uuid
       ORDER BY m.created_at DESC, m.id DESC LIMIT 200) t
    ORDER BY created_at ASC, id ASC`);

  const status = c.status as ConversationStatus;
  const assigned = (c.assigned_staff_user_id as string | null) ?? null;
  const allowed = allowedActions({ status, assignedStaffUserId: assigned }, actor);

  const messagesOut: MessageView[] = (msgRows.rows as unknown as Array<Record<string, unknown>>).map((r) => {
    const outbound = r.direction === "outbound";
    let delivery: MessageView["delivery"] = null;
    if (outbound) {
      const oStatus = r.o_status as string | null;
      const state: DeliveryState = oStatus ? DELIVERY[oStatus] : r.msg_status === "suppressed" ? "withdrawn" : "sent";
      delivery = {
        state,
        attempts: (r.attempt_count as number | null) ?? 0,
        nextAttemptAt: oStatus === "pending" || oStatus === "retry_wait" ? (r.available_at as Date) : null,
        errorCode: (r.error_code as string | null) ?? null,
        error: (r.last_error as string | null) ?? null,
        sentAt: (r.sent_at as Date | null) ?? null,
        mayHaveBeenDelivered: state === "withdrawn" && ((r.withdrawn_prior as number | null) ?? 0) > 0,
        retryable: state === "failed" && r.sender_type === "staff" && allowed.reply,
      };
    }
    return {
      id: r.id as string,
      direction: r.direction as "inbound" | "outbound",
      senderType: r.sender_type as MessageView["senderType"],
      content: r.content as string,
      createdAt: r.created_at as Date,
      author: r.author_id ? { id: r.author_id as string, name: r.author_name as string } : null,
      delivery,
    };
  });

  return {
    conversation: {
      id: c.id as string,
      status,
      customerName: (c.customer_name as string | null) ?? null,
      customerPhone: c.customer_phone as string,
      assignee: c.assignee_id ? { id: c.assignee_id as string, name: c.assignee_name as string } : null,
      handoffReason: (c.handoff_reason as string | null) ?? null,
      waitingSince: (c.waiting_since as Date | null) ?? null,
      lastActivityAt: c.last_activity_at as Date,
      ownershipVersion: c.ownership_version as number,
      lastMessage: null,
      closedAt: (c.closed_at as Date | null) ?? null,
      closeNote: (c.close_note as string | null) ?? null,
    },
    messages: messagesOut,
    allowedActions: allowed,
    aiPaused: status === "human_pending" || status === "staff_owned",
  };
}

/** Active staff of the actor's tenant (for admin assignment). */
export async function listAssignableStaff(db: Db, actor: TransitionActor): Promise<Array<{ id: string; name: string; role: string }>> {
  const r = await db.execute(sql`
    SELECT id, name, role FROM staff_users WHERE tenant_id = ${actor.tenantId}::uuid AND is_active = true ORDER BY name`);
  return r.rows as unknown as Array<{ id: string; name: string; role: string }>;
}
