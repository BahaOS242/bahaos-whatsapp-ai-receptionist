import type { Db } from "../db/client";
import { auditEvents } from "../db/schema";

/**
 * Tenant-scoped, append-only audit trail for the human inbox, stored in the
 * existing `audit_events` table. The inbox exposes NO operation that updates
 * or deletes an audit row — there is only this insert.
 *
 * Metadata deliberately carries identifiers, states and reasons, never
 * message bodies, passwords or tokens.
 */
export type InboxAuditEvent =
  | "handoff.requested"
  | "handoff.accepted"
  | "conversation.taken_over"
  | "conversation.assigned"
  | "conversation.released_to_ai"
  | "conversation.closed"
  | "conversation.reopened"
  | "staff.reply_submitted"
  | "staff.reply_retried"
  | "ai.reply_suppressed"
  | "transition.rejected";

export interface AuditParams {
  tenantId: string;
  actor: { type: "ai" | "staff" | "system"; id?: string };
  event: InboxAuditEvent;
  conversationId: string;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(db: Db, p: AuditParams): Promise<void> {
  await db.insert(auditEvents).values({
    tenantId: p.tenantId,
    actorType: p.actor.type,
    actorId: p.actor.id ?? null,
    eventType: p.event,
    entityType: "conversation",
    entityId: p.conversationId,
    metadata: p.metadata ?? {},
  });
}
