import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { backgroundJobAttempts, backgroundJobs } from "../../src/db/schema";
import { enqueueJob } from "../../src/jobs/enqueue";
import { createTestHarness } from "../jobs/test-handlers";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { seedConversation } from "./outbox-helpers";

/**
 * LANE: REAL multi-process concurrency, crash and shutdown for the job engine: separate OS
 * processes (own pool and event loop each) against ONE Postgres. REAL timers and real
 * SIGKILL/SIGTERM — leases here are seconds, not minutes. REQUIRES a real Postgres.
 */
const CHILD = join(__dirname, "fixtures", "jobs-child.ts");
const DB_URL = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test";
interface Line { proc: string; pid: number; type: string; [k: string]: unknown }

function launch(args: Record<string, unknown>) {
  const cp: ChildProcess = spawn(process.execPath, ["--import", "tsx", CHILD, JSON.stringify(args)], { env: { ...process.env, TEST_DATABASE_URL: DB_URL }, stdio: ["ignore", "pipe", "pipe"] });
  const lines: Line[] = [];
  let buf = "", stderr = "";
  cp.stdout!.on("data", (d: Buffer) => { buf += d.toString(); let i; while ((i = buf.indexOf("\n")) >= 0) { const t = buf.slice(0, i); buf = buf.slice(i + 1); if (t.trim()) lines.push(JSON.parse(t) as Line); } });
  cp.stderr!.on("data", (d: Buffer) => (stderr += d.toString()));
  const exit = new Promise<number | null>((r) => cp.on("exit", (c) => r(c)));
  return {
    lines, exit, kill: (sig: NodeJS.Signals = "SIGKILL") => cp.kill(sig),
    async waitFor(type: string, ms = 30_000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const hit = lines.find((l) => l.type === type); if (hit) return hit;
        const err = lines.find((l) => l.type === "error"); if (err) throw new Error(`child error: ${err.message} ${stderr}`);
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`never saw "${type}" (stderr: ${stderr.slice(0, 300)})`);
    },
  };
}

describe("Background jobs — multi-process (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  pool.on("error", () => {});
  const h = createTestHarness();
  beforeEach(async () => resetTestData(db));
  afterAll(async () => { await resetTestData(db); await pool.end(); });

  const seed = async (n: number, payload: Record<string, unknown>) => {
    const t = (await seedConversation(db)).tenantId;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) ids.push((await enqueueJob(db, h.registry, { tenantId: t, type: "test.scripted", payload, idempotencyKey: `mp-${i}` })).id);
    return { t, ids };
  };
  const rows = async () => db.select().from(backgroundJobs);

  it("4 processes drain 80 jobs: every job executes EXACTLY once, work is genuinely shared", async () => {
    const { ids } = await seed(80, { op: "sleep", ms: 20 });
    const kids = Array.from({ length: 4 }, (_, i) => launch({ mode: "pass-until-idle", proc: `p${i}`, concurrency: 4 }));
    await Promise.all(kids.map((k) => k.waitFor("done", 90_000)));
    await Promise.all(kids.map((k) => k.exit));
    const starts = kids.flatMap((k) => k.lines.filter((l) => l.type === "exec-start"));
    const perJob = new Map<string, number>();
    for (const s of starts) perJob.set(String(s.jobId), (perJob.get(String(s.jobId)) ?? 0) + 1);
    expect(perJob.size).toBe(80);
    expect([...perJob.values()].every((n) => n === 1)).toBe(true);
    expect(new Set(starts.map((s) => s.pid)).size).toBeGreaterThanOrEqual(2);
    const all = await rows();
    expect(all.every((r) => r.status === "completed" && r.attemptCount === 1)).toBe(true);
    expect(new Set(all.map((r) => r.id))).toEqual(new Set(ids));
  }, 120_000);

  it("a worker that crashes right after claiming strands nothing: its jobs are recovered after lease expiry and completed once", async () => {
    const { ids } = await seed(10, { op: "ok" });
    const dead = launch({ mode: "claim-and-die", proc: "dead", claim: 10, leaseSeconds: 2 });
    const claimed = await dead.waitFor("claimed");
    expect((claimed.ids as string[]).length).toBe(10);
    await dead.exit;
    expect((await rows()).every((r) => r.status === "running")).toBe(true);
    const survivor = launch({ mode: "pass-until-idle", proc: "survivor", leaseSeconds: 2, idleStopMs: 4500 });
    await survivor.waitFor("done", 60_000);
    const all = await rows();
    expect(all.map((r) => r.status)).toEqual(Array(10).fill("completed"));
    expect(all.every((r) => r.attemptCount === 2)).toBe(true);
    const lost = await db.select().from(backgroundJobAttempts).where(eq(backgroundJobAttempts.outcome, "lease_lost"));
    expect(new Set(lost.map((l) => l.jobId))).toEqual(new Set(ids));
    expect(survivor.lines.filter((l) => l.type === "exec-start")).toHaveLength(10); // each ran once, on the survivor
  }, 90_000);

  it("SIGKILL in the middle of a handler: the job is recovered by another process and completes", async () => {
    const { ids } = await seed(1, { op: "sleep", ms: 10_000 });
    const victim = launch({ mode: "pass-until-idle", proc: "victim", leaseSeconds: 2 });
    await victim.waitFor("exec-start");
    victim.kill("SIGKILL");
    await victim.exit;
    expect((await rows())[0]).toMatchObject({ id: ids[0], status: "running", attemptCount: 1 });
    // the rescuer re-runs the same job from the start (at-least-once) once the dead worker's 2s lease has expired
    const rescuer = launch({ mode: "pass-until-idle", proc: "rescuer", leaseSeconds: 20, idleStopMs: 3000 });
    await rescuer.waitFor("exec-start", 40_000);
    await rescuer.waitFor("exec-end", 40_000);
    await rescuer.waitFor("done", 40_000);
    expect((await rows())[0]).toMatchObject({ status: "completed", attemptCount: 2 });
  }, 120_000);

  it("SIGTERM: a polling worker finishes its in-flight job, reports stopped with nothing in flight, exits 0, and claims nothing more", async () => {
    const { ids } = await seed(3, { op: "sleep", ms: 1500 });
    const w = launch({ mode: "poller", proc: "term", concurrency: 1 });
    await w.waitFor("exec-start");
    w.kill("SIGTERM");
    const stopped = await w.waitFor("stopped", 30_000);
    expect(stopped.inFlight).toBe(0);
    expect(await w.exit).toBe(0);
    const all = await rows();
    const done = all.filter((r) => r.status === "completed");
    const pending = all.filter((r) => r.status === "pending");
    expect(done.length).toBeGreaterThanOrEqual(1);
    expect(all.filter((r) => r.status === "running")).toHaveLength(0); // nothing orphaned mid-run
    expect(done.length + pending.length).toBe(ids.length);
    expect(w.lines.filter((l) => l.type === "exec-start").length).toBe(w.lines.filter((l) => l.type === "exec-end").length); // every started job ended
  }, 90_000);
});
