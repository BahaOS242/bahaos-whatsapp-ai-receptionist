import { leads } from "./schema";
import type { Db } from "./client";

/**
 * Durable lead records — Objective 1's requirement that a lead
 * reference the correct conversation/customer, not just be logged.
 */


export interface CreateLeadInput {
  tenantId: string;
  customerId: string;
  sourceConversationId?: string;
  serviceInterest?: string;
}

export async function createLeadRecord(db: Db, input: CreateLeadInput): Promise<{ id: string }> {
  const [inserted] = await db
    .insert(leads)
    .values({
      tenantId: input.tenantId,
      customerId: input.customerId,
      sourceConversationId: input.sourceConversationId,
      serviceInterest: input.serviceInterest,
    })
    .returning();
  return { id: inserted.id };
}
