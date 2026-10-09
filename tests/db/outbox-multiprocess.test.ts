import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { outboxMessages } from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { queue, seedConversation, type Fixture } from "./outbox-helpers";

/**
 * GATE 2 — the final concurrency proof: SEPARATE OS PROCESSES, each with
 * its own connection pool and event loop, competing for the same outbox
 * in the same PostgreSQL database. (The in-process tests in
 * outbox-worker.test.ts use many connections but one Node process.)
 * REQUIRES a real Postgres. Run via `npm run test:db`.
 */
const CHILD = join(__dirname, "fixtures", "outbox-child.ts");
const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test";

interface Line { proc: string; pid: number; type: string; [k: string]: unknown }
interface Child { proc: string; pid: number; lines: Line[]; exit: Promise<number | null>; kill: (sig?: NodeJS.Signals) => void; waitFor: (type: string, ms?: number) => Promise<Line> }

function launch(args: Record<string, unknown>): Child {
  const cp: ChildProcess = spawn(process.execPath, ["--import", "tsx", CHILD, JSON.stringify(args)], {
    env: { ...process.env, TEST_DATABASE_URL: TEST_DB_URL },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines: Line[] = [];
  let buf = "";
  cp.stdout!.on("data", (d: Buffer) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const text = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (text.trim()) lines.push(JSON.parse(text) as Line);
    }
  });
  let stderr = "";
  cp.stderr!.on("data", (d: Buffer) => (stderr += d.toString()));
  const exit = new Promise<number | null>((resolve) => cp.on("exit", (code) => resolve(code)));
  return {
    proc: String(args.proc),
    pid: cp.pid!,
    lines,
    exit,
    kill: (sig = "SIGKILL") => cp.kill(sig),
    async waitFor(type, ms = 20_000) {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const hit = lines.find((l) => l.type === type);
        if (hit) return hit;
        const err = lines.find((l) => l.type === "error");
        if (err) throw new Error(`child ${args.proc} failed: ${err.message} ${stderr}`);
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`child ${args.proc} never emitted "${type}" (stderr: ${stderr.slice(0, 400)})`);
    },
  };
}

const sends = (children: Child[]) =>
  children.flatMap((c) => c.lines.filter((l) => l.type === "send-end" && l.ok === true).map((l) => ({ ...l, body: String(l.body), start: Number(l.start), end: Number(l.end) })));

