import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditEvents } from "../db/schema";
import { noopJobTelemetry, type JobTelemetry } from "./telemetry";
import type { JobStatus } from "./types";

/**
 * Operator-facing, TENANT-SCOPED inspection and control. Every query carries
 * the tenant; another tenant's job id is indistinguishable from a missing one.
 * Lists never include payloads (they may hold customer identifiers).
 */

export type JobView = "pending" | "scheduled" | "running" | "retrying" | "failed" | "completed" | "cancelled";

export interface JobSummary {
  id: string;
  type: string;
  status: JobStatus;
  runAt: Date;
  attempt: number;
  maxAttempts: number;
  requeueCount: number;
  errorCode: string | null;
  lastError: string | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
}

interface Row {
  id: string; job_type: string; status: JobStatus; run_at: Date; attempt_count: number; max_attempts: number; requeue_count: number;
  error_code: string | null; last_error: string | null; lease_expires_at: Date | null; created_at: Date; completed_at: Date | null; failed_at: Date | null;
}
const COLS = sql`id, job_type, status, run_at, attempt_count, max_attempts, requeue_count, error_code, last_error, lease_expires_at, created_at, completed_at, failed_at`;
const toSummary = (r: Row): JobSummary => ({
  id: r.id, type: r.job_type, status: r.status, runAt: r.run_at, attempt: r.attempt_count, maxAttempts: r.max_attempts, requeueCount: r.requeue_count,
  errorCode: r.error_code, lastError: r.last_error, leaseExpiresAt: r.lease_expires_at, createdAt: r.created_at, completedAt: r.completed_at, failedAt: r.failed_at,
});

export async function listJobs(
  db: Db, tenantId: string, opts: { view?: JobView; type?: string; limit?: number; now?: Date } = {},
): Promise<JobSummary[]> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 200);
  const now = (opts.now ?? new Date()).toISOString();
  const view = opts.view;
  const cond =
    view === "pending" ? sql`AND status = 'pending' AND attempt_count = 0 AND run_at <= ${now}::timestamptz`
    : view === "scheduled" ? sql`AND status = 'pending' AND attempt_count = 0 AND run_at > ${now}::timestamptz`
    : view === "retrying" ? sql`AND status = 'pending' AND attempt_count > 0`
    : view ? sql`AND status = ${view}::job_status`
    : sql``;
  const r = await db.execute(sql`
    SELECT ${COLS} FROM background_jobs WHERE tenant_id = ${tenantId}::uuid ${cond}
      ${opts.type ? sql`AND job_type = ${opts.type}` : sql``}
    ORDER BY created_at DESC, id LIMIT ${limit}`);
  return (r.rows as unknown as Row[]).map(toSummary);
}

export async function jobCounts(db: Db, tenantId: string): Promise<Record<JobStatus, number>> {
  const r = await db.execute(sql`SELECT status, count(*)::int n FROM background_jobs WHERE tenant_id = ${tenantId}::uuid GROUP BY status`);
  const out: Record<JobStatus, number> = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const row of r.rows as Array<{ status: JobStatus; n: number }>) out[row.status] = row.n;
  return out;
}

export interface JobDetail extends JobSummary {
  payloadVersion: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  history: Array<{ attempt: number; outcome: string; errorCode: string | null; startedAt: Date | null; finishedAt: Date; durationMs: number | null }>;
}

export async function getJob(db: Db, tenantId: string, jobId: string): Promise<JobDetail | null> {
  const r = await db.execute(sql`
    SELECT ${COLS}, payload_version, payload, result FROM background_jobs WHERE id = ${jobId}::uuid AND tenant_id = ${tenantId}::uuid`);
  const row = r.rows[0] as unknown as (Row & { payload_version: number; payload: Record<string, unknown>; result: Record<string, unknown> | null }) | undefined;
  if (!row) return null;
  const h = await db.execute(sql`
    SELECT attempt, outcome, error_code, started_at, finished_at, duration_ms FROM background_job_attempts
     WHERE job_id = ${jobId}::uuid AND tenant_id = ${tenantId}::uuid ORDER BY finished_at, attempt`);
  return {
    ...toSummary(row), payloadVersion: row.payload_version, payload: row.payload, result: row.result,
    history: (h.rows as Array<{ attempt: number; outcome: string; error_code: string | null; started_at: Date | null; finished_at: Date; duration_ms: number | null }>)
      .map((x) => ({ attempt: x.attempt, outcome: x.outcome, errorCode: x.error_code, startedAt: x.started_at, finishedAt: x.finished_at, durationMs: x.duration_ms })),
  };
}

