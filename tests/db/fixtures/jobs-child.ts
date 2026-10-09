/**
 * One child OS process for tests/db/jobs-multiprocess.test.ts. Own pool, own event
 * loop, TEST-ONLY handler; shares nothing with siblings except Postgres. Reports as
 * JSON lines on stdout. usage: node --import tsx jobs-child.ts '<json args>'
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import * as schema from "../../../src/db/schema";
import { createJobRegistry } from "../../../src/jobs/registry";
import { claimJobs, runJobPass, startJobWorker } from "../../../src/jobs/worker";

interface Args { mode: "pass-until-idle" | "claim-and-die" | "poller"; proc: string; leaseSeconds?: number; claim?: number; idleStopMs?: number; concurrency?: number }
const a = JSON.parse(process.argv[2]) as Args;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test", max: 6 });
pool.on("error", () => {});
const db = drizzle(pool, { schema });
const emit = (o: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ proc: a.proc, pid: process.pid, ...o })}\n`);

const registry = createJobRegistry([{
  type: "test.scripted", version: 1, maxAttempts: 5, timeoutMs: 20_000, backoffSeconds: [1],
  schema: z.object({ op: z.enum(["ok", "sleep"]), ms: z.number().int().max(10_000).optional() }).strict(),
  idempotency: "Test handler: emits a line only; repeatable.",
  handler: async (ctx, raw) => {
    const p = raw as { op: string; ms?: number };
    emit({ type: "exec-start", jobId: ctx.jobId, attempt: ctx.attempt });
    if (p.op === "sleep") await new Promise((r) => setTimeout(r, p.ms ?? 100));
    emit({ type: "exec-end", jobId: ctx.jobId, attempt: ctx.attempt });
  },
}]);

(async () => {
  const base = { registry, workerId: `${a.proc}-${process.pid}`, leaseSeconds: a.leaseSeconds ?? 120 };
  if (a.mode === "claim-and-die") {
    const rows = await claimJobs(db, base, a.claim ?? 5);
    emit({ type: "claimed", ids: rows.map((r) => r.id) });
    process.exit(0); // crash: no completion, no lease release
  }
  if (a.mode === "poller") {
    const w = startJobWorker(db, { ...base, pollIntervalMs: 250, concurrency: a.concurrency ?? 1, drainTimeoutMs: 20_000 });
    emit({ type: "ready" });
    process.once("SIGTERM", () => { void w.stop().then(() => { emit({ type: "stopped", inFlight: w.inFlight() }); process.exit(0); }); });
    return;
  }
  // pass-until-idle
  emit({ type: "ready" });
  let idleSince = Date.now();
  while (Date.now() - idleSince < (a.idleStopMs ?? 1500)) {
    const r = await runJobPass(db, base, 10, a.concurrency ?? 4);
    if (r.claimed > 0) idleSince = Date.now(); else await new Promise((res) => setTimeout(res, 100));
  }
  emit({ type: "done" });
  await pool.end();
})().catch((e) => { emit({ type: "error", message: String(e instanceof Error ? e.message : e) }); process.exit(1); });
