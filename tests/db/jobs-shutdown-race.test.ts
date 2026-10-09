import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { backgroundJobAttempts, backgroundJobs } from "../../src/db/schema";
import { enqueueJob } from "../../src/jobs/enqueue";
import { startJobWorker } from "../../src/jobs/worker";
import { createTestHarness } from "../jobs/test-handlers";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { seedConversation } from "./outbox-helpers";

/**
 * Codex review of PR #2, finding 2: stop() returned while a CLAIM was still pending, and the
 * claim then started a handler after shutdown. REAL timers; the claim is held open
 * deterministically by wrapping db.execute (the real claim runs, its RESULT is withheld).
 * REQUIRES a real Postgres.
 */
describe("job worker shutdown vs an in-flight claim (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  pool.on("error", () => {});
  beforeEach(async () => resetTestData(db));
  afterAll(async () => { await pool.end(); });

  const flatten = (q: unknown): string => {
    const seen = new Set<unknown>();
    const walk = (x: unknown): string => {
      if (!x || typeof x !== "object" || seen.has(x)) return "";
      seen.add(x);
      const o = x as { value?: unknown; queryChunks?: unknown[] };
      if (Array.isArray(o.value)) return o.value.join("");
      return (o.queryChunks ?? []).map(walk).join("");
    };
    return walk(q);
  };

  /** Lets the claim statement execute (row becomes `running` in Postgres) but withholds its result. */
  function gateClaim() {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const claimExecuted = new Promise<void>((r) => (entered = r));
    const gated = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== "execute") return Reflect.get(target, prop, receiver);
        return async (q: unknown) => {
          const result = await (target.execute as (x: never) => Promise<unknown>)(q as never);
          if (flatten(q).includes("SKIP LOCKED")) { entered(); await gate; }
          return result;
        };
      },
    });
    return { gated: gated as typeof db, release, claimExecuted };
  }

  it("a handler NEVER starts after stop(); stop() waits for the pending claim; the claim is handed back untouched", async () => {
    const h = createTestHarness();
    const t = (await seedConversation(db)).tenantId;
    const { id } = await enqueueJob(db, h.registry, { tenantId: t, type: "test.scripted", payload: { op: "ok" }, idempotencyKey: "race" });
    const { gated, release, claimExecuted } = gateClaim();

    const w = startJobWorker(gated, { registry: h.registry, pollIntervalMs: 60_000, concurrency: 2, drainTimeoutMs: 5000 });
    await claimExecuted;
    expect((await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0].status).toBe("running"); // claimed in Postgres, result not yet returned

    let stopped = false;
    const stopping = w.stop().then(() => { stopped = true; });
    await new Promise((r) => setTimeout(r, 200));
    expect(stopped).toBe(false); // stop() must NOT return while a claim is pending
    release();
    await stopping;

    await new Promise((r) => setTimeout(r, 300)); // give any (buggy) late handler a chance to start
    expect(h.executions).toHaveLength(0); // no handler ran after shutdown
    const row = (await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0];
    expect(row).toMatchObject({ status: "pending", attemptCount: 0, claimToken: null, leaseExpiresAt: null, leaseOwner: null });
    expect(await db.select().from(backgroundJobAttempts).where(eq(backgroundJobAttempts.jobId, id))).toHaveLength(0);
    expect(w.inFlight()).toBe(0);
  });

  it("the released job is immediately claimable by another worker (not stranded until lease expiry)", async () => {
    const h = createTestHarness();
    const t = (await seedConversation(db)).tenantId;
    const { id } = await enqueueJob(db, h.registry, { tenantId: t, type: "test.scripted", payload: { op: "ok" }, idempotencyKey: "reclaim" });
    const { gated, release, claimExecuted } = gateClaim();
    const w = startJobWorker(gated, { registry: h.registry, pollIntervalMs: 60_000, concurrency: 1 });
    await claimExecuted;
    const stopping = w.stop();
    release();
    await stopping;
    const w2 = startJobWorker(db, { registry: h.registry, pollIntervalMs: 250, concurrency: 1 });
    const end = Date.now() + 5000;
    while ((await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0].status !== "completed" && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
    await w2.stop();
    expect((await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0]).toMatchObject({ status: "completed", attemptCount: 1 });
    expect(h.executions).toHaveLength(1);
  });
});
