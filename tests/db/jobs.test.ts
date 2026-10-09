import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import * as schema from "../../src/db/schema";
import { auditEvents, backgroundJobAttempts, backgroundJobs, conversations, customerMemories, messages, outboxMessages } from "../../src/db/schema";
import { cancelJob, getJob, jobCounts, listJobs, requeueJob } from "../../src/jobs/admin";
import { createDefaultJobRegistry } from "../../src/jobs/default-registry";
import { enqueueJob } from "../../src/jobs/enqueue";
import { appointmentIsActive, conversationAllowsAutomation, customerMayBeContacted, memorySlotNotRemovedSince } from "../../src/jobs/guards";
import { MEMORY_EXPIRE_SWEEP } from "../../src/jobs/handlers/memory-expire-sweep";
import { createJobRegistry } from "../../src/jobs/registry";
import type { JobTelemetry } from "../../src/jobs/telemetry";
import { InvalidJobPayloadError, JobIdempotencyConflictError, UnknownJobTypeError, type JobDefinition } from "../../src/jobs/types";
import { claimJobs, executeJob, runJobPass, startJobWorker, type JobWorkerOptions } from "../../src/jobs/worker";
import { enqueueOutboundMessage } from "../../src/messaging/outbox";
import { applyCandidate, deleteMemory } from "../../src/memory/store";
import { createTestDb, resetTestData, seedFixtures } from "./db-test-helpers";
import { seedConversation } from "./outbox-helpers";
import { createTestHarness, type TestHarness } from "../jobs/test-handlers";

/**
 * LANE: DATABASE INTEGRATION (disposable Postgres) for the durable job engine.
 * Test-only handlers (tests/jobs/test-handlers.ts); no network, no provider, no live LLM.
 * Clocks are injected: nothing here depends on wall-clock time except the few
 * real-timer lifecycle tests (poller/shutdown/timeout), which say so.
 */
