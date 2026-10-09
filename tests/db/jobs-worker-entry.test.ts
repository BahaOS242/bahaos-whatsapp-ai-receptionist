import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { backgroundJobs } from "../../src/db/schema";
import { createDefaultJobRegistry } from "../../src/jobs/default-registry";
import { enqueueJob } from "../../src/jobs/enqueue";
import { MEMORY_EXPIRE_SWEEP } from "../../src/jobs/handlers/memory-expire-sweep";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { seedConversation } from "./outbox-helpers";

/**
 * Codex review of PR #2, finding 3: the STANDALONE worker (`src/worker.ts`, the real entry point) exited
 * with code 0 when its database was unreachable instead of retrying. These tests run the ACTUAL entry
 * point as a child process, pointed at the database through a TCP proxy that the test turns off and on
 * (real downtime, real timers). REQUIRES a real Postgres.
 */
const ENTRY = join(process.cwd(), "src", "worker.ts");
const DB = new URL(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test");

function freePort(): Promise<number> {
  return new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
}

/** A TCP forwarder to the real database that can be switched off (refusing AND dropping live connections) and on. */
function proxy(port: number) {
  const conns = new Set<net.Socket>();
  let server: net.Server | null = null;
  return {
    start: () => new Promise<void>((res) => {
      server = net.createServer((client) => {
        const upstream = net.connect(Number(DB.port || 5432), DB.hostname === "localhost" ? "127.0.0.1" : DB.hostname);
        conns.add(client); conns.add(upstream);
        client.pipe(upstream); upstream.pipe(client);
        const done = () => { client.destroy(); upstream.destroy(); conns.delete(client); conns.delete(upstream); };
        client.on("error", done); upstream.on("error", done); client.on("close", done); upstream.on("close", done);
      });
      server.listen(port, "127.0.0.1", () => res());
    }),
    stop: () => new Promise<void>((res) => { for (const c of conns) c.destroy(); conns.clear(); if (!server) return res(); server.close(() => res()); server = null; }),
  };
}

function launchEntry(env: Record<string, string>) {
  const e: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", ...env };
  const cp: ChildProcess = spawn(process.execPath, ["--import", "tsx", ENTRY], { env: e, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  let exitCode: number | null | undefined;
  cp.stdout!.on("data", (d: Buffer) => (out += d.toString()));
  cp.stderr!.on("data", (d: Buffer) => (err += d.toString()));
  const exited = new Promise<number | null>((r) => cp.on("exit", (c) => { exitCode = c; r(c); }));
  return { cp, out: () => out, err: () => err, exited, hasExited: () => exitCode !== undefined, exitCode: () => exitCode };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("standalone job worker entry point (src/worker.ts) (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  pool.on("error", () => {});
  beforeEach(async () => resetTestData(db));
  afterAll(async () => { await resetTestData(db); await pool.end(); });
  const childEnv = (port: number) => ({ DATABASE_URL: `postgres://${DB.username ? DB.username + "@" : ""}127.0.0.1:${port}${DB.pathname}`, JOBS_ENABLED: "true", JOBS_POLL_INTERVAL_MS: "250" });

  it("database DOWN at startup: the worker stays alive (does not exit 0), keeps retrying, then processes jobs once the database appears", async () => {
    const t = (await seedConversation(db)).tenantId;
    const { id } = await enqueueJob(db, createDefaultJobRegistry(), { tenantId: t, type: MEMORY_EXPIRE_SWEEP, payload: {}, idempotencyKey: "entry-1" });
    const port = await freePort();
    const px = proxy(port); // NOT started: connection refused
    const w = launchEntry(childEnv(port));
    try {
      await sleep(4000);
      expect(w.hasExited()).toBe(false); // the defect: this process used to exit with code 0 here
      expect(w.out()).toContain('"poll_error"');
      expect((await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0].status).toBe("pending");

      await px.start(); // the database "comes back"
      const end = Date.now() + 25_000;
      while ((await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0].status !== "completed" && Date.now() < end) await sleep(200);
      expect((await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0]).toMatchObject({ status: "completed", result: { swept: 0 } });
      expect(w.hasExited()).toBe(false);
    } finally {
      w.cp.kill("SIGTERM");
      expect(await w.exited).toBe(0); // a SIGTERM is the ONLY way this process ends cleanly
      await px.stop();
    }
  }, 60_000);

  it("database drops WHILE running (all connections cut, then restored): the worker survives and keeps working", async () => {
    const t = (await seedConversation(db)).tenantId;
    const port = await freePort();
    const px = proxy(port);
    await px.start();
    const w = launchEntry(childEnv(port));
    const reg = createDefaultJobRegistry();
    const waitDone = async (id: string, ms: number) => { const end = Date.now() + ms; while ((await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0].status !== "completed" && Date.now() < end) await sleep(200); return (await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0].status; };
    try {
      const a = await enqueueJob(db, reg, { tenantId: t, type: MEMORY_EXPIRE_SWEEP, payload: {}, idempotencyKey: "entry-a" });
      expect(await waitDone(a.id, 20_000)).toBe("completed");
      await px.stop(); // outage: live connections cut, new ones refused
      await sleep(3000);
      expect(w.hasExited()).toBe(false);
      const b = await enqueueJob(db, reg, { tenantId: t, type: MEMORY_EXPIRE_SWEEP, payload: {}, idempotencyKey: "entry-b" });
      await px.start();
      expect(await waitDone(b.id, 30_000)).toBe("completed"); // nothing lost across the outage
      expect(w.hasExited()).toBe(false);
    } finally {
      w.cp.kill("SIGTERM");
      expect(await w.exited).toBe(0);
      await px.stop();
    }
  }, 90_000);

  it("a normal SIGTERM still drains and exits 0; with JOBS_ENABLED unset it refuses to start with exit 1", async () => {
    const port = await freePort();
    const px = proxy(port);
    await px.start();
    const ok = launchEntry(childEnv(port));
    await sleep(2500);
    expect(ok.hasExited()).toBe(false);
    ok.cp.kill("SIGTERM");
    expect(await ok.exited).toBe(0);
    await px.stop();
    const off = launchEntry({ ...childEnv(port), JOBS_ENABLED: "false" });
    expect(await off.exited).toBe(1);
    expect(off.err()).toContain("JOBS_ENABLED is not true");
  }, 60_000);
});
