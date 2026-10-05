import { and, desc, eq, ne } from "drizzle-orm";
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


export interface ConversationRecord {
  id: string;
  tenantId: string;
  customerId: string;
  status: "ai_active" | "staff_owned" | "resolved";
  bookingState: BookingState;
}

function toRecord(row: {
  id: string;
  tenantId: string;
  customerId: string;
  status: "ai_active" | "staff_owned" | "resolved";
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
export async function persistConversationTurn(
  db: Db,
  conversationId: string,
  bookingState: BookingState,
  handoffActive: boolean,
): Promise<void> {
  await db
    .update(conversations)
    .set({
      bookingState,
      status: handoffActive ? "staff_owned" : "ai_active",
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));
}

/** Explicit close — nothing in this codebase calls this automatically
 * yet (a customer can always message again), but staff tooling or a
 * future cleanup job needs it, and "resolved" is a real status value
 * findOrCreateActiveConversation already treats specially (a resolved
 * conversation is never resumed — a fresh one starts instead). */
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
