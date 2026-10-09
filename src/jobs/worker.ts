import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { classifyJobError, decideAfterFailure } from "./policy";
import type { JobRegistry } from "./registry";
import { noopJobTelemetry, type JobTelemetry } from "./telemetry";
import { TransientJobError, type JobContext, type JobOutcome, type JobRow } from "./types";

/**
 * Claim → execute → record. Mechanics mirror the WhatsApp outbox worker
 * (SKIP LOCKED claim, lease, fencing token), but nothing here touches the
 * outbox or any messaging provider.
 *
 *  - The claim is ONE statement; no transaction is held while a handler runs.
 *  - Every write after the claim is fenced: `WHERE id AND status='running'
 *    AND claim_token=…`. A worker that lost its lease changes nothing.
 *  - Workers only claim job types in THEIR registry.
 */

export const DEFAULT_LEASE_SECONDS = 120;
const LEASE_TIMEOUT_MARGIN_MS = 5_000;
/** Upper bound on handing ONE unexecuted claim back during shutdown. */
const RELEASE_TIMEOUT_MS = 2_000;

export interface JobWorkerOptions {
  registry: JobRegistry;
  workerId?: string;
  clock?: () => Date;
  leaseSeconds?: number;
  /** Restrict to one tenant (tests, tenant-scoped drains). */
  tenantId?: string;
  telemetry?: JobTelemetry;
  rng?: () => number;
  /** Polled between database steps of a claim: once true, no further claim statement is issued. */
  shouldStop?: () => boolean;
}

const iso = (d: Date) => d.toISOString();

interface RawClaim {
  id: string; tenant_id: string; job_type: string; payload_version: number; payload: Record<string, unknown>;
  attempt_count: number; max_attempts: number; claim_token: string; lease_expires_at: Date | string; idempotency_key: string; started_at: Date | string; run_at: Date | string; created_at: Date | string;
}

/** Jobs whose lease expired on their LAST allowed attempt can never run again: fail them (and record why). */
async function failExhausted(db: Db, types: string[], now: Date, tenantId?: string): Promise<number> {
  const r = await db.execute(sql`
    WITH dead AS (
      UPDATE background_jobs
         SET status = 'failed', failed_at = ${iso(now)}::timestamptz, lease_expires_at = NULL, claim_token = NULL, lease_owner = NULL,
             error_code = 'lease_expired_exhausted', last_error = 'worker lease expired on the final allowed attempt',
             updated_at = ${iso(now)}::timestamptz
       WHERE status = 'running' AND lease_expires_at <= ${iso(now)}::timestamptz AND attempt_count >= max_attempts
         AND job_type IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})
         ${tenantId ? sql`AND tenant_id = ${tenantId}::uuid` : sql``}
   RETURNING id, tenant_id, attempt_count, started_at)
    INSERT INTO background_job_attempts (id, job_id, tenant_id, attempt, outcome, error_code, started_at, finished_at)
    SELECT gen_random_uuid(), id, tenant_id, attempt_count, 'lease_lost', 'lease_expired_exhausted', started_at, ${iso(now)}::timestamptz FROM dead
    RETURNING 1`);
  return r.rows.length;
}

