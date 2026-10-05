import { handoffs } from "./schema";
import type { HandoffContext } from "./schema";
import type { Db } from "./client";

/**
 * Durable escalation records — Objective 7's actual requirement: "a
 * handoff should contain enough context for the human to understand"
 * the customer, conversation, reason, booking state, requested action,
 * and unresolved question. `conversationId` (and, transitively via the
 * conversations table, `customerId`) makes every handoff traceable back
 * to exactly one customer/conversation; `context` carries the rest as a
 * structured snapshot rather than something a human has to reconstruct
 * from raw message text.
 */


export interface CreateHandoffInput {
  tenantId: string;
  conversationId: string;
  reason: string;
  context?: HandoffContext;
}

export async function createHandoff(db: Db, input: CreateHandoffInput): Promise<{ id: string }> {
  const [inserted] = await db
    .insert(handoffs)
    .values({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      reason: input.reason,
      context: input.context,
    })
    .returning();
  return { id: inserted.id };
}