describe("Durable background jobs (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  pool.on("error", () => {}); // the outage test kills connections; the pool replaces them
  const T0 = new Date("2026-08-20T15:00:00Z");
  const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
  let h: TestHarness;
  beforeEach(async () => { await resetTestData(db); h = createTestHarness(); });
  afterAll(async () => { await pool.end(); });

  const tenant = async () => (await seedConversation(db)).tenantId;
  const opts = (over: Partial<JobWorkerOptions> = {}, now = T0): JobWorkerOptions => ({ registry: h.registry, workerId: "w1", clock: () => now, ...over });
  const put = (tenantId: string, payload: unknown, over: { key?: string; runAt?: Date; maxAttempts?: number; type?: string } = {}, tx = db) =>
    enqueueJob(tx, h.registry, { tenantId, type: over.type ?? "test.scripted", payload, idempotencyKey: over.key ?? `k-${randomUUID()}`, runAt: over.runAt, maxAttempts: over.maxAttempts }, { now: T0 });
  const row = async (id: string) => (await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0];
  const attempts = async (id: string) => db.select().from(backgroundJobAttempts).where(eq(backgroundJobAttempts.jobId, id)).orderBy(backgroundJobAttempts.finishedAt);

  describe("transactional enqueue, idempotency, validation", () => {
    it("persists a validated job and it survives a brand-new connection pool (process restart equivalent)", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "ok" });
      const other = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test" });
      try {
        const r = await other.query("select status, job_type, payload_version, payload, attempt_count, length(payload_hash) as h from background_jobs where id = $1", [id]);
        expect(r.rows[0]).toMatchObject({ status: "pending", job_type: "test.scripted", payload_version: 1, payload: { op: "ok" }, attempt_count: 0, h: 64 });
      } finally { await other.end(); }
    });

    it("a rolled-back transaction leaves NO job; a committed one is atomic with the business write", async () => {
      const t = await tenant();
      await expect(db.transaction(async (tx) => { await put(t, { op: "ok" }, { key: "rb" }, tx as never); throw new Error("boom"); })).rejects.toThrow("boom");
      expect(await db.select().from(backgroundJobs)).toHaveLength(0);
      await db.transaction(async (tx) => {
        await tx.insert(customerMemories).values({ tenantId: t, customerId: (await tx.query.customers.findFirst({ where: eq(schema.customers.tenantId, t) }))!.id, kind: "preferred_name", slot: "name", value: "A", source: "customer_stated" });
        await put(t, { op: "ok" }, { key: "commit" }, tx as never);
      });
      expect(await db.select().from(backgroundJobs)).toHaveLength(1);
      expect(await db.select().from(customerMemories)).toHaveLength(1);
    });

    it("duplicate key + same content = same job (also under concurrency); no duplicates", async () => {
      const t = await tenant();
      const a = await put(t, { op: "ok" }, { key: "dup" });
      const b = await put(t, { op: "ok" }, { key: "dup" });
      expect(b).toMatchObject({ id: a.id, deduplicated: true });
      const many = await Promise.all(Array.from({ length: 12 }, () => put(t, { op: "ok", note: "x" }, { key: "race" })));
      expect(new Set(many.map((m) => m.id)).size).toBe(1);
      expect(many.filter((m) => !m.deduplicated)).toHaveLength(1);
      expect(await db.select().from(backgroundJobs)).toHaveLength(2);
    });

    it("same key with a different payload (or type) is REJECTED and changes nothing", async () => {
      const t = await tenant();
      const a = await put(t, { op: "ok" }, { key: "conflict" });
      await expect(put(t, { op: "sleep", ms: 5 }, { key: "conflict" })).rejects.toBeInstanceOf(JobIdempotencyConflictError);
      expect((await row(a.id)).payload).toEqual({ op: "ok" });
      expect(await db.select().from(backgroundJobs)).toHaveLength(1);
    });

    it("the same key in another tenant is a different job", async () => {
      const a = await tenant();
      const b = await tenant();
      const x = await put(a, { op: "ok" }, { key: "same" });
      const y = await put(b, { op: "ok" }, { key: "same" });
      expect(x.id).not.toBe(y.id);
    });

    it("unknown types, invalid payloads and bad inputs are rejected before anything is stored", async () => {
      const t = await tenant();
      await expect(put(t, { op: "ok" }, { type: "evil.shell_exec" })).rejects.toBeInstanceOf(UnknownJobTypeError);
      await expect(put(t, { op: "rm -rf" })).rejects.toBeInstanceOf(InvalidJobPayloadError);
      await expect(put(t, { op: "ok", extra: "field" })).rejects.toBeInstanceOf(InvalidJobPayloadError);
      const err = await put(t, { op: "ok", note: 42 }).catch((e: Error) => e);
      expect((err as Error).message).toContain("note");
      expect((err as Error).message).not.toContain("42"); // paths only, never values
      await expect(put(t, { op: "ok" }, { runAt: new Date("nope") })).rejects.toThrow(RangeError);
      await expect(put(t, { op: "ok" }, { runAt: at(500 * 24 * 3600) })).rejects.toThrow(/400 days/);
      await expect(put(t, { op: "ok" }, { key: "bad key with spaces" })).rejects.toThrow(RangeError);
      await expect(put(t, { op: "ok" }, { maxAttempts: 0 })).rejects.toThrow(RangeError);
      await expect(put("not-a-uuid", { op: "ok" })).rejects.toThrow(RangeError);
      await expect(put(randomUUID(), { op: "ok" })).rejects.toThrow(); // FK: tenant must exist
      expect(await db.select().from(backgroundJobs)).toHaveLength(0);
    });

    it("the payload stored is the VALIDATED payload (defaults applied), and the real sweep type validates its own schema", async () => {
      const t = await tenant();
      const r = createDefaultJobRegistry();
      const { id } = await enqueueJob(db, r, { tenantId: t, type: MEMORY_EXPIRE_SWEEP, payload: {}, idempotencyKey: "sweep-1" }, { now: T0 });
      expect((await row(id)).payload).toEqual({ limit: 500 });
      await expect(enqueueJob(db, r, { tenantId: t, type: MEMORY_EXPIRE_SWEEP, payload: { limit: 0 }, idempotencyKey: "sweep-2" })).rejects.toBeInstanceOf(InvalidJobPayloadError);
      await expect(enqueueJob(db, r, { tenantId: t, type: MEMORY_EXPIRE_SWEEP, payload: { tenantId: randomUUID() }, idempotencyKey: "sweep-3" })).rejects.toBeInstanceOf(InvalidJobPayloadError);
    });
  });

  describe("scheduling correctness", () => {
    it("a scheduled job cannot run early; it becomes eligible exactly at run_at; overdue jobs are eligible", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "ok" }, { runAt: at(60) });
      expect(await claimJobs(db, opts({}, at(0)), 10)).toHaveLength(0);
      expect(await claimJobs(db, opts({}, at(59)), 10)).toHaveLength(0);
      const got = await claimJobs(db, opts({}, at(60)), 10);
      expect(got.map((g) => g.id)).toEqual([id]);
      const overdue = await put(t, { op: "ok" }, { runAt: at(-3600) });
      expect((await claimJobs(db, opts({}, at(61)), 10)).map((g) => g.id)).toEqual([overdue.id]);
    });

    it("jobs are claimed oldest-due first", async () => {
      const t = await tenant();
      const c = await put(t, { op: "ok" }, { runAt: at(30) });
      const a = await put(t, { op: "ok" }, { runAt: at(10) });
      const b = await put(t, { op: "ok" }, { runAt: at(20) });
      expect((await claimJobs(db, opts({}, at(100)), 10)).map((g) => g.id)).toEqual([a.id, b.id, c.id]);
    });
  });

  describe("claiming, leases and fencing", () => {
    it("two workers claiming at the same instant never get the same job", async () => {
      const t = await tenant();
      const ids = await Promise.all(Array.from({ length: 30 }, (_, i) => put(t, { op: "ok" }, { key: `c-${i}` })));
      const [a, b, c] = await Promise.all([claimJobs(db, opts({ workerId: "A" }), 12), claimJobs(db, opts({ workerId: "B" }), 12), claimJobs(db, opts({ workerId: "C" }), 12)]);
      const all = [...a, ...b, ...c].map((r) => r.id);
      expect(new Set(all).size).toBe(all.length); // no overlap
      expect(all.length).toBe(30);
      expect(new Set(all)).toEqual(new Set(ids.map((i) => i.id)));
      for (const r of [...a, ...b, ...c]) expect(r.attempt).toBe(1);
    });

    it("lease expiry lets another worker recover a dead worker's job (attempt 2), and records the lost attempt", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "ok" });
      const [first] = await claimJobs(db, opts({ workerId: "dead", leaseSeconds: 60 }), 1); // "worker dies" here
      expect(first.attempt).toBe(1);
      expect(await claimJobs(db, opts({ workerId: "B", leaseSeconds: 60 }, at(59)), 1)).toHaveLength(0); // lease still held
      const [second] = await claimJobs(db, opts({ workerId: "B", leaseSeconds: 60 }, at(61)), 1);
      expect(second.id).toBe(id);
      expect(second.attempt).toBe(2);
      expect(second.claimToken).not.toBe(first.claimToken);
      expect((await attempts(id)).map((a) => [a.attempt, a.outcome])).toEqual([[1, "lease_lost"]]);
    });

    it("a job whose lease expired on its LAST attempt is failed, not re-run forever", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "ok" }, { maxAttempts: 1 });
      await claimJobs(db, opts({ leaseSeconds: 60 }), 1);
      expect(await claimJobs(db, opts({ leaseSeconds: 60 }, at(61)), 1)).toHaveLength(0);
      expect(await row(id)).toMatchObject({ status: "failed", errorCode: "lease_expired_exhausted", claimToken: null });
    });

    it("a STALE worker cannot complete or overwrite a newer attempt (fencing)", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "gate", gate: "g1" });
      const [stale] = await claimJobs(db, opts({ workerId: "stale", leaseSeconds: 60 }), 1);
      const staleRun = executeJob(db, opts({ workerId: "stale", leaseSeconds: 60 }, at(10)), stale); // stuck inside the handler
      await h.gate("g1").entered;
      const [fresh] = await claimJobs(db, opts({ workerId: "fresh", leaseSeconds: 60 }, at(61)), 1); // lease expired -> recovered
      expect(fresh.attempt).toBe(2);
      h.gate("g1").release();
      expect(await staleRun).toBe("lost_lease"); // handler "finished", but it no longer owns the job
      let r = await row(id);
      expect(r).toMatchObject({ status: "running", claimToken: fresh.claimToken, leaseOwner: "fresh" });
      expect(await executeJob(db, opts({ workerId: "fresh" }, at(62)), fresh)).toBe("completed");
      r = await row(id);
      expect(r.status).toBe("completed");
      expect(r.result).toEqual({ by: 2 }); // the NEW attempt's result, not the stale one's
      expect((await attempts(id)).filter((a) => a.outcome === "completed")).toHaveLength(1);
    });

    it("heartbeat extends only the live lease; a stale claim's heartbeat is refused", async () => {
      const t = await tenant();
      await put(t, { op: "heartbeat" });
      const [c] = await claimJobs(db, opts({ leaseSeconds: 60 }), 1);
      expect(await executeJob(db, opts({ leaseSeconds: 60 }, at(5)), c)).toBe("completed");
      const { id } = await put(t, { op: "ok" });
      const [x] = await claimJobs(db, opts({ leaseSeconds: 60 }, at(100)), 1);
      await claimJobs(db, opts({ leaseSeconds: 60 }, at(161)), 1); // recovered by someone else
      const res = await db.execute(sql`UPDATE background_jobs SET lease_expires_at = now() WHERE id = ${id}::uuid AND claim_token = ${x.claimToken}::uuid RETURNING 1`);
      expect(res.rows).toHaveLength(0); // old token no longer matches
    });

    it("workers claim ONLY types in their registry (a newer deployment's jobs are left alone)", async () => {
      const t = await tenant();
      const other = createJobRegistry([{ type: "future.type", version: 1, schema: z.object({}), handler: async () => undefined, maxAttempts: 3, timeoutMs: 1000, idempotency: "Test: no side effects at all." }]);
      const future = await enqueueJob(db, other, { tenantId: t, type: "future.type", payload: {}, idempotencyKey: "f" }, { now: T0 });
      expect(await claimJobs(db, opts(), 10)).toHaveLength(0);
      expect((await row(future.id)).status).toBe("pending");
      expect((await claimJobs(db, { registry: other, clock: () => T0 }, 10)).map((r) => r.id)).toEqual([future.id]);
    });

    it("a tenant-restricted worker never touches another tenant's jobs", async () => {
      const a = await tenant();
      const b = await tenant();
      const ja = await put(a, { op: "ok" });
      const jb = await put(b, { op: "ok" });
      expect((await claimJobs(db, opts({ tenantId: a }), 10)).map((r) => r.id)).toEqual([ja.id]);
      expect((await row(jb.id)).status).toBe("pending");
    });

    it("the handler receives ITS job's tenant and a stable operation id across retries", async () => {
      const a = await tenant();
      const b = await tenant();
      const ja = await put(a, { op: "transient_until", until: 2 });
      await put(b, { op: "ok" });
      await runJobPass(db, opts(), 10);
      await runJobPass(db, opts({}, at(120)), 10);
      const mine = h.executions.filter((e) => e.jobId === ja.id);
      expect(mine.map((e) => e.attempt)).toEqual([1, 2]);
      expect(new Set(h.executions.filter((e) => e.jobId === ja.id).map((e) => e.tenantId))).toEqual(new Set([a]));
    });
  });

  describe("failure handling", () => {
    it("transient failure retries with bounded backoff, never early, and then succeeds", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "transient_until", until: 3 });
      let r = await runJobPass(db, opts({ rng: () => 0.5 }), 5);
      expect(r).toMatchObject({ claimed: 1, retried: 1 });
      let j = await row(id);
      expect(j).toMatchObject({ status: "pending", attemptCount: 1, errorCode: "test_transient", claimToken: null });
      expect(j.runAt.getTime() - T0.getTime()).toBe(15_000); // base 15s * jitter(0.5 => 1.0)
      expect(await claimJobs(db, opts({}, at(14)), 5)).toHaveLength(0);
      r = await runJobPass(db, opts({ rng: () => 0.5 }, at(15)), 5);
      expect(r.retried).toBe(1);
      j = await row(id);
      expect(j.runAt.getTime() - at(15).getTime()).toBe(30_000);
      r = await runJobPass(db, opts({}, at(45)), 5);
      expect(r.completed).toBe(1);
      j = await row(id);
      expect(j).toMatchObject({ status: "completed", attemptCount: 3, errorCode: null, lastError: null });
      expect((await attempts(id)).map((a) => a.outcome)).toEqual(["retry", "retry", "completed"]);
    });

    it("a permanent failure terminates immediately", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "permanent" });
      expect(await runJobPass(db, opts(), 5)).toMatchObject({ failed: 1, retried: 0 });
      expect(await row(id)).toMatchObject({ status: "failed", attemptCount: 1, errorCode: "test_permanent", failedAt: T0 });
      expect(await claimJobs(db, opts({}, at(10_000)), 5)).toHaveLength(0);
    });

    it("max attempts is enforced: exactly N executions, then failed; no N+1", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "transient" }, { maxAttempts: 3 });
      let now = 0;
      for (let i = 0; i < 8; i++) { await runJobPass(db, opts({}, at(now)), 5); now += 2000; }
      expect(h.executions.filter((e) => e.jobId === id)).toHaveLength(3);
      expect(await row(id)).toMatchObject({ status: "failed", attemptCount: 3, errorCode: "test_transient" });
    });

    it("an unhandled exception is retried, and its message (which may hold customer data) is NOT stored or logged", async () => {
      const t = await tenant();
      const events: string[] = [];
      const tel: JobTelemetry = { emit: (e, f) => events.push(JSON.stringify({ e, ...f })) };
      const { id } = await put(t, { op: "unhandled" });
      await runJobPass(db, opts({ telemetry: tel }), 5);
      const j = await row(id);
      expect(j).toMatchObject({ status: "pending", errorCode: "unhandled_exception", lastError: "unhandled Error" });
      expect(JSON.stringify(j)).not.toContain("12425550100");
      expect(JSON.stringify(await attempts(id))).not.toContain("12425550100");
      expect(events.join("\n")).not.toContain("12425550100");
      expect(events.some((e) => e.includes('"retry_scheduled"'))).toBe(true);
    });

    it("a handler that exceeds its deadline is aborted and retried safely (REAL timer)", async () => {
      const t = await tenant();
      const fast = createTestHarness({ timeoutMs: 200 });
      const { id } = await enqueueJob(db, fast.registry, { tenantId: t, type: "test.scripted", payload: { op: "hang" }, idempotencyKey: "slow" }, { now: T0 });
      const started = Date.now();
      const r = await runJobPass(db, { registry: fast.registry, clock: () => T0 }, 5);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(r.retried).toBe(1);
      expect(await row(id)).toMatchObject({ status: "pending", errorCode: "handler_timeout" });
    });

    it("stored payloads at an unsupported version, or no longer valid, fail permanently (never executed)", async () => {
      const t = await tenant();
      const v2 = await put(t, { op: "ok" }, { key: "v2" });
      await db.update(backgroundJobs).set({ payloadVersion: 2 }).where(eq(backgroundJobs.id, v2.id));
      const bad = await put(t, { op: "ok" }, { key: "bad" });
      await db.update(backgroundJobs).set({ payload: { op: "rm -rf /" } }).where(eq(backgroundJobs.id, bad.id));
      await runJobPass(db, opts(), 10);
      expect(await row(v2.id)).toMatchObject({ status: "failed", errorCode: "unsupported_payload_version" });
      expect(await row(bad.id)).toMatchObject({ status: "failed", errorCode: "invalid_payload" });
      expect(h.executions).toHaveLength(0);
    });

    it("database check constraints hold: a running row must carry a lease; attempts/max are sane", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "ok" });
      await expect(db.execute(sql`UPDATE background_jobs SET status = 'running' WHERE id = ${id}::uuid`)).rejects.toThrow();
      await expect(db.execute(sql`UPDATE background_jobs SET max_attempts = 0 WHERE id = ${id}::uuid`)).rejects.toThrow();
      await expect(db.execute(sql`UPDATE background_jobs SET attempt_count = -1 WHERE id = ${id}::uuid`)).rejects.toThrow();
    });
  });

  describe("cancellation and manual requeue", () => {
    it("cancel prevents execution; a running/finished job cannot be cancelled; foreign tenant sees not_found", async () => {
      const a = await tenant();
      const b = await tenant();
      const { id } = await put(a, { op: "ok" });
      expect(await cancelJob(db, b, id)).toEqual({ ok: false, reason: "not_found" });
      expect((await row(id)).status).toBe("pending");
      expect(await cancelJob(db, a, id, {}, { now: T0 })).toEqual({ ok: true });
      expect(await claimJobs(db, opts({}, at(100)), 5)).toHaveLength(0);
      expect(await row(id)).toMatchObject({ status: "cancelled", cancelledAt: T0 });
      expect(await cancelJob(db, a, id)).toEqual({ ok: false, reason: "not_cancellable" });
      const running = await put(a, { op: "ok" });
      await claimJobs(db, opts(), 1);
      expect(await cancelJob(db, a, running.id)).toEqual({ ok: false, reason: "not_cancellable" });
      expect(await cancelJob(db, a, randomUUID())).toEqual({ ok: false, reason: "not_found" });
      expect((await db.select().from(auditEvents).where(eq(auditEvents.eventType, "job.cancelled")))).toHaveLength(1);
    });

    it("cancel racing a claim has exactly one winner", async () => {
      const t = await tenant();
      for (let i = 0; i < 15; i++) {
        const { id } = await put(t, { op: "ok" }, { key: `cr-${i}` });
        const [c, claimed] = await Promise.all([cancelJob(db, t, id), claimJobs(db, opts(), 1)]);
        const status = (await row(id)).status;
        if (c.ok) { expect(status).toBe("cancelled"); expect(claimed).toHaveLength(0); }
        else { expect(status).toBe("running"); expect(claimed).toHaveLength(1); }
        await db.delete(backgroundJobAttempts).where(eq(backgroundJobAttempts.jobId, id));
        await db.delete(backgroundJobs).where(eq(backgroundJobs.id, id));
      }
    });

    it("requeue: only FAILED jobs, same identity, fresh budget, history + audit preserved, concurrency-safe, tenant-scoped", async () => {
      const a = await tenant();
      const b = await tenant();
      const { id } = await put(a, { op: "permanent" }, { key: "rq" });
      await runJobPass(db, opts(), 5);
      const before = await row(id);
      expect(before.status).toBe("failed");
      const histBefore = (await attempts(id)).length;

      expect(await requeueJob(db, b, id)).toEqual({ ok: false, reason: "not_found" });
      expect((await row(id)).status).toBe("failed");
      const results = await Promise.all(Array.from({ length: 6 }, () => requeueJob(db, a, id, { staffUserId: undefined }, { now: at(500) })));
      expect(results.filter((r) => r.ok)).toHaveLength(1); // exactly one winner
      const after = await row(id);
      expect(after).toMatchObject({ id, idempotencyKey: before.idempotencyKey, status: "pending", attemptCount: 0, requeueCount: 1, failedAt: null, claimToken: null });
      expect(after.runAt).toEqual(at(500));
      expect(after.errorCode).toBe("test_permanent"); // last failure stays visible until it succeeds
      expect((await attempts(id)).length).toBe(histBefore); // history untouched
      expect(await db.select().from(backgroundJobs).where(eq(backgroundJobs.idempotencyKey, "rq"))).toHaveLength(1); // no duplicate logical job
      expect((await db.select().from(auditEvents).where(eq(auditEvents.eventType, "job.requeued")))).toHaveLength(1);
      expect(await requeueJob(db, a, id)).toEqual({ ok: false, reason: "not_failed" }); // pending now
      for (const status of ["completed", "cancelled", "running"] as const) {
        const j = await put(a, { op: "ok" }, { key: `s-${status}` });
        if (status === "completed") { await runJobPass(db, opts({}, at(600)), 5); }
        else if (status === "cancelled") await cancelJob(db, a, j.id);
        else await claimJobs(db, opts({}, at(700)), 1);
        expect(await requeueJob(db, a, j.id)).toEqual({ ok: false, reason: "not_failed" });
      }
    });
  });

  describe("tenant isolation of inspection (no cross-tenant exposure)", () => {
    it("list/get/counts never reveal another tenant's jobs or payloads; lists carry no payload at all", async () => {
      const a = await tenant();
      const b = await tenant();
      const ja = await put(a, { op: "ok", note: "tenant-A-secret" });
      await put(b, { op: "ok", note: "tenant-B-secret" });
      const listA = await listJobs(db, a);
      expect(listA.map((j) => j.id)).toEqual([ja.id]);
      expect(JSON.stringify(listA)).not.toContain("secret");
      expect(await getJob(db, b, ja.id)).toBeNull();
      expect(await getJob(db, a, randomUUID())).toBeNull();
      expect((await getJob(db, a, ja.id))!.payload).toEqual({ op: "ok", note: "tenant-A-secret" });
      expect(await jobCounts(db, a)).toMatchObject({ pending: 1 });
      expect(await jobCounts(db, randomUUID())).toMatchObject({ pending: 0 });
    });

    it("views: pending / scheduled / retrying / running / failed / completed / cancelled", async () => {
      const t = await tenant();
      const due = await put(t, { op: "ok" }, { key: "due" });
      const sched = await put(t, { op: "ok" }, { key: "sched", runAt: at(3600) });
      const retry = await put(t, { op: "transient" }, { key: "retry" });
      const fail = await put(t, { op: "permanent" }, { key: "fail" });
      const done = await put(t, { op: "ok" }, { key: "done" });
      const canc = await put(t, { op: "ok" }, { key: "canc" });
      await cancelJob(db, t, canc.id);
      await runJobPass(db, opts({}, T0), 10); // runs due, retry, fail, done (not sched, not cancelled)
      const ids = async (view: Parameters<typeof listJobs>[2] extends infer O ? (O extends { view?: infer V } ? V : never) : never) => (await listJobs(db, t, { view, now: T0 })).map((j) => j.id).sort();
      expect(await ids("scheduled")).toEqual([sched.id]);
      expect(await ids("retrying")).toEqual([retry.id]);
      expect(await ids("failed")).toEqual([fail.id]);
      expect(await ids("completed")).toEqual([due.id, done.id].sort());
      expect(await ids("cancelled")).toEqual([canc.id]);
      expect(await ids("pending")).toEqual([]);
      const run = await put(t, { op: "ok" }, { key: "run" });
      await claimJobs(db, opts({ workerId: "r" }), 1);
      expect(await ids("running")).toEqual([run.id]);
      const detail = await getJob(db, t, retry.id);
      expect(detail!.history.map((h2) => h2.outcome)).toEqual(["retry"]);
    });
  });

  describe("worker lifecycle (REAL timers)", () => {
    it("graceful stop: waits for in-flight work, then never claims again", async () => {
      const t = await tenant();
      const first = await put(t, { op: "sleep", ms: 400 }, { key: "s1" });
      const w = startJobWorker(db, { registry: h.registry, pollIntervalMs: 250, concurrency: 1, drainTimeoutMs: 5000 });
      const wait = async (p: () => Promise<boolean>, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p()) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error("timeout"); };
      await wait(async () => (await row(first.id)).status === "running");
      await w.stop(); // must wait for the running job
      expect((await row(first.id)).status).toBe("completed");
      const later = await put(t, { op: "ok" }, { key: "after-stop" });
      await new Promise((r) => setTimeout(r, 700));
      expect((await row(later.id)).status).toBe("pending"); // a stopped worker claims nothing
      expect(w.inFlight()).toBe(0);
    });

    it("a stop that outlasts the drain deadline aborts the handler and leaves the job to lease recovery", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "hang" });
      const w = startJobWorker(db, { registry: h.registry, pollIntervalMs: 250, concurrency: 1, drainTimeoutMs: 300 });
      const end = Date.now() + 5000;
      while ((await row(id)).status !== "running" && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
      await w.stop();
      const j = await row(id);
      expect(["running", "pending"]).toContain(j.status); // never completed, never lost
      expect(j.status === "running" ? j.leaseExpiresAt !== null : true).toBe(true);
    });

    it("backpressure: never more than `concurrency` handlers at once", async () => {
      const t = await tenant();
      let live = 0, peak = 0;
      const counting: JobDefinition = {
        type: "test.counting", version: 1, schema: z.object({}), maxAttempts: 3, timeoutMs: 2000, idempotency: "Test: counts only, repeatable.",
        handler: async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 120)); live--; },
      };
      const reg = createJobRegistry([counting]);
      for (let i = 0; i < 8; i++) await enqueueJob(db, reg, { tenantId: t, type: "test.counting", payload: {}, idempotencyKey: `bp-${i}` }, { now: T0 });
      const w = startJobWorker(db, { registry: reg, pollIntervalMs: 250, concurrency: 2 });
      const end = Date.now() + 8000;
      while ((await jobCounts(db, t)).completed < 8 && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
      await w.stop();
      expect((await jobCounts(db, t)).completed).toBe(8);
      expect(peak).toBeLessThanOrEqual(2);
      expect(peak).toBeGreaterThanOrEqual(2);
    });

    it("a lease shorter than a handler's deadline is refused at startup", () => {
      expect(() => startJobWorker(db, { registry: h.registry, pollIntervalMs: 250, concurrency: 1, leaseSeconds: 1 })).toThrow(/lease/);
    });

    it("database outage: the worker survives dropped connections, loses nothing, and finishes the jobs afterwards", async () => {
      const t = await tenant();
      const events: string[] = [];
      const own = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test", max: 3 });
      own.on("error", () => {});
      const wdb = drizzle(own, { schema });
      const ids = await Promise.all(Array.from({ length: 4 }, (_, i) => put(t, { op: "sleep", ms: 150 }, { key: `o-${i}` })));
      const w = startJobWorker(wdb, { registry: h.registry, pollIntervalMs: 250, concurrency: 2, telemetry: { emit: (e) => events.push(e) } });
      await new Promise((r) => setTimeout(r, 120));
      await pool.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and application_name = ''");
      const end = Date.now() + 25_000;
      while ((await jobCounts(db, t)).completed < 4 && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
      await w.stop();
      await own.end();
      // jobs may have been executed more than once (at-least-once) — but none were lost and none are stuck
      expect((await jobCounts(db, t)).completed).toBe(4);
      for (const { id } of ids) expect((await row(id)).status).toBe("completed");
    }, 40_000);

    it("enqueue against an unreachable database FAILS LOUDLY (never a silent drop)", async () => {
      const t = await tenant();
      const dead = new Pool({ connectionString: "postgres://localhost:1/none", connectionTimeoutMillis: 300 });
      dead.on("error", () => {});
      await expect(put(t, { op: "ok" }, {}, drizzle(dead, { schema }) as never)).rejects.toThrow();
      await dead.end();
    });
  });

  describe("business-state safety contracts", () => {
    it("conversationAllowsAutomation: only an OPEN, AI-owned conversation; tenant-scoped", async () => {
      const f = await seedConversation(db);
      const other = await seedConversation(db);
      expect(await conversationAllowsAutomation(db, f.tenantId, f.conversationId)).toEqual({ ok: true });
      for (const [status, reason] of [["human_pending", "conversation_human_owned"], ["staff_owned", "conversation_human_owned"], ["resolved", "conversation_closed"]] as const) {
        await db.update(conversations).set({ status }).where(eq(conversations.id, f.conversationId));
        expect(await conversationAllowsAutomation(db, f.tenantId, f.conversationId)).toEqual({ ok: false, reason });
      }
      expect(await conversationAllowsAutomation(db, other.tenantId, f.conversationId)).toEqual({ ok: false, reason: "conversation_not_found" });
    });

    it("appointmentIsActive / customerMayBeContacted", async () => {
      const fx = await seedFixtures(db);
      const [appt] = await db.insert(schema.appointments).values({
        tenantId: fx.tenantId, customerId: fx.customerAId, serviceId: fx.serviceId, staffUserId: fx.staffAId,
        startsAt: at(86_400), endsAt: at(86_400 + 1800),
      }).returning();
      expect(await appointmentIsActive(db, fx.tenantId, appt.id)).toEqual({ ok: true });
      await db.update(schema.appointments).set({ status: "cancelled" }).where(eq(schema.appointments.id, appt.id));
      expect(await appointmentIsActive(db, fx.tenantId, appt.id)).toEqual({ ok: false, reason: "appointment_cancelled" });
      expect(await appointmentIsActive(db, randomUUID(), appt.id)).toEqual({ ok: false, reason: "appointment_not_found" });
      expect(await customerMayBeContacted(db, fx.tenantId, fx.customerAId, "transactional")).toEqual({ ok: true });
      expect(await customerMayBeContacted(db, fx.tenantId, fx.customerAId, "promotional")).toEqual({ ok: false, reason: "no_promotional_consent" });
      await db.update(schema.customers).set({ consentStatus: "opted_in" }).where(eq(schema.customers.id, fx.customerAId));
      expect(await customerMayBeContacted(db, fx.tenantId, fx.customerAId, "promotional")).toEqual({ ok: true });
      await db.update(schema.customers).set({ consentStatus: "opted_out" }).where(eq(schema.customers.id, fx.customerAId));
      expect(await customerMayBeContacted(db, fx.tenantId, fx.customerAId, "transactional")).toEqual({ ok: false, reason: "customer_opted_out" });
    });

    /** A realistic FUTURE handler, test-only: guard, then route any customer message through the existing OUTBOX. */
    const notifyDef = (): JobDefinition<{ conversationId: string; customerId: string }> => ({
      type: "test.notify", version: 1,
      schema: z.object({ conversationId: z.string().uuid(), customerId: z.string().uuid() }).strict(),
      maxAttempts: 3, timeoutMs: 2000, idempotency: "Outbox idempotency key job:<id> makes a re-run enqueue nothing new.",
      async handler(ctx, p) {
        const ok = await conversationAllowsAutomation(ctx.db, ctx.tenantId, p.conversationId);
        if (!ok.ok) return { skipped: ok.reason };
        const consent = await customerMayBeContacted(ctx.db, ctx.tenantId, p.customerId, "transactional");
        if (!consent.ok) return { skipped: consent.reason };
        const [m] = await ctx.db.insert(messages).values({ tenantId: ctx.tenantId, conversationId: p.conversationId, direction: "outbound", senderType: "ai", content: "Reminder" }).returning();
        await enqueueOutboundMessage(ctx.db, { tenantId: ctx.tenantId, conversationId: p.conversationId, customerId: p.customerId, messageId: m.id, body: "Reminder", idempotencyKey: ctx.operationId });
        return { result: { queued: true } };
      },
    });

    it("a human-owned / closed / opted-out customer is never messaged; an eligible one gets exactly ONE outbox message via the outbox (never Meta)", async () => {
      const reg = createJobRegistry([notifyDef() as JobDefinition]);
      const mk = async (status: "ai_active" | "human_pending" | "staff_owned" | "resolved", consent?: "opted_out") => {
        const f = await seedConversation(db);
        await db.update(conversations).set({ status }).where(eq(conversations.id, f.conversationId));
        if (consent) await db.update(schema.customers).set({ consentStatus: consent }).where(eq(schema.customers.id, f.customerId));
        const j = await enqueueJob(db, reg, { tenantId: f.tenantId, type: "test.notify", payload: { conversationId: f.conversationId, customerId: f.customerId }, idempotencyKey: `n-${randomUUID()}` }, { now: T0 });
        return { f, j };
      };
      const ok = await mk("ai_active");
      const blocked = [await mk("staff_owned"), await mk("human_pending"), await mk("resolved"), await mk("ai_active", "opted_out")];
      await runJobPass(db, { registry: reg, clock: () => T0 }, 20);
      expect(await db.select().from(outboxMessages).where(eq(outboxMessages.conversationId, ok.f.conversationId))).toHaveLength(1);
      for (const b of blocked) {
        expect(await db.select().from(outboxMessages).where(eq(outboxMessages.conversationId, b.f.conversationId))).toHaveLength(0);
        expect((await row(b.j.id)).status).toBe("completed");
        expect((await row(b.j.id)).result).toMatchObject({ skipped: expect.any(String) });
      }
      // a manual re-run of the SAME job (e.g. lease recovery) cannot send a second message
      await db.update(backgroundJobs).set({ status: "pending", attemptCount: 0, completedAt: null }).where(eq(backgroundJobs.id, ok.j.id));
      await runJobPass(db, { registry: reg, clock: () => at(10) }, 20);
      expect(await db.select().from(outboxMessages).where(eq(outboxMessages.conversationId, ok.f.conversationId))).toHaveLength(1);
    });

    it("takeover AFTER scheduling but BEFORE execution: the job skips (human ownership stays authoritative)", async () => {
      const reg = createJobRegistry([notifyDef() as JobDefinition]);
      const f = await seedConversation(db);
      const j = await enqueueJob(db, reg, { tenantId: f.tenantId, type: "test.notify", payload: { conversationId: f.conversationId, customerId: f.customerId }, idempotencyKey: "later", runAt: at(3600) }, { now: T0 });
      await db.update(conversations).set({ status: "staff_owned" }).where(eq(conversations.id, f.conversationId));
      await runJobPass(db, { registry: reg, clock: () => at(3601) }, 5);
      expect((await row(j.id)).result).toEqual({ skipped: "conversation_human_owned" });
      expect(await db.select().from(outboxMessages)).toHaveLength(0);
    });

    it("a requeued job re-runs the same guards (requeue never bypasses state checks)", async () => {
      const guardOnly: JobDefinition<{ conversationId: string }> = {
        ...notifyDef(), maxAttempts: 1,
        handler: async (ctx, p) => { const ok = await conversationAllowsAutomation(ctx.db, ctx.tenantId, p.conversationId); if (!ok.ok) return { skipped: ok.reason }; throw new Error("boom"); },
      } as JobDefinition<{ conversationId: string }>;
      const reg = createJobRegistry([guardOnly as JobDefinition]);
      const f = await seedConversation(db);
      const j = await enqueueJob(db, reg, { tenantId: f.tenantId, type: "test.notify", payload: { conversationId: f.conversationId, customerId: f.customerId }, idempotencyKey: "rq-guard" }, { now: T0 });
      await runJobPass(db, { registry: reg, clock: () => T0 }, 5);
      expect((await row(j.id)).status).toBe("failed");
      await db.update(conversations).set({ status: "staff_owned" }).where(eq(conversations.id, f.conversationId));
      await requeueJob(db, f.tenantId, j.id, {}, { now: at(10) });
      await runJobPass(db, { registry: reg, clock: () => at(11) }, 5);
      expect(await row(j.id)).toMatchObject({ status: "completed", result: { skipped: "conversation_human_owned" } });
    });

    it("a stale job cannot resurrect a memory that was deleted after it was scheduled", async () => {
      const f = await seedConversation(db);
      const scope = { tenantId: f.tenantId, customerId: f.customerId };
      const resurrect: JobDefinition<{ customerId: string; since: string }> = {
        type: "test.resurrect", version: 1, schema: z.object({ customerId: z.string().uuid(), since: z.string() }).strict(),
        maxAttempts: 2, timeoutMs: 2000, idempotency: "Test: guarded write of one memory slot.",
        async handler(ctx, p) {
          const g = await memorySlotNotRemovedSince(ctx.db, { tenantId: ctx.tenantId, customerId: p.customerId }, "preferred_name", "name", new Date(p.since));
          if (!g.ok) return { skipped: g.reason };
          await applyCandidate(ctx.db, { tenantId: ctx.tenantId, customerId: p.customerId }, { kind: "preferred_name", slot: "name", value: "Alicia", source: "system_derived", provenance: "explicit" }, { now: ctx.now() });
          return { result: { wrote: true } };
        },
      };
      const reg = createJobRegistry([resurrect as JobDefinition]);
      const first = (await applyCandidate(db, scope, { kind: "preferred_name", slot: "name", value: "Alicia", source: "customer_stated", provenance: "explicit" }, { now: at(-100) })) as { id: string };
      await enqueueJob(db, reg, { tenantId: f.tenantId, type: "test.resurrect", payload: { customerId: f.customerId, since: at(-50).toISOString() }, idempotencyKey: "res", runAt: at(60) }, { now: at(-50) });
      await deleteMemory(db, scope, first.id, {}, at(0)); // customer asked to forget, AFTER the job was scheduled
      await runJobPass(db, { registry: reg, clock: () => at(61) }, 5);
      expect((await db.select().from(customerMemories)).filter((m) => m.status === "active")).toHaveLength(0);
      expect((await db.select().from(backgroundJobs))[0].result).toEqual({ skipped: "memory_removed_since_scheduled" });
    });
  });

  describe("the real maintenance job: memory.expire_sweep", () => {
    it("retires only the job's own tenant's expired memories; unexpired and other tenants untouched; repeat is a no-op; independent of MEMORY_ENABLED", async () => {
      const a = await seedConversation(db);
      const b = await seedConversation(db);
      const mk = (f: { tenantId: string; customerId: string }, slot: string, expires: Date | null) =>
        db.insert(customerMemories).values({ tenantId: f.tenantId, customerId: f.customerId, kind: "service_interest", slot: `service:${slot}`, value: slot, source: "customer_stated", expiresAt: expires });
      await mk(a, "old1", at(-10)); await mk(a, "old2", at(-20)); await mk(a, "fresh", at(1000)); await mk(a, "forever", null); await mk(b, "oldB", at(-10));
      const reg = createDefaultJobRegistry();
      const j = await enqueueJob(db, reg, { tenantId: a.tenantId, type: MEMORY_EXPIRE_SWEEP, payload: {}, idempotencyKey: "s1" }, { now: T0 });
      const prev = process.env.MEMORY_ENABLED;
      process.env.MEMORY_ENABLED = "false"; // the job engine must not care
      try { await runJobPass(db, { registry: reg, clock: () => T0 }, 5); } finally { if (prev === undefined) delete process.env.MEMORY_ENABLED; else process.env.MEMORY_ENABLED = prev; }
      expect((await row(j.id)).result).toEqual({ swept: 2 });
      const all = await db.select().from(customerMemories);
      const st = (slot: string) => all.find((m) => m.slot === `service:${slot}`)!;
      expect([st("old1").status, st("old2").status, st("fresh").status, st("forever").status, st("oldB").status]).toEqual(["deleted", "deleted", "active", "active", "active"]);
      expect(st("old1")).toMatchObject({ value: "", statusReason: "expired" });
      const again = await enqueueJob(db, reg, { tenantId: a.tenantId, type: MEMORY_EXPIRE_SWEEP, payload: {}, idempotencyKey: "s2" }, { now: T0 });
      await runJobPass(db, { registry: reg, clock: () => T0 }, 5);
      expect((await row(again.id)).result).toEqual({ swept: 0 });
    });
  });

  describe("feature flag isolation", () => {
    it("with JOBS_ENABLED unset, `npm run worker` refuses to start (exit 1), touching nothing", () => {
      const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test", NODE_ENV: "test" };
      delete env.JOBS_ENABLED;
      const r = spawnSync(process.execPath, ["--import", "tsx", join(process.cwd(), "src", "worker.ts")], {
        env,
        encoding: "utf8", timeout: 30_000,
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("JOBS_ENABLED is not true");
    });

    it("server.ts starts the job worker only inside `if (env.JOBS_ENABLED)`, and the outbox poller unconditionally as before", async () => {
      const { readFileSync } = await import("node:fs");
      const src = readFileSync(join(process.cwd(), "src", "server.ts"), "utf8");
      expect(src).toMatch(/startOutboxPoller\(getDb\(\)/);
      const starts = src.match(/startJobWorker\(/g) ?? [];
      expect(starts).toHaveLength(1);
      expect(src.slice(0, src.indexOf("startJobWorker("))).toMatch(/if \(env\.JOBS_ENABLED\) \{\s*jobWorker = $/);
    });

    it("jobs enqueued while no worker runs simply wait: nothing executes, nothing changes (disabled = inert)", async () => {
      const t = await tenant();
      const { id } = await put(t, { op: "ok" });
      await new Promise((r) => setTimeout(r, 300));
      expect(await row(id)).toMatchObject({ status: "pending", attemptCount: 0 });
      expect(h.executions).toHaveLength(0);
    });

    it("running the job engine never touches the WhatsApp outbox", async () => {
      const f = await seedConversation(db);
      const [m] = await db.insert(messages).values({ tenantId: f.tenantId, conversationId: f.conversationId, direction: "outbound", senderType: "ai", content: "hi" }).returning();
      await enqueueOutboundMessage(db, { tenantId: f.tenantId, conversationId: f.conversationId, customerId: f.customerId, messageId: m.id, body: "hi", idempotencyKey: "pre" });
      const before = JSON.stringify(await db.select().from(outboxMessages));
      for (let i = 0; i < 5; i++) await put(f.tenantId, { op: i % 2 ? "ok" : "permanent" }, { key: `x-${i}` });
      await runJobPass(db, opts(), 10);
      expect(JSON.stringify(await db.select().from(outboxMessages))).toBe(before);
    });
  });
});