/** Atomically claims up to `limit` eligible jobs. Never returns a job twice to two workers. */
export async function claimJobs(db: Db, opts: JobWorkerOptions, limit: number): Promise<JobRow[]> {
  const types = opts.registry.types();
  if (types.length === 0 || limit < 1) return [];
  const now = (opts.clock ?? (() => new Date()))();
  const lease = opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const owner = (opts.workerId ?? "worker").slice(0, 100);
  await failExhausted(db, types, now, opts.tenantId);
  if (opts.shouldStop?.()) return []; // shutdown began while the previous step was running: claim nothing

  const result = await db.execute(sql`
    WITH c AS (
      SELECT id, status AS prev_status, attempt_count AS prev_attempt, started_at AS prev_started
        FROM background_jobs
       WHERE job_type IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})
         AND ( (status = 'pending' AND run_at <= ${iso(now)}::timestamptz)
            OR (status = 'running' AND lease_expires_at <= ${iso(now)}::timestamptz AND attempt_count < max_attempts) )
         ${opts.tenantId ? sql`AND tenant_id = ${opts.tenantId}::uuid` : sql``}
       ORDER BY run_at, created_at, id
       LIMIT ${limit}
         FOR UPDATE SKIP LOCKED),
    upd AS (
      UPDATE background_jobs u
         SET status = 'running', attempt_count = u.attempt_count + 1, lease_owner = ${owner},
             claim_token = gen_random_uuid(), lease_expires_at = ${iso(new Date(now.getTime() + lease * 1000))}::timestamptz,
             started_at = ${iso(now)}::timestamptz, updated_at = ${iso(now)}::timestamptz
        FROM c WHERE u.id = c.id
    RETURNING u.id, u.tenant_id, u.job_type, u.payload_version, u.payload, u.attempt_count, u.max_attempts, u.claim_token,
              u.lease_expires_at, u.idempotency_key, u.started_at, u.run_at, u.created_at, c.prev_status, c.prev_attempt, c.prev_started),
    hist AS (
      INSERT INTO background_job_attempts (id, job_id, tenant_id, attempt, outcome, error_code, started_at, finished_at)
      SELECT gen_random_uuid(), id, tenant_id, prev_attempt, 'lease_lost', 'lease_expired', prev_started, ${iso(now)}::timestamptz
        FROM upd WHERE prev_status = 'running')
    SELECT id, tenant_id, job_type, payload_version, payload, attempt_count, max_attempts, claim_token, lease_expires_at, idempotency_key, started_at, run_at, created_at FROM upd ORDER BY run_at, created_at, id`);

  const rows = (result.rows as unknown as RawClaim[]).map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    type: r.job_type,
    payloadVersion: r.payload_version,
    payload: r.payload,
    attempt: r.attempt_count,
    maxAttempts: r.max_attempts,
    claimToken: r.claim_token,
    leaseExpiresAt: new Date(r.lease_expires_at),
    idempotencyKey: r.idempotency_key,
    startedAt: new Date(r.started_at),
  }));
  const tel = opts.telemetry ?? noopJobTelemetry;
  for (const r of rows) tel.emit("claimed", { jobId: r.id, tenantId: r.tenantId, type: r.type, attempt: r.attempt, leaseExpiresAt: r.leaseExpiresAt.toISOString() });
  return rows;
}

/**
 * Gives a claim back UNEXECUTED (shutdown raced the claim): fenced by the claim token, the
 * attempt is un-counted, no attempt row is written — as if the claim never happened.
 */
export async function releaseClaim(db: Db, row: JobRow, now: Date): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE background_jobs SET status = 'pending', attempt_count = GREATEST(attempt_count - 1, 0), lease_expires_at = NULL,
           claim_token = NULL, lease_owner = NULL, started_at = NULL, updated_at = ${iso(now)}::timestamptz
     WHERE ${FENCE(row)} RETURNING 1`);
  return r.rows.length > 0;
}

export type JobRunOutcome = "completed" | "skipped" | "retried" | "failed" | "lost_lease";

async function heartbeat(db: Db, row: JobRow, now: Date, leaseSeconds: number): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE background_jobs SET lease_expires_at = ${iso(new Date(now.getTime() + leaseSeconds * 1000))}::timestamptz, updated_at = ${iso(now)}::timestamptz
     WHERE id = ${row.id}::uuid AND tenant_id = ${row.tenantId}::uuid AND status = 'running' AND claim_token = ${row.claimToken}::uuid
 RETURNING 1`);
  return r.rows.length > 0;
}

const FENCE = (row: JobRow) =>
  sql`id = ${row.id}::uuid AND tenant_id = ${row.tenantId}::uuid AND status = 'running' AND claim_token = ${row.claimToken}::uuid`;

