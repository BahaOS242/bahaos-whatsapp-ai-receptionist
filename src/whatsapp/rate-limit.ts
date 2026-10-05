import { and, count, eq, gte } from "drizzle-orm";
import { conversations, messages } from "../db/schema";
import type { Db } from "../db/client";

/**
 * Minimal V1 abuse protection for the webhook — Phase 11's "message
 * storms"/"abusive traffic" requirement. Deliberately database-backed,
 * not an in-memory counter: the existing `messages` table already
 * durably records every inbound message with a timestamp, so "how many
 * messages has this customer sent in the last N seconds" is a plain
 * indexed query against data this app writes anyway — no new table, no
 * Redis, and (unlike an in-memory counter) correct even if this app runs
 * as more than one process, since every process sees the same Postgres
 * rows. The cost is one extra query per inbound message; at this
 * product's traffic shape (one clinic) that's negligible, and it only
 * runs before any of the real work (LLM call, booking) begins.
 *
 * Scoped per-CUSTOMER, not per-IP: every real WhatsApp webhook request
 * originates from Meta's own infrastructure, not the customer's device,
 * so an IP-based limit would only ever measure Meta's traffic pattern,
 * never a specific customer's — the meaningful abuse dimension here is
 * "one phone number sending far more messages than any real customer
 * would in this window."
 */

/** Generous enough that no legitimate, even fast-typing customer working
 * through a real booking (or torture-test-style messy) conversation
 * would ever hit it — the busiest realistic conversations in this
 * codebase's own torture suite run well under 20 turns — while still
 * bounding a genuine storm/abuse burst. */
export const DEFAULT_RATE_LIMIT_MAX_MESSAGES = 20;
export const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;

/** True when `customerId` has already sent `max` or more inbound
 * messages within the last `windowSeconds`, as of `now` — checked
 * BEFORE the current message is recorded, so the current message isn't
 * counted against itself. */
export async function isRateLimited(
  db: Db,
  customerId: string,
  now: Date = new Date(),
  max: number = DEFAULT_RATE_LIMIT_MAX_MESSAGES,
  windowSeconds: number = DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
): Promise<boolean> {
  const since = new Date(now.getTime() - windowSeconds * 1000);
  const [row] = await db
    .select({ total: count() })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(eq(conversations.customerId, customerId), eq(messages.direction, "inbound"), gte(messages.createdAt, since)),
    );
  return (row?.total ?? 0) >= max;
}
