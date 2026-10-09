import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { payloadHash } from "./canonical";
import type { JobRegistry } from "./registry";
import { noopJobTelemetry, type JobTelemetry } from "./telemetry";
import { InvalidJobPayloadError, JobIdempotencyConflictError, UnknownJobTypeError, type JobStatus } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9._:@/-]{1,200}$/;
const MAX_HORIZON_MS = 400 * 24 * 3600 * 1000;

export interface EnqueueJobInput {
  tenantId: string;
  type: string;
  payload: unknown;
  /** Identity of the LOGICAL job within the tenant. Same key + same content => the same job. */
  idempotencyKey: string;
  /** UTC instant before which the job must not run. Default: now. */
  runAt?: Date;
  /** Override (1..20); defaults to the type's maxAttempts. */
  maxAttempts?: number;
}

export interface EnqueueResult {
  id: string;
  deduplicated: boolean;
  status: JobStatus;
}

/**
 * Durably records a job. Pass a TRANSACTION handle to make the job atomic with
 * the business write that caused it (rollback removes the job). Validates the
 * type against the registry and the payload against the type's schema.
 */
export async function enqueueJob(
  db: Db,
  registry: JobRegistry,
  input: EnqueueJobInput,
  opts: { now?: Date; telemetry?: JobTelemetry } = {},
): Promise<EnqueueResult> {
  const telemetry = opts.telemetry ?? noopJobTelemetry;
  const now = opts.now ?? new Date();
  const def = registry.get(input.type);
  if (!def) throw new UnknownJobTypeError(String(input.type).slice(0, 64));
  if (!UUID.test(input.tenantId)) throw new RangeError("tenantId must be a UUID");
  if (!KEY.test(input.idempotencyKey)) throw new RangeError("idempotencyKey must be 1-200 chars of [A-Za-z0-9._:@/-]");

  const parsed = def.schema.safeParse(input.payload);
  if (!parsed.success) throw new InvalidJobPayloadError(def.type, parsed.error.issues.map((i) => i.path.join(".")));
  const payload = parsed.data as Record<string, unknown>;

  const runAt = input.runAt ?? now;
  if (Number.isNaN(runAt.getTime())) throw new RangeError("runAt must be a valid date");
  if (runAt.getTime() - now.getTime() > MAX_HORIZON_MS) throw new RangeError("runAt is more than 400 days ahead");
  const maxAttempts = input.maxAttempts ?? def.maxAttempts;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new RangeError("maxAttempts must be 1..20");

  const hash = payloadHash(def.type, def.version, payload);
  const inserted = await db.execute(sql`
    INSERT INTO background_jobs
      (id, tenant_id, job_type, payload_version, payload, payload_hash, status, run_at, max_attempts, idempotency_key, created_at, updated_at)
    VALUES (gen_random_uuid(), ${input.tenantId}::uuid, ${def.type}, ${def.version}, ${JSON.stringify(payload)}::jsonb, ${hash}, 'pending',
            ${runAt.toISOString()}::timestamptz, ${maxAttempts}, ${input.idempotencyKey}, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id, status`);
  const created = inserted.rows[0] as { id: string; status: JobStatus } | undefined;
  if (created) {
    telemetry.emit("enqueued", { jobId: created.id, tenantId: input.tenantId, type: def.type, runAt: runAt.toISOString() });
    return { id: created.id, deduplicated: false, status: created.status };
  }

  const existing = await db.execute(sql`
    SELECT id, status, payload_hash FROM background_jobs
     WHERE tenant_id = ${input.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}`);
  const row = existing.rows[0] as { id: string; status: JobStatus; payload_hash: string } | undefined;
  if (!row) throw new Error("enqueue conflict row vanished"); // would require a concurrent hard delete
  if (row.payload_hash !== hash) throw new JobIdempotencyConflictError(row.id);
  telemetry.emit("deduplicated", { jobId: row.id, tenantId: input.tenantId, type: def.type });
  return { id: row.id, deduplicated: true, status: row.status };
}