/** Executes ONE claimed job and records the outcome. Never throws for a handler failure. */
export async function executeJob(db: Db, opts: JobWorkerOptions, row: JobRow, external?: AbortSignal): Promise<JobRunOutcome> {
  const clock = opts.clock ?? (() => new Date());
  const tel = opts.telemetry ?? noopJobTelemetry;
  const def = opts.registry.get(row.type);
  const t0 = Date.now();
  const lease = opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS;

  const finish = async (kind: "completed" | "skipped" | "retry" | "failed", code: string | null, message: string | null, extra: { result?: unknown; runAt?: Date } = {}): Promise<JobRunOutcome> => {
    const now = clock();
    const durationMs = Date.now() - t0;
    const out = await db.transaction(async (tx) => {
      const nowIso = iso(now);
      let updated;
      if (kind === "completed" || kind === "skipped") {
        updated = await tx.execute(sql`
          UPDATE background_jobs SET status = 'completed', completed_at = ${nowIso}::timestamptz, result = ${extra.result ? JSON.stringify(extra.result) : null}::jsonb,
                 lease_expires_at = NULL, claim_token = NULL, lease_owner = NULL, error_code = NULL, last_error = NULL, updated_at = ${nowIso}::timestamptz
           WHERE ${FENCE(row)} RETURNING id`);
      } else if (kind === "retry") {
        updated = await tx.execute(sql`
          UPDATE background_jobs SET status = 'pending', run_at = ${iso(extra.runAt!)}::timestamptz, error_code = ${code}, last_error = ${message},
                 lease_expires_at = NULL, claim_token = NULL, lease_owner = NULL, updated_at = ${nowIso}::timestamptz
           WHERE ${FENCE(row)} RETURNING id`);
      } else {
        updated = await tx.execute(sql`
          UPDATE background_jobs SET status = 'failed', failed_at = ${nowIso}::timestamptz, error_code = ${code}, last_error = ${message},
                 lease_expires_at = NULL, claim_token = NULL, lease_owner = NULL, updated_at = ${nowIso}::timestamptz
           WHERE ${FENCE(row)} RETURNING id`);
      }
      if (updated.rows.length === 0) return false; // fenced out: someone else owns this job now
      await tx.execute(sql`
        INSERT INTO background_job_attempts (id, job_id, tenant_id, attempt, outcome, error_code, started_at, finished_at, duration_ms)
        VALUES (gen_random_uuid(), ${row.id}::uuid, ${row.tenantId}::uuid, ${row.attempt}, ${kind}, ${code}, ${iso(row.startedAt)}::timestamptz, ${nowIso}::timestamptz, ${durationMs})`);
      return true;
    });
    if (!out) {
      tel.emit("lease_lost", { jobId: row.id, tenantId: row.tenantId, type: row.type, attempt: row.attempt });
      return "lost_lease";
    }
    const base = { jobId: row.id, tenantId: row.tenantId, type: row.type, attempt: row.attempt, durationMs };
    if (kind === "completed") tel.emit("completed", base);
    else if (kind === "skipped") tel.emit("skipped", { ...base, reason: code });
    else if (kind === "retry") tel.emit("retry_scheduled", { ...base, reasonCode: code, runAt: extra.runAt!.toISOString() });
    else tel.emit("failed", { ...base, reasonCode: code });
    return kind === "retry" ? "retried" : kind;
  };

  if (!def) return finish("failed", "unknown_job_type", "job type is not registered in this worker");
  if (row.payloadVersion !== def.version) return finish("failed", "unsupported_payload_version", `payload v${row.payloadVersion}, handler v${def.version}`);
  const parsed = def.schema.safeParse(row.payload);
  if (!parsed.success) return finish("failed", "invalid_payload", "stored payload failed validation");

  const ac = new AbortController();
  const onExternal = () => ac.abort();
  external?.addEventListener("abort", onExternal);
  const ctx: JobContext = {
    jobId: row.id,
    tenantId: row.tenantId,
    type: row.type,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    operationId: `job:${row.id}`,
    db,
    now: clock,
    signal: ac.signal,
    heartbeat: () => heartbeat(db, row, clock(), lease),
  };

  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ac.abort();
        reject(new TransientJobError("handler_timeout", `handler exceeded ${def.timeoutMs}ms`));
      }, def.timeoutMs);
    });
    const outcome = (await Promise.race([def.handler(ctx, parsed.data), timeout])) as JobOutcome | void;
    if (outcome && outcome.skipped) return await finish("skipped", outcome.skipped.slice(0, 64), null, { result: { skipped: outcome.skipped.slice(0, 64), ...(outcome.result ?? {}) } });
    return await finish("completed", null, null, { result: outcome?.result });
  } catch (error) {
    const c = classifyJobError(error);
    const decision = decideAfterFailure(c, row.attempt, row.maxAttempts, def.backoffSeconds, opts.rng);
    if (decision.kind === "retry") {
      return await finish("retry", c.code, c.message, { runAt: new Date(clock().getTime() + decision.runAtSeconds * 1000) });
    }
    return await finish("failed", c.code, c.message);
  } finally {
    if (timer) clearTimeout(timer);
    external?.removeEventListener("abort", onExternal);
  }
}

export interface JobPassResult { claimed: number; completed: number; skipped: number; retried: number; failed: number; lostLease: number }

/** One synchronous pass (tests, scripts, drains): claim a batch and run it with bounded concurrency. */
export async function runJobPass(db: Db, opts: JobWorkerOptions, batchSize = 10, concurrency = 4): Promise<JobPassResult> {
  const rows = await claimJobs(db, opts, batchSize);
  const out: JobPassResult = { claimed: rows.length, completed: 0, skipped: 0, retried: 0, failed: 0, lostLease: 0 };
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const o = await executeJob(db, opts, r);
        if (o === "completed") out.completed++;
        else if (o === "skipped") out.skipped++;
        else if (o === "retried") out.retried++;
        else if (o === "failed") out.failed++;
        else out.lostLease++;
      }
    }),
  );
  return out;
}

const wakeListeners = new Set<() => void>();
/** "There is new work — look now." In-process only, fire-and-forget; the poll interval is the real guarantee. */
export function wakeJobWorkers(): void {
  for (const l of wakeListeners) l();
}

