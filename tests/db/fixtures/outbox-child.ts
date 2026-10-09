/**
 * A focused fixture, NOT a framework: one child OS process that talks to
 * the SAME PostgreSQL database as its siblings and reports what it did as
 * JSON lines on stdout. Launched by tests/db/outbox-multiprocess.test.ts
 * via `node --import tsx`. Each child has its own pool, its own event
 * loop and its own provider — nothing is shared except Postgres.
 *
 * usage: node --import tsx outbox-child.ts '<json args>'
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "../../../src/db/schema";
import { enqueueOutboundMessage } from "../../../src/messaging/outbox";
import { claimOutboundBatch, deliverClaimed, runOutboxPass } from "../../../src/messaging/outbox-worker";
import type { MessagingProvider, OutboundMessageResult } from "../../../src/messaging/messaging-provider";

interface Args {
  mode: "worker" | "enqueue" | "claim-and-die" | "slow-finisher" | "hold-lock";
  proc: string;
  tenantId?: string;
  conversationId?: string;
  // worker
  loops?: number;
  durationMs?: number;
  idleStopMs?: number;
  sendDelayMs?: number;
  failBodies?: string[];
  leaseSeconds?: number;
  sendMarginMs?: number;
  batchSize?: number;
  // enqueue
  keys?: string[];
  customerId?: string;
  messageIds?: Record<string, string>;
  // claim
  count?: number;
  // hold-lock
  lockId?: string;
  holdMs?: number;
}

const a = JSON.parse(process.argv[2]) as Args;
const url = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test";
const pool = new Pool({ connectionString: url, max: 6 });
const db = drizzle(pool, { schema });
const emit = (o: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ proc: a.proc, pid: process.pid, ...o })}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let n = 0;
const provider: MessagingProvider = {
  async sendText(to, body): Promise<OutboundMessageResult> {
    const start = Date.now();
    emit({ type: "send-start", body, to, start });
    await sleep(a.sendDelayMs ?? 0);
    if (a.failBodies?.includes(body)) {
      emit({ type: "send-end", body, start, end: Date.now(), ok: false });
      return { success: false, error: "scripted transient failure", retryable: true, errorCode: "http_503", ambiguous: true };
    }
    n += 1;
    emit({ type: "send-end", body, start, end: Date.now(), ok: true });
    return { success: true, providerMessageId: `${a.proc}-wamid-${n}` };
  },
};

async function main() {
  const opts = { tenantId: a.tenantId, conversationId: a.conversationId, leaseSeconds: a.leaseSeconds, sendMarginMs: a.sendMarginMs, batchSize: a.batchSize ?? 3 };

  if (a.mode === "worker") {
    const deadline = Date.now() + (a.durationMs ?? 10_000);
    const totals = { claimed: 0, sent: 0, retried: 0, deadLettered: 0, lostLease: 0, skipped: 0 };
    await Promise.all(
      Array.from({ length: a.loops ?? 1 }, async () => {
        let idleSince = Date.now();
        while (Date.now() < deadline) {
          const pass = await runOutboxPass(db, provider, opts);
          for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] += pass[k];
          if (pass.claimed > 0) idleSince = Date.now();
          else if (a.idleStopMs && Date.now() - idleSince > a.idleStopMs) break;
          if (pass.claimed === 0) await sleep(15);
        }
      }),
    );
    emit({ type: "done", totals });
  } else if (a.mode === "enqueue") {
    // Every sibling process enqueues the SAME logical keys, racing.
    const order = [...(a.keys ?? [])].sort(() => Math.random() - 0.5);
    let created = 0;
    let deduplicated = 0;
    for (const key of order) {
      const [log] = await db
        .insert(schema.messages)
        .values({ tenantId: a.tenantId!, conversationId: a.conversationId!, direction: "outbound", senderType: "ai", content: key })
        .returning();
      const r = await enqueueOutboundMessage(db, {
        tenantId: a.tenantId!, conversationId: a.conversationId!, customerId: a.customerId!, messageId: log.id, body: key, idempotencyKey: key,
      });
      if (r.deduplicated) deduplicated += 1;
      else created += 1;
    }
    emit({ type: "done", created, deduplicated });
  } else if (a.mode === "claim-and-die") {
    const rows = await claimOutboundBatch(db, { ...opts, batchSize: a.count ?? 5 });
    emit({ type: "claimed", ids: rows.map((r) => r.id), tokens: rows.map((r) => r.claimToken) });
    await sleep(600_000); // the parent SIGKILLs us while we "work"
  } else if (a.mode === "hold-lock") {
    // Behaves like a worker caught mid-claim: holds a row lock inside an open transaction.
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from outbox_messages where id = ${a.lockId}::uuid for update`);
      emit({ type: "locked", at: Date.now() });
      await sleep(a.holdMs ?? 4_000);
    });
    emit({ type: "released", at: Date.now() });
  } else if (a.mode === "slow-finisher") {
    // Claims one message with a SHORT lease, then takes far longer than the lease to finish.
    const [row] = await claimOutboundBatch(db, { ...opts, batchSize: 1 });
    emit({ type: "claimed", id: row.id, token: row.claimToken });
    const outcome = await deliverClaimed(db, provider, row, { sendMarginMs: 0 });
    emit({ type: "done", outcome });
  }
  await pool.end();
}

main().catch((e) => {
  emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