describe("Outbox — real multi-process concurrency (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  beforeEach(async () => resetTestData(db));
  afterAll(async () => {
    await resetTestData(db);
    await pool.end();
  });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const row = async (id: string) => (await db.query.outboxMessages.findFirst({ where: eq(outboxMessages.id, id) }))!;

  it("4 processes x 2 worker loops (8 competing workers) over 96 messages in 24 conversations: every message claimed and sent EXACTLY once, strictly in order per conversation", async () => {
    const convs: Fixture[] = [];
    const queued: Array<{ id: string; body: string; conv: number }> = [];
    for (let c = 0; c < 24; c++) {
      const f = await seedConversation(db);
      convs.push(f);
      for (let m = 0; m < 4; m++) {
        const body = `c${c}-m${m}`;
        queued.push({ id: (await queue(db, f, body)).id, body, conv: c });
      }
    }
    expect(queued).toHaveLength(96);

    const children = ["A", "B", "C", "D"].map((proc) => launch({ mode: "worker", proc, loops: 2, durationMs: 40_000, idleStopMs: 1_500, sendDelayMs: 8, batchSize: 4 }));
    await Promise.all(children.map((c) => c.exit));
    for (const c of children) expect(c.lines.find((l) => l.type === "error"), `child ${c.proc}`).toBeUndefined();

    const done = sends(children);
    // 1. exactly once: 96 sends, every body once, no duplicate claim
    expect(done).toHaveLength(96);
    expect(new Set(done.map((s) => s.body)).size).toBe(96);
    for (const q of queued) {
      const r = await row(q.id);
      expect(r, q.body).toMatchObject({ status: "sent", attemptCount: 1, claimToken: null });
      expect(r.providerMessageId).toMatch(/^[A-D]-wamid-\d+$/);
    }
    // 2. real competition: several distinct OS processes did real work
    const workers = new Set(done.map((s) => s.pid));
    expect(workers.size).toBeGreaterThanOrEqual(2);
    // 3. ordering: per conversation, delivered in order and never overlapping, even across processes
    for (let c = 0; c < 24; c++) {
      const mine = done.filter((s) => s.body.startsWith(`c${c}-`)).sort((x, y) => x.start - y.start);
      expect(mine.map((s) => s.body), `conversation ${c}`).toEqual([0, 1, 2, 3].map((m) => `c${c}-m${m}`));
      for (let i = 1; i < mine.length; i++) expect(mine[i].start, `conversation ${c} overlap`).toBeGreaterThanOrEqual(mine[i - 1].end);
    }
    process.stderr.write(`[multi-process] processes=${children.length} workers=${children.length * 2} messages=96 distinct-processes-that-sent=${workers.size} per-process-sends=${JSON.stringify(Object.fromEntries([...workers].map((p) => [p, done.filter((s) => s.pid === p).length])))}\n`);
  }, 90_000);

  it("concurrent ENQUEUE from 4 processes of the same 30 logical messages stays idempotent: 30 rows, 30 creations in total, 90 deduplications", async () => {
    const f = await seedConversation(db);
    const keys = Array.from({ length: 30 }, (_, i) => `reply:${String(i).padStart(2, "0")}`);
    const children = ["A", "B", "C", "D"].map((proc) => launch({ mode: "enqueue", proc, tenantId: f.tenantId, conversationId: f.conversationId, customerId: f.customerId, keys }));
    await Promise.all(children.map((c) => c.exit));
    const dones = children.map((c) => c.lines.find((l) => l.type === "done")!);
    expect(dones.every(Boolean)).toBe(true);
    expect(dones.reduce((n, d) => n + Number(d.created), 0)).toBe(30);
    expect(dones.reduce((n, d) => n + Number(d.deduplicated), 0)).toBe(90);
    const rows = await db.query.outboxMessages.findMany({ where: eq(outboxMessages.conversationId, f.conversationId) });
    expect(rows).toHaveLength(30);
    expect(new Set(rows.map((r) => r.idempotencyKey)).size).toBe(30);
  }, 60_000);

  it("TENANT ISOLATION across processes: workers scoped to tenant A never touch tenant B, even while competing", async () => {
    const a = await seedConversation(db);
    const b = await seedConversation(db);
    const qa: string[] = [];
    const qb: string[] = [];
    for (let i = 0; i < 8; i++) {
      qa.push((await queue(db, await seedConversation(db, a.tenantId), `A${i}`)).id);
      qb.push((await queue(db, await seedConversation(db, b.tenantId), `B${i}`)).id);
    }
    const onlyA = ["P", "Q", "R"].map((proc) => launch({ mode: "worker", proc, tenantId: a.tenantId, loops: 2, durationMs: 20_000, idleStopMs: 1_000 }));
    await Promise.all(onlyA.map((c) => c.exit));
    expect(sends(onlyA).map((s) => s.body).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `A${i}`).sort());
    for (const id of qa) expect((await row(id)).status).toBe("sent");
    for (const id of qb) expect(await row(id)).toMatchObject({ status: "pending", attemptCount: 0, claimToken: null });

    const forB = launch({ mode: "worker", proc: "S", tenantId: b.tenantId, loops: 1, durationMs: 20_000, idleStopMs: 1_000 });
    await forB.exit;
    expect(sends([forB]).map((s) => s.body).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `B${i}`).sort());
  }, 90_000);

  it("ONE CONVERSATION CANNOT BLOCK ANOTHER: a conversation whose head keeps failing holds back only itself while other processes drain everyone else", async () => {
    const stuck = await seedConversation(db);
    const others = [await seedConversation(db), await seedConversation(db), await seedConversation(db)];
    const stuckHead = await queue(db, stuck, "STUCK-1");
    const stuckTail = await queue(db, stuck, "STUCK-2");
    for (const [i, f] of others.entries()) for (let m = 0; m < 3; m++) await queue(db, f, `ok${i}-${m}`);

    const children = ["A", "B", "C"].map((proc) => launch({ mode: "worker", proc, loops: 2, durationMs: 20_000, idleStopMs: 2_000, failBodies: ["STUCK-1"] }));
    await Promise.all(children.map((c) => c.exit));

    const delivered = sends(children).map((s) => s.body);
    expect(delivered.filter((b) => b.startsWith("ok")).sort()).toEqual(["ok0-0", "ok0-1", "ok0-2", "ok1-0", "ok1-1", "ok1-2", "ok2-0", "ok2-1", "ok2-2"]);
    expect(delivered).not.toContain("STUCK-1");
    expect(delivered).not.toContain("STUCK-2"); // held behind its own head, never overtakes it
    expect(await row(stuckHead.id)).toMatchObject({ status: "retry_wait", attemptCount: 1 }); // backing off, tried once
    expect(await row(stuckTail.id)).toMatchObject({ status: "pending", attemptCount: 0 });
  }, 60_000);

  it("LIVENESS across processes: while another process holds a row lock mid-claim, a worker in a THIRD process never waits — it skips the locked row and serves the rest immediately", async () => {
    const locked = await queue(db, await seedConversation(db), "LOCKED");
    for (let i = 0; i < 5; i++) await queue(db, await seedConversation(db), `free${i}`);

    const holder = launch({ mode: "hold-lock", proc: "H", lockId: locked.id, holdMs: 5_000 });
    await holder.waitFor("locked");
    const worker = launch({ mode: "worker", proc: "W", loops: 2, durationMs: 3_000, idleStopMs: 800 });
    await worker.exit;
    const releasedAt = holder.lines.find((l) => l.type === "released")?.at as number | undefined;

    // Every free message went out WHILE the lock was still held (the holder had not released yet)...
    const free = sends([worker]).filter((s) => s.body.startsWith("free"));
    expect(free.map((s) => s.body).sort()).toEqual(["free0", "free1", "free2", "free3", "free4"]);
    expect(releasedAt).toBeUndefined();
    // ...and the locked row was skipped, not waited for, nor stolen.
    expect(sends([worker]).map((s) => s.body)).not.toContain("LOCKED");
    await holder.exit;
    expect((await row(locked.id)).status).toBe("pending");
  }, 60_000);

  it("FENCING while the newer claim is still IN FLIGHT: a stalled process finishing before the recovering process cannot overwrite it (the claim token, not just the status, decides)", async () => {
    const q = await queue(db, await seedConversation(db), "fenced-inflight");
    // S: 2 s lease, its send takes 6 s. R recovers at ~2.6 s and its send takes 7 s,
    // so S finishes (t≈6 s) while R's claim is still processing (until t≈9–10 s).
    const stalled = launch({ mode: "slow-finisher", proc: "S", leaseSeconds: 2, sendDelayMs: 6_000 });
    await stalled.waitFor("claimed");
    await sleep(2_600);
    const rescuer = launch({ mode: "worker", proc: "R", loops: 1, durationMs: 20_000, idleStopMs: 1_000, sendDelayMs: 7_000, sendMarginMs: 0, leaseSeconds: 60 });

    const late = await stalled.waitFor("done", 30_000);
    expect(late.outcome).toBe("lost_lease"); // S finished first, while R still held the live claim
    await rescuer.exit;
    const r = await row(q.id);
    expect(r).toMatchObject({ status: "sent", attemptCount: 2, claimToken: null });
    expect(r.providerMessageId).toMatch(/^R-wamid-/); // R's outcome, not S's
    expect(rescuer.lines.find((l) => l.type === "done")?.totals).toMatchObject({ sent: 1, lostLease: 0 });
  }, 90_000);

  it("EXPIRED-LEASE RECOVERY across processes: a worker SIGKILLed mid-claim leaves its messages locked until the lease lapses; another process then recovers each and delivers it once", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await queue(db, await seedConversation(db), `r${i}`)).id);

    const doomed = launch({ mode: "claim-and-die", proc: "X", count: 5, leaseSeconds: 3 });
    const claimed = await doomed.waitFor("claimed");
    expect((claimed.ids as string[]).sort()).toEqual([...ids].sort());
    const deadToken = new Map((claimed.ids as string[]).map((id, i) => [id, (claimed.tokens as string[])[i]]));
    doomed.kill("SIGKILL"); // the process dies; its leases remain in the database
    await doomed.exit;
    for (const id of ids) expect((await row(id)).status).toBe("processing");

    // While the lease is valid, a healthy process must NOT steal the work (no intentional duplicates).
    const early = launch({ mode: "worker", proc: "E", loops: 1, durationMs: 1_200, sendMarginMs: 0 });
    await early.exit;
    expect(sends([early])).toHaveLength(0);

    await sleep(2_500); // lease (3 s) now expired
    const rescuer = launch({ mode: "worker", proc: "Y", loops: 2, durationMs: 15_000, idleStopMs: 1_500, sendMarginMs: 0 });
    await rescuer.exit;
    expect(sends([rescuer]).map((s) => s.body).sort()).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    for (const id of ids) {
      const r = await row(id);
      expect(r, id).toMatchObject({ status: "sent", attemptCount: 2 }); // dead worker's claim + the rescuer's
      expect(r.providerMessageId).toMatch(/^Y-wamid-/);
      expect(deadToken.get(id)).toBeTruthy();
    }
  }, 90_000);

  it("FENCING across processes: a stalled worker that finishes long after its lease was recovered cannot overwrite the recovering process's outcome", async () => {
    const q = await queue(db, await seedConversation(db), "fenced");
    // Process S claims with a 2 s lease, then its send takes 5 s (a GC pause / network stall).
    const stalled = launch({ mode: "slow-finisher", proc: "S", leaseSeconds: 2, sendDelayMs: 5_000 });
    const claim = await stalled.waitFor("claimed");
    expect(claim.id).toBe(q.id);

    await sleep(2_600); // S's lease expires while S is still "sending"
    const rescuer = launch({ mode: "worker", proc: "R", loops: 1, durationMs: 10_000, idleStopMs: 1_000, sendMarginMs: 0 });
    await rescuer.exit;
    expect(await row(q.id)).toMatchObject({ status: "sent", attemptCount: 2 });
    expect((await row(q.id)).providerMessageId).toMatch(/^R-wamid-/);

    const late = await stalled.waitFor("done", 20_000); // S finally returns "success"...
    expect(late.outcome).toBe("lost_lease"); // ...and is fenced out
    await stalled.exit;
    // The recovering process's result stands untouched.
    expect(await row(q.id)).toMatchObject({ status: "sent", attemptCount: 2, claimToken: null });
    expect((await row(q.id)).providerMessageId).toMatch(/^R-wamid-/);
    // The provider was called twice for one logical message: the documented at-least-once cost.
    expect(sends([stalled, rescuer])).toHaveLength(2);
  }, 90_000);
});