export interface JobPollerOptions extends JobWorkerOptions {
  pollIntervalMs: number;
  /** Max jobs executing at once in this process (backpressure: no claim beyond it). */
  concurrency: number;
  /**
   * Keep the process alive while polling. Off for in-process use (the web server keeps the loop alive itself);
   * the STANDALONE worker has nothing else holding the event loop open during database downtime, so it sets this.
   */
  keepAlive?: boolean;
  /** On stop(), wait at most this long for in-flight jobs, then abort them (leases recover the rest). */
  drainTimeoutMs?: number;
}

export function startJobWorker(db: Db, opts: JobPollerOptions): { stop: () => Promise<void>; inFlight: () => number } {
  const tel = opts.telemetry ?? noopJobTelemetry;
  const lease = opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  for (const type of opts.registry.types()) {
    const def = opts.registry.get(type)!;
    if (def.timeoutMs + LEASE_TIMEOUT_MARGIN_MS >= lease * 1000) throw new Error(`job type ${type}: timeoutMs must be well below the ${lease}s lease`);
  }
  const workerId = opts.workerId ?? `w-${process.pid}-${randomUUID().slice(0, 8)}`;
  const shared: JobWorkerOptions = { ...opts, workerId, shouldStop: () => stopped };
  const inflight = new Set<Promise<void>>();
  const shutdown = new AbortController();
  let stopped = false;
  let ticking = false;
  let errorDelayMs = 0;
  let notBefore = 0;

  // The in-progress tick (including a claim query that is still pending). stop() awaits it.
  let currentTick: Promise<void> | null = null;

  const tickBody = async () => {
    try {
      for (;;) {
        const capacity = opts.concurrency - inflight.size;
        if (stopped || capacity <= 0) break;
        const rows = await claimJobs(db, shared, capacity);
        errorDelayMs = 0;
        if (stopped) {
          // Shutdown raced a claim that was already in flight: NEVER start a handler now. Give the
          // rows back untouched (fenced, attempt un-counted) so another worker takes them at once.
          const now = (opts.clock ?? (() => new Date()))();
          // Bounded: if the database is stalled the release is abandoned and lease expiry recovers the row.
          for (const row of rows) await Promise.race([releaseClaim(db, row, now).catch(() => undefined), new Promise((r) => setTimeout(r, RELEASE_TIMEOUT_MS).unref?.())]);
          break;
        }
        for (const row of rows) {
          const p = executeJob(db, shared, row, shutdown.signal)
            .then(() => undefined)
            .catch((e: unknown) => tel.emit("poll_error", { stage: "execute", error: e instanceof Error ? e.name : "unknown" }))
            .finally(() => {
              inflight.delete(p);
              if (!stopped) setImmediate(() => void tick());
            });
          inflight.add(p);
        }
        if (rows.length < capacity) break; // drained what is due
      }
    } catch (e) {
      // database down / reconnecting: back off, never crash, never lose anything (state is in Postgres)
      errorDelayMs = Math.min(errorDelayMs ? errorDelayMs * 2 : 500, 30_000);
      notBefore = Date.now() + errorDelayMs;
      tel.emit("poll_error", { stage: "claim", error: e instanceof Error ? e.name : "unknown", retryInMs: errorDelayMs });
    }
  };

  const tick = async () => {
    if (stopped || ticking || Date.now() < notBefore) return;
    ticking = true;
    currentTick = tickBody().finally(() => {
      ticking = false;
      currentTick = null;
    });
    await currentTick;
  };

  const timer = setInterval(() => void tick(), opts.pollIntervalMs);
  if (!opts.keepAlive) timer.unref?.();
  const wake = () => setImmediate(() => void tick());
  wakeListeners.add(wake);
  tel.emit("worker_started", { workerId, concurrency: opts.concurrency, types: opts.registry.types().length });
  void tick();

  return {
    inFlight: () => inflight.size,
    /**
     * Total time is BOUNDED by ~ drainTimeoutMs + 2s (abort grace), however stalled the database is:
     * the pending claim, running handlers and claim cleanup all share one deadline. Nothing starts after
     * stop(); anything abandoned (a claim whose statement is stuck, a handler that ignores abort) is left
     * as `running` with a lease and is recovered by the next worker once the lease expires.
     */
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      wakeListeners.delete(wake);
      const deadline = Date.now() + (opts.drainTimeoutMs ?? 20_000);
      const within = (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), Math.max(0, ms)).unref?.())]);
      // a claim still in flight is resolved (released, bounded) BEFORE we drain — but never waited on forever
      const tickSettled = currentTick ? await within(currentTick, deadline - Date.now()) : true;
      const drained = await within(Promise.allSettled([...inflight]), deadline - Date.now());
      if (!drained || inflight.size > 0) {
        shutdown.abort(); // handlers see the signal; anything unfinished is recovered by lease expiry
        await within(Promise.allSettled([...inflight]), 2_000);
      }
      tel.emit("worker_stopped", { workerId, abandoned: inflight.size, claimAbandoned: !tickSettled });
    },
  };
}