export type JobAdminResult = { ok: true } | { ok: false; reason: "not_found" | "not_cancellable" | "not_failed" };
export interface AdminActor { staffUserId?: string }

async function audit(db: Db, tenantId: string, event: string, jobId: string, actor: AdminActor, metadata: Record<string, unknown>) {
  await db.insert(auditEvents).values({
    tenantId, actorType: actor.staffUserId ? "staff" : "system", actorId: actor.staffUserId ?? null,
    eventType: event, entityType: "background_job", entityId: jobId, metadata,
  });
}

/** Cancels a job that has NOT started. A running job cannot be cancelled (its handler may already have acted). */
export async function cancelJob(db: Db, tenantId: string, jobId: string, actor: AdminActor = {}, opts: { now?: Date; telemetry?: JobTelemetry } = {}): Promise<JobAdminResult> {
  const now = (opts.now ?? new Date()).toISOString();
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`
      UPDATE background_jobs SET status = 'cancelled', cancelled_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
       WHERE id = ${jobId}::uuid AND tenant_id = ${tenantId}::uuid AND status = 'pending' RETURNING job_type`);
    if (r.rows.length === 0) {
      const e = await tx.execute(sql`SELECT 1 FROM background_jobs WHERE id = ${jobId}::uuid AND tenant_id = ${tenantId}::uuid`);
      return { ok: false, reason: e.rows.length ? "not_cancellable" : "not_found" } as const;
    }
    await audit(tx, tenantId, "job.cancelled", jobId, actor, { type: (r.rows[0] as { job_type: string }).job_type });
    (opts.telemetry ?? noopJobTelemetry).emit("cancelled", { jobId, tenantId });
    return { ok: true } as const;
  });
}

/**
 * Re-queues a FAILED job: same id, same idempotency key, fresh attempt budget.
 * History (attempt rows, audit) is preserved; only execution fields reset. The
 * handler still re-validates business state when it runs — requeue never
 * bypasses a safety check.
 */
export async function requeueJob(db: Db, tenantId: string, jobId: string, actor: AdminActor = {}, opts: { now?: Date; telemetry?: JobTelemetry } = {}): Promise<JobAdminResult> {
  const now = (opts.now ?? new Date()).toISOString();
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`
      UPDATE background_jobs SET status = 'pending', attempt_count = 0, run_at = ${now}::timestamptz, failed_at = NULL,
             lease_expires_at = NULL, claim_token = NULL, lease_owner = NULL, requeue_count = requeue_count + 1, updated_at = ${now}::timestamptz
       WHERE id = ${jobId}::uuid AND tenant_id = ${tenantId}::uuid AND status = 'failed'
   RETURNING job_type, requeue_count, error_code`);
    if (r.rows.length === 0) {
      const e = await tx.execute(sql`SELECT 1 FROM background_jobs WHERE id = ${jobId}::uuid AND tenant_id = ${tenantId}::uuid`);
      return { ok: false, reason: e.rows.length ? "not_failed" : "not_found" } as const;
    }
    const row = r.rows[0] as { job_type: string; requeue_count: number; error_code: string | null };
    await audit(tx, tenantId, "job.requeued", jobId, actor, { type: row.job_type, requeueCount: row.requeue_count, previousErrorCode: row.error_code });
    (opts.telemetry ?? noopJobTelemetry).emit("requeued", { jobId, tenantId });
    return { ok: true } as const;
  });
}
