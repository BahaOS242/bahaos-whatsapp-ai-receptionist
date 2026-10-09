import { z } from "zod";
import { sweepExpiredForTenant } from "../../memory/store";
import type { JobDefinition } from "../types";

/**
 * Real, bounded maintenance: retire expired customer memories of ONE tenant.
 * No customer-visible effect (retrieval already ignores expired rows), no
 * messages, no external calls. Safe to repeat: a second run finds nothing.
 */
export const MEMORY_EXPIRE_SWEEP = "memory.expire_sweep";

export const memoryExpireSweepJob: JobDefinition<{ limit: number }> = {
  type: MEMORY_EXPIRE_SWEEP,
  version: 1,
  schema: z.object({ limit: z.number().int().min(1).max(5000).default(500) }).strict(),
  maxAttempts: 5,
  timeoutMs: 30_000,
  idempotency: "Pure retirement of already-expired rows; re-running after a crash finds nothing left to do.",
  async handler(ctx, payload) {
    // Only the job's own tenant is ever passed on.
    const swept = await sweepExpiredForTenant(ctx.db, ctx.tenantId, ctx.now(), payload.limit);
    return { result: { swept } };
  },
};
