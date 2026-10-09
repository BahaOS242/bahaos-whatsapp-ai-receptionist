import { spawn } from "node:child_process";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { backgroundJobs } from "../../src/db/schema";
import { enqueueJob } from "../../src/jobs/enqueue";
import { startJobWorker } from "../../src/jobs/worker";
import { createTestHarness } from "../jobs/test-handlers";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { seedConversation } from "./outbox-helpers";

/**
 * Codex review of PR #2 (621d711), P1: stop() awaited the in-progress tick BEFORE starting its timeout, so a
 * stalled database poll/claim made shutdown hang forever. Here the stall is REAL: another connection holds
 * ACCESS EXCLUSIVE on background_jobs, so the worker's claim statements block inside Postgres.
 * REAL timers, real locks, real processes. REQUIRES a real Postgres.
 */
const URL_ = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test";

describe("bounded shutdown while the database stalls (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  pool.on("error", () => {});
  const locker = new Pool({ connectionString: URL_, max: 1 });
  locker.on("error", () => {});
  let lockConn: PoolClient | null = null;

  const lockTable = async () => { lockConn = await locker.connect(); await lockConn.query("BEGIN"); await lockConn.query("LOCK TABLE background_jobs IN ACCESS EXCLUSIVE MODE"); };
  const unlockTable = async () => { if (lockConn) { await lockConn.query("COMMIT").catch(() => undefined); lockConn.release(); lockConn = null; } };

  beforeEach(async () => resetTestData(db));
  afterEach(async () => unlockTable());
  afterAll(async () => { await unlockTable(); await locker.end(); await resetTestData(db); await pool.end(); });
  const row = async (id: string) => (await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("stop() RETURNS within its bound while a claim is blocked on a database lock; nothing executes afterwards; the job stays recoverable", async () => {
    const h = createTestHarness();
    const t = (await seedConversation(db)).tenantId;
    const { id } = await enqueueJob(db, h.registry, { tenantId: t, type: "test.scripted", payload: { op: "ok" }, idempotencyKey: "lock-1" });

    await lockTable(); // every claim statement now blocks inside Postgres
    const w = startJobWorker(db, { registry: h.registry, pollIntervalMs: 60_000, concurrency: 2, drainTimeoutMs: 600 });
    await sleep(500); // the first tick is now stuck on the lock

    const started = Date.now();
    await w.stop();
    const took = Date.now() - started;
    expect(took).toBeLessThan(4000); // bounded (drain 600ms + grace) — it used to never return
    expect(took).toBeGreaterThanOrEqual(500); // and it really did wait for its deadline rather than skipping the wait

    await unlockTable(); // the stalled statements now complete in the background
    await sleep(1200); // a (buggy) late claim/handler would show up here
    expect(h.executions).toHaveLength(0); // no execution after stop
    expect(await row(id)).toMatchObject({ status: "pending", attemptCount: 0, claimToken: null }); // the late claim never ran at all

    const w2 = startJobWorker(db, { registry: h.registry, pollIntervalMs: 250, concurrency: 1 }); // and it is still recoverable
    const end = Date.now() + 8000;
    while ((await row(id)).status !== "completed" && Date.now() < end) await sleep(25);
    await w2.stop();
    expect(await row(id)).toMatchObject({ status: "completed", attemptCount: 1 });
  }, 40_000);

  it("a claim abandoned at the deadline that DID commit (row left running) is recovered after its lease expires", async () => {
    const h = createTestHarness();
    const t = (await seedConversation(db)).tenantId;
    const { id } = await enqueueJob(db, h.registry, { tenantId: t, type: "test.scripted", payload: { op: "ok" }, idempotencyKey: "abandoned" });
    // exactly the state an abandoned-but-committed claim leaves behind: running, owned by a worker that is gone
    await db.execute(sql`UPDATE background_jobs SET status='running', attempt_count=1, claim_token=gen_random_uuid(), lease_owner='gone', lease_expires_at = now() + interval '1 second' WHERE id = ${id}::uuid`);
    const w = startJobWorker(db, { registry: h.registry, pollIntervalMs: 250, concurrency: 1 });
    const end = Date.now() + 10_000;
    while ((await row(id)).status !== "completed" && Date.now() < end) await sleep(50);
    await w.stop();
    expect(await row(id)).toMatchObject({ status: "completed", attemptCount: 2 });
  }, 30_000);

  it("the REAL standalone worker exits promptly on SIGTERM (code 0) while its poll is blocked on a database lock", async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", DATABASE_URL: URL_, JOBS_ENABLED: "true", JOBS_POLL_INTERVAL_MS: "250", JOBS_SHUTDOWN_TIMEOUT_MS: "1000" };
    const cp = spawn(process.execPath, ["--import", "tsx", join(process.cwd(), "src", "worker.ts")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    cp.stdout.on("data", (d: Buffer) => (out += d.toString()));
    const exited = new Promise<{ code: number | null; at: number }>((r) => cp.on("exit", (code) => r({ code, at: Date.now() })));
    try {
      const end = Date.now() + 20_000;
      while (!out.includes('"worker_started"') && Date.now() < end) await sleep(50);
      expect(out).toContain('"worker_started"');
      await lockTable();
      await sleep(1000); // the worker's polls are now stuck on the lock
      const sent = Date.now();
      cp.kill("SIGTERM");
      const { code, at } = await Promise.race([exited, sleep(15_000).then(() => { throw new Error("worker did not exit within 15s of SIGTERM (shutdown hung)"); })]);
      expect(code).toBe(0);
      expect(at - sent).toBeLessThan(8000); // JOBS_SHUTDOWN_TIMEOUT_MS=1000 + grace, not "forever"
      expect(out).toContain('"worker_stopped"');
    } finally {
      cp.kill("SIGKILL");
      await unlockTable();
    }
  }, 60_000);
});
