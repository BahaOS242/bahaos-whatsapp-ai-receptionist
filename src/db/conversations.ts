import { and, desc, eq, ne, sql } from "drizzle-orm";
import { conversations } from "./schema";
import type { BookingState } from "../ai/types";
import type { Db } from "./client";

/**
 * Durable conversation identity + state — Objective 1's load-bearing
 * piece. A conversation is what makes "the same customer messaging
 * again tomorrow" resolve to the SAME record (and the SAME BookingState)
 * rather than starting from a blank slate, and what lets that state
 * survive a process restart, unlike the in-memory-only
 * ConversationManager (src/ai/conversation-manager.ts, which remains
 * completely untouched — it's still exactly right for callers that
 * don't need persistence, e.g. scripts/dev-chat.ts and the eval
 * harnesses).
 */


export type ConversationStatus = "ai_active" | "human_pending" | "staff_owned" | "resolved";

/** HUMAN_PENDING or HUMAN_ACTIVE: a person owns (or has been asked to own)
 * the conversation, so the AI must not send ordinary replies. */
export function isHumanOwned(status: ConversationStatus): boolean {
  return status === "human_pending" || status === "staff_owned";
}

export interface ConversationRecord {
  id: string;
  tenantId: string;
  customerId: string;
  status: ConversationStatus;
  bookingState: BookingState;
}

function toRecord(row: {
  id: string;
  tenantId: string;
  customerId: string;
  status: ConversationStatus;
  bookingState: BookingState | null;
}): ConversationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    customerId: row.customerId,
    status: row.status,
    bookingState: row.bookingState ?? {},
  };
}

/**
 * Finds the customer's current, still-open conversation (status !==
 * "resolved"), or creates a fresh one — durable conversation identity.
 * Strictly scoped to (tenantId, customerId): a conversation belonging to
 * a different tenant or a different customer is never returned, even if
 * this is called concurrently for many different customers at once (see
 * tests/db/conversations.test.ts's tenant-isolation and
 * multiple-simultaneous-conversations coverage).
 *
 * Deliberately picks the MOST RECENT open conversation rather than
 * erroring if more than one somehow exists (e.g. from a genuine
 * same-customer concurrent-create race, which this function does not
 * fully prevent — see the docstring on the insert below) — always
 * resolves to exactly one usable conversation, never an ambiguous set.
 */
export async function findOrCreateActiveConversation(
  db: Db,
  tenantId: string,
  customerId: string,
): Promise<ConversationRecord> {
  const existing = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.tenantId, tenantId),
      eq(conversations.customerId, customerId),
      ne(conversations.status, "resolved"),
    ),
    orderBy: desc(conversations.createdAt),
  });
  if (existing) return toRecord(existing);

  // No uniqueness constraint enforces "at most one open conversation per
  // customer" — a genuine same-customer concurrent-create race could
  // create two. Accepted for Phase 1: a real WhatsApp webhook delivers
  // one customer's messages to one process sequentially in practice, and
  // this module explicitly does not build that webhook yet (see
  // PHASE1_PROGRESS.md). findOrCreateActiveConversation's own
  // "most recent" tiebreak keeps behavior well-defined even if it
  // happens.
  const [created] = await db
    .insert(conversations)
    .values({ tenantId, customerId, status: "ai_active", bookingState: {} })
    .returning();
  return toRecord(created);
}

/** Persists BookingState + handoff status for a conversation — called
 * once per processed turn so a restart resumes exactly where the
 * conversation left off. `handoffActive` maps onto the `status` column:
 * true -> "staff_owned" (a human, not automation, owns this
 * conversation now), false -> "ai_active". */
/**
 * Persists the AI's end-of-turn state. OWNERSHIP-AWARE (Phase 3): the AI may
 * only ever move a conversation ai_active -> human_pending (its own
 * handoff request). It can never overwrite a human-owned or closed
 * conversation — previously `status` was blindly set from the AI's
 * `handoffActive` flag, which would silently revert a staff takeover that
 * happened mid-turn. The conditional CASE below is evaluated by Postgres
 * against the row's CURRENT status, so it holds even if a staff transition
 * committed after this turn started.
 */
export async function persistConversationTurn(
  db: Db,
  conversationId: string,
  bookingState: BookingState,
  handoffRequested: boolean,
  handoffReason?: string,
): Promise<void> {
  const becomesPending = sql`(${conversations.status} = 'ai_active' AND ${handoffRequested})`;
  await db
    .update(conversations)
    .set({
      bookingState,
      status: sql`CASE WHEN ${becomesPending} THEN 'human_pending'::conversation_status ELSE ${conversations.status} END`,
      handoffReason: sql`CASE WHEN ${becomesPending} THEN ${handoffReason ?? "handoff requested"} ELSE ${conversations.handoffReason} END`,
      handoffRequestedAt: sql`CASE WHEN ${becomesPending} THEN now() ELSE ${conversations.handoffRequestedAt} END`,
      ownershipChangedAt: sql`CASE WHEN ${becomesPending} THEN now() ELSE ${conversations.ownershipChangedAt} END`,
      ownershipVersion: sql`CASE WHEN ${becomesPending} THEN ${conversations.ownershipVersion} + 1 ELSE ${conversations.ownershipVersion} END`,
      waitingSince: sql`CASE WHEN ${becomesPending} THEN now() ELSE ${conversations.waitingSince} END`,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));
}

export async function resolveConversation(db: Db, conversationId: string): Promise<void> {
  await db
    .update(conversations)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function getConversation(db: Db, conversationId: string): Promise<ConversationRecord | undefined> {
  const row = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
  return row ? toRecord(row) : undefined;
}
