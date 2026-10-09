import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { messages, outboxMessages } from "../../src/db/schema";
import {
  OUTBOX_BACKOFF_SECONDS,
  OUTBOX_LEASE_SECONDS,
  OUTBOX_MAX_ATTEMPTS,
  enqueueOutboundMessage,
} from "../../src/messaging/outbox";
import { claimOutboundBatch, deliverClaimed, drainConversation, runOutboxPass } from "../../src/messaging/outbox-worker";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { fakeClock, PERMANENT, queue, ScriptedProvider, seedConversation, TRANSIENT } from "./outbox-helpers";

/**
 * Durable outbox — worker behaviour. REQUIRES a real Postgres (claiming
 * relies on real row locking) — see appointments-concurrency.test.ts's
 * header. Run via `npm run test:db`.
 */
describe("Outbox worker (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  beforeEach(async () => resetTestData(db));
  afterAll(async () => {
    await resetTestData(db);
    await pool.end();
  });

  const row = async (id: string) => (await db.query.outboxMessages.findFirst({ where: eq(outboxMessages.id, id) }))!;
  const logRow = async (messageId: string) => (await db.query.messages.findFirst({ where: eq(messages.id, messageId) }))!;
  const rng = () => 0.5; // jitter factor exactly 1.0

  describe("lifecycle: enqueue -> persist -> claim -> send -> SENT", () => {
    it("enqueue persists a PENDING row with the full delivery record, and marks the log row queued", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "Your appointment is confirmed.", "reply:abc");
      const r = await row(q.id);
      expect(q.deduplicated).toBe(false);
      expect(r).toMatchObject({
        tenantId: f.tenantId, conversationId: f.conversationId, customerId: f.customerId, messageId: q.messageId,
        channel: "whatsapp", provider: "meta_cloud", messageType: "text", recipient: f.phone,
        payload: { body: "Your appointment is confirmed." }, status: "pending", idempotencyKey: "reply:abc",
        attemptCount: 0, maxAttempts: OUTBOX_MAX_ATTEMPTS, sentAt: null, failedAt: null, providerMessageId: null,
        lastError: null, errorCode: null, claimToken: null, leaseExpiresAt: null,
      });
      expect(r.seq).toBeGreaterThan(0);
      expect((await logRow(q.messageId)).status).toBe("queued");
    });

    it("a worker claims, sends to the recipient, and records SENT with the provider message id", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "hello");
      const provider = new ScriptedProvider();

      const pass = await runOutboxPass(db, provider);

      expect(pass).toMatchObject({ claimed: 1, sent: 1, retried: 0, deadLettered: 0 });
      expect(provider.sends).toHaveLength(1);
      expect(provider.sends[0]).toMatchObject({ to: f.phone, body: "hello" }); // "+"-prefixed identity; the Meta adapter strips the "+"
      const r = await row(q.id);
      expect(r).toMatchObject({ status: "sent", attemptCount: 1, providerMessageId: "wamid.test-1", lastError: null, errorCode: null, claimToken: null, leaseExpiresAt: null });
      expect(r.sentAt).toBeInstanceOf(Date);
      // The conversation log mirrors the outcome (existing observability preserved).
      expect(await logRow(q.messageId)).toMatchObject({ status: "sent", outboundAttempts: 1, nextRetryAt: null, lastError: null });
    });

    it("a SENT message is never claimed or sent again", async () => {
      const f = await seedConversation(db);
      await queue(db, f, "once");
      const provider = new ScriptedProvider();
      await runOutboxPass(db, provider);
      expect((await runOutboxPass(db, provider)).claimed).toBe(0);
      expect(provider.sends).toHaveLength(1);
    });

    it("the retry worker never creates a second log row — one conversation turn, one `messages` row, throughout its life", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const before = await db.query.messages.findMany({ where: eq(messages.conversationId, f.conversationId) });
      await runOutboxPass(db, new ScriptedProvider());
      const after = await db.query.messages.findMany({ where: eq(messages.conversationId, f.conversationId) });
      expect(after).toHaveLength(before.length);
      expect(after[0].id).toBe(q.messageId);
    });
  });

  describe("transient failures -> RETRY_WAIT with bounded, jittered backoff", () => {
    it.each(Object.entries(TRANSIENT))("%s -> retry_wait, attempt counted, error recorded, retry scheduled in the future", async (_name, failure) => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      await runOutboxPass(db, new ScriptedProvider(() => failure), { clock: t.clock, rng });

      const r = await row(q.id);
      expect(r.status).toBe("retry_wait");
      expect(r.attemptCount).toBe(1);
      expect(r.errorCode).toBe(failure.errorCode);
      expect(r.lastError).toBe(failure.error);
      expect(r.errorMetadata).toMatchObject({ ambiguous: failure.ambiguous });
      expect(r.availableAt.getTime()).toBe(t.now().getTime() + OUTBOX_BACKOFF_SECONDS[0] * 1000);
      expect(r.claimToken).toBeNull(); // claim released
      expect(await logRow(q.messageId)).toMatchObject({ status: "retry_pending", outboundAttempts: 1 });
    });

    it("the documented schedule: 30s, 60s, 120s, 240s, then DEAD_LETTER on the 5th failure — never retried again", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      const provider = new ScriptedProvider(() => TRANSIENT.http503);
      const delays: number[] = [];

      for (let attempt = 1; attempt <= OUTBOX_MAX_ATTEMPTS; attempt++) {
        const before = t.now().getTime();
        await runOutboxPass(db, provider, { clock: t.clock, rng });
        const r = await row(q.id);
        if (attempt < OUTBOX_MAX_ATTEMPTS) {
          expect(r.status).toBe("retry_wait");
          delays.push((r.availableAt.getTime() - before) / 1000);
          t.advance(r.availableAt.getTime() - before); // wait out the backoff
        }
      }
      expect(delays).toEqual([30, 60, 120, 240]);

      const final = await row(q.id);
      expect(final).toMatchObject({ status: "dead_letter", attemptCount: OUTBOX_MAX_ATTEMPTS });
      expect(final.errorMetadata).toMatchObject({ deadLetterReason: "exhausted" });
      expect(final.failedAt).toBeInstanceOf(Date);
      expect(provider.sends).toHaveLength(OUTBOX_MAX_ATTEMPTS);

      t.advance(86_400_000);
      expect((await runOutboxPass(db, provider, { clock: t.clock })).claimed).toBe(0); // bounded: nothing more, ever
      expect(provider.sends).toHaveLength(OUTBOX_MAX_ATTEMPTS);
      expect(await logRow(q.messageId)).toMatchObject({ status: "failed", outboundAttempts: OUTBOX_MAX_ATTEMPTS });
    });

    it("jitter stays within ±20% of the base and varies with the random source", async () => {
      const f = await seedConversation(db);
      const delays: number[] = [];
      for (const r of [0, 0.5, 0.999]) {
        const q = await queue(db, f, `x${r}`);
        const t = fakeClock();
        await runOutboxPass(db, new ScriptedProvider(() => TRANSIENT.timeout), { clock: t.clock, rng: () => r, conversationId: f.conversationId });
        delays.push(((await row(q.id)).availableAt.getTime() - t.now().getTime()) / 1000);
        await db.update(outboxMessages).set({ status: "sent" }).where(eq(outboxMessages.id, q.id)); // release the conversation's line
      }
      expect(delays[0]).toBe(24); // 30 * 0.8
      expect(delays[1]).toBe(30);
      expect(delays[2]).toBeGreaterThanOrEqual(35);
      expect(delays[2]).toBeLessThanOrEqual(36);
    });

    it("a retry becomes available ONLY when due, and a transient failure followed by success delivers exactly once", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      const provider = new ScriptedProvider((call) => (call === 1 ? TRANSIENT.timeout : { success: true }));
      await runOutboxPass(db, provider, { clock: t.clock, rng });
      expect((await runOutboxPass(db, provider, { clock: t.clock })).claimed).toBe(0); // not yet due
      t.advance(29_000);
      expect((await runOutboxPass(db, provider, { clock: t.clock })).claimed).toBe(0);
      t.advance(1_000);
      expect((await runOutboxPass(db, provider, { clock: t.clock })).sent).toBe(1);
      expect(provider.sends).toHaveLength(2);
      expect(await row(q.id)).toMatchObject({ status: "sent", attemptCount: 2, lastError: null, errorCode: null });
    });
  });

  describe("permanent failures are never retried", () => {
    it.each(Object.entries(PERMANENT))("%s -> DEAD_LETTER immediately, one attempt, never picked up again", async (_name, failure) => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      const provider = new ScriptedProvider(() => failure);
      const pass = await runOutboxPass(db, provider, { clock: t.clock });
      expect(pass).toMatchObject({ claimed: 1, deadLettered: 1, retried: 0 });
      const r = await row(q.id);
      expect(r).toMatchObject({ status: "dead_letter", attemptCount: 1, errorCode: failure.errorCode ?? null, lastError: failure.error });
      expect(r.errorMetadata).toMatchObject({ deadLetterReason: "permanent" });
      t.advance(7 * 86_400_000);
      expect((await runOutboxPass(db, provider, { clock: t.clock })).claimed).toBe(0);
      expect(provider.sends).toHaveLength(1);
      expect(await logRow(q.messageId)).toMatchObject({ status: "failed" });
    });
  });

  describe("idempotency", () => {
    it("the same logical message + the same key = ONE queued message; the duplicate is reported, not inserted", async () => {
      const f = await seedConversation(db);
      const a = await queue(db, f, "same", "reply:1");
      // A second attempt to queue the same logical reply (new log row, same key).
      const [dupLog] = await db.insert(messages).values({ tenantId: f.tenantId, conversationId: f.conversationId, direction: "outbound", senderType: "ai", content: "same" }).returning();
      const b = await enqueueOutboundMessage(db, { tenantId: f.tenantId, conversationId: f.conversationId, customerId: f.customerId, messageId: dupLog.id, body: "same", idempotencyKey: "reply:1" });
      expect(b).toEqual({ id: a.id, deduplicated: true });
      expect(await db.query.outboxMessages.findMany({ where: eq(outboxMessages.conversationId, f.conversationId) })).toHaveLength(1);
      const provider = new ScriptedProvider();
      await runOutboxPass(db, provider);
      expect(provider.sends).toHaveLength(1);
    });

    it("the same log row can never be queued twice, even under a different key", async () => {
      const f = await seedConversation(db);
      const a = await queue(db, f, "x", "k1");
      const again = await enqueueOutboundMessage(db, { tenantId: f.tenantId, conversationId: f.conversationId, customerId: f.customerId, messageId: a.messageId, body: "x", idempotencyKey: "k2" });
      expect(again).toEqual({ id: a.id, deduplicated: true });
    });

    it("FIVE simultaneous enqueues of the same logical reply produce exactly one row and one delivery", async () => {
      const f = await seedConversation(db);
      const [log] = await db.insert(messages).values({ tenantId: f.tenantId, conversationId: f.conversationId, direction: "outbound", senderType: "ai", content: "race" }).returning();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          enqueueOutboundMessage(db, { tenantId: f.tenantId, conversationId: f.conversationId, customerId: f.customerId, messageId: log.id, body: "race", idempotencyKey: "reply:race" }),
        ),
      );
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
      const provider = new ScriptedProvider();
      await runOutboxPass(db, provider);
      expect(provider.sends).toHaveLength(1);
    });

    it("keys are scoped per tenant: two tenants may use the same key", async () => {
      const a = await seedConversation(db);
      const b = await seedConversation(db);
      const qa = await queue(db, a, "A", "reply:1");
      const qb = await queue(db, b, "B", "reply:1");
      expect(qa.deduplicated).toBe(false);
      expect(qb.deduplicated).toBe(false);
      expect(qa.id).not.toBe(qb.id);
    });

    it("AMBIGUOUS: Meta may have accepted a request that timed out — it is retried (at-least-once), flagged ambiguous, and the provider id of the attempt that DID return is the one kept", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      const provider = new ScriptedProvider((call) => (call === 1 ? TRANSIENT.timeout : { success: true }));
      await runOutboxPass(db, provider, { clock: t.clock, rng });
      expect((await row(q.id)).errorMetadata).toMatchObject({ ambiguous: true });
      t.advance(30_000);
      await runOutboxPass(db, provider, { clock: t.clock });
      // Two provider calls for one logical message: the documented at-least-once cost.
      expect(provider.sends).toHaveLength(2);
      expect(await db.query.outboxMessages.findMany({ where: eq(outboxMessages.conversationId, f.conversationId) })).toHaveLength(1);
      expect(await row(q.id)).toMatchObject({ status: "sent", providerMessageId: "wamid.test-2" });
    });

    it("MALFORMED 2xx: Meta accepted but the body had no usable id -> SENT (2xx is acceptance), id recorded as absent, nothing retried", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const provider = new ScriptedProvider(() => ({ success: true, providerMessageId: undefined }));
      await runOutboxPass(db, provider);
      expect(await row(q.id)).toMatchObject({ status: "sent", providerMessageId: null, errorMetadata: { acceptedWithoutProviderId: true } });
      expect((await runOutboxPass(db, provider)).claimed).toBe(0);
      expect(provider.sends).toHaveLength(1);
    });
  });

  describe("concurrency: the database decides who owns a message", () => {
    it("FIVE workers racing for ONE message: exactly one claims it, exactly one send happens", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "only once");
      const provider = new ScriptedProvider(async () => {
        await new Promise((r) => setTimeout(r, 40)); // hold the claim so the race is real
        return { success: true };
      });
      const passes = await Promise.all(Array.from({ length: 5 }, () => runOutboxPass(db, provider)));
      expect(passes.reduce((n, p) => n + p.claimed, 0)).toBe(1);
      expect(provider.sends).toHaveLength(1);
      expect((await row(q.id)).attemptCount).toBe(1);
    });

    it("three workers over twenty messages in twenty conversations: every message sent exactly once", async () => {
      const queued = [];
      for (let i = 0; i < 20; i++) queued.push(await queue(db, await seedConversation(db), `m${i}`));
      const provider = new ScriptedProvider();
      await Promise.all(
        [1, 2, 3].map(async () => {
          for (let i = 0; i < 6; i++) await runOutboxPass(db, provider, { batchSize: 4 });
        }),
      );
      expect([...provider.bodies].sort()).toEqual(Array.from({ length: 20 }, (_, i) => `m${i}`).sort());
      for (const q of queued) expect((await row(q.id)).status).toBe("sent");
    });

    it("a retry that becomes due while another worker is mid-send is NOT claimed a second time", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      await runOutboxPass(db, new ScriptedProvider(() => TRANSIENT.timeout), { clock: t.clock, rng });
      t.advance(30_000); // now due

      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const slow = new ScriptedProvider(async () => {
        await gate;
        return { success: true };
      });
      const inFlight = runOutboxPass(db, slow, { clock: t.clock });
      await new Promise((r) => setTimeout(r, 50)); // worker A has claimed and is "sending"
      expect((await row(q.id)).status).toBe("processing");

      const other = new ScriptedProvider();
      expect((await runOutboxPass(db, other, { clock: t.clock })).claimed).toBe(0); // B finds nothing
      release();
      await inFlight;
      expect(other.sends).toHaveLength(0);
      expect(slow.sends).toHaveLength(1);
      expect((await row(q.id)).status).toBe("sent");
    });
  });

  describe("crash recovery: leases", () => {
    it("a worker that dies after claiming leaves the message PROCESSING; it is untouchable until the lease expires, then recovered and delivered", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      const claimed = await claimOutboundBatch(db, { clock: t.clock }); // ...and the worker "dies" here
      expect(claimed).toHaveLength(1);
      expect(await row(q.id)).toMatchObject({ status: "processing", attemptCount: 1 });

      const provider = new ScriptedProvider();
      t.advance((OUTBOX_LEASE_SECONDS - 1) * 1000);
      expect((await runOutboxPass(db, provider, { clock: t.clock })).claimed).toBe(0); // lease still valid: no intentional duplicate
      t.advance(2_000);
      expect((await runOutboxPass(db, provider, { clock: t.clock })).sent).toBe(1); // lease expired: recovered
      expect(await row(q.id)).toMatchObject({ status: "sent", attemptCount: 2 });
      expect(provider.sends).toHaveLength(1);
    });

    it("a message whose delivery keeps killing its worker is DEAD-LETTERED after the last allowed attempt, not re-claimed forever", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "poison");
      const t = fakeClock();
      for (let i = 0; i < OUTBOX_MAX_ATTEMPTS; i++) {
        expect(await claimOutboundBatch(db, { clock: t.clock })).toHaveLength(1); // claim, then die
        t.advance((OUTBOX_LEASE_SECONDS + 1) * 1000);
      }
      const provider = new ScriptedProvider();
      expect((await runOutboxPass(db, provider, { clock: t.clock })).claimed).toBe(0);
      expect(await row(q.id)).toMatchObject({ status: "dead_letter", errorCode: "lease_expired_exhausted", attemptCount: OUTBOX_MAX_ATTEMPTS });
      expect(provider.sends).toHaveLength(0);
      expect(await logRow(q.messageId)).toMatchObject({ status: "failed" });
    });

    it("CRASH AFTER the provider accepted but BEFORE the DB update: the message is recovered and re-sent — at-least-once, the documented duplicate window", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      const provider = new ScriptedProvider();
      const [row1] = await claimOutboundBatch(db, { clock: t.clock });
      await expect(
        deliverClaimed(db, provider, row1, { clock: t.clock, afterSend: () => { throw new Error("process killed"); } }),
      ).rejects.toThrow("process killed");
      expect(provider.sends).toHaveLength(1); // Meta HAS the message
      expect((await row(q.id)).status).toBe("processing"); // we never recorded it

      t.advance((OUTBOX_LEASE_SECONDS + 1) * 1000);
      await runOutboxPass(db, provider, { clock: t.clock });
      expect(provider.sends).toHaveLength(2); // the customer may see it twice: inherent without a provider idempotency key
      expect(await row(q.id)).toMatchObject({ status: "sent", attemptCount: 2 });
    });

    it("FENCING: a stalled worker waking up after its lease was recovered cannot overwrite the newer attempt's outcome", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      const [stale] = await claimOutboundBatch(db, { clock: t.clock });
      const claimTime = t.now();

      t.advance((OUTBOX_LEASE_SECONDS + 1) * 1000);
      const fresh = new ScriptedProvider(() => ({ success: true, providerMessageId: "wamid.FRESH" }));
      await runOutboxPass(db, fresh, { clock: t.clock });
      expect(await row(q.id)).toMatchObject({ status: "sent", providerMessageId: "wamid.FRESH", attemptCount: 2 });

      // The stalled worker (still believing it holds a valid lease) now finishes.
      const lateProvider = new ScriptedProvider(() => ({ success: false, error: "late failure", retryable: false }));
      const outcome = await deliverClaimed(db, lateProvider, stale, { clock: () => claimTime });
      expect(outcome).toBe("lost_lease");
      expect(await row(q.id)).toMatchObject({ status: "sent", providerMessageId: "wamid.FRESH", lastError: null });
      expect(await logRow(q.messageId)).toMatchObject({ status: "sent" });
    });

    it("a worker will not START a send that cannot finish inside its own lease", async () => {
      const f = await seedConversation(db);
      await queue(db, f, "x");
      const t = fakeClock();
      const [claimedRow] = await claimOutboundBatch(db, { clock: t.clock });
      const provider = new ScriptedProvider();
      t.advance((OUTBOX_LEASE_SECONDS - 5) * 1000); // only 5s of lease left
      expect(await deliverClaimed(db, provider, claimedRow, { clock: t.clock })).toBe("skipped");
      expect(provider.sends).toHaveLength(0);
    });

    it("DATABASE TEMPORARILY UNAVAILABLE while recording the outcome: nothing is lost — the claim lapses and the message is recovered", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      let failNext = true;
      const flaky = new Proxy(db, {
        get(target, prop, receiver) {
          if (prop === "transaction" && failNext) {
            failNext = false;
            return async () => {
              throw new Error("connection terminated unexpectedly");
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
      const provider = new ScriptedProvider();
      await expect(runOutboxPass(flaky as typeof db, provider, { clock: t.clock })).rejects.toThrow(/connection terminated/);
      expect(provider.sends).toHaveLength(1);
      expect((await row(q.id)).status).toBe("processing");

      t.advance((OUTBOX_LEASE_SECONDS + 1) * 1000);
      await runOutboxPass(db, provider, { clock: t.clock });
      expect((await row(q.id)).status).toBe("sent");
    });

    it("DATABASE UNAVAILABLE at claim time: the pass fails loudly and the row is untouched, still deliverable", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const down = new Proxy(db, {
        get(target, prop, receiver) {
          if (prop === "execute") return async () => { throw new Error("db down"); };
          return Reflect.get(target, prop, receiver);
        },
      });
      await expect(runOutboxPass(down as typeof db, new ScriptedProvider())).rejects.toThrow("db down");
      expect((await row(q.id)).status).toBe("pending");
      expect((await runOutboxPass(db, new ScriptedProvider())).sent).toBe(1);
    });

    it("FENCING (in flight): a stalled worker finishing while a NEWER claim is mid-send cannot touch the row — only the current claim's outcome counts", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const t = fakeClock();
      const [stale] = await claimOutboundBatch(db, { clock: t.clock });
      const staleTime = t.now();
      t.advance((OUTBOX_LEASE_SECONDS + 1) * 1000);
      const [current] = await claimOutboundBatch(db, { clock: t.clock }); // recovered; now mid-send
      expect(current.claimToken).not.toBe(stale.claimToken);

      const lateStale = await deliverClaimed(db, new ScriptedProvider(() => ({ success: true, providerMessageId: "wamid.STALE" })), stale, { clock: () => staleTime });
      expect(lateStale).toBe("lost_lease");
      expect(await row(q.id)).toMatchObject({ status: "processing", claimToken: current.claimToken, providerMessageId: null });

      expect(await deliverClaimed(db, new ScriptedProvider(() => ({ success: true, providerMessageId: "wamid.CURRENT" })), current, { clock: t.clock })).toBe("sent");
      expect(await row(q.id)).toMatchObject({ status: "sent", providerMessageId: "wamid.CURRENT" });
    });

    it("LIVENESS: a worker never WAITS behind another worker's row lock — it skips the locked row and serves the rest", async () => {
      const a = await seedConversation(db);
      const b = await seedConversation(db);
      const qa = await queue(db, a, "locked by another worker");
      await queue(db, b, "free");
      const other = createTestDb();
      try {
        await other.db.transaction(async (tx) => {
          await tx.execute(sql`select id from outbox_messages where id = ${qa.id}::uuid for update`); // "worker A" mid-claim
          const started = Date.now();
          const claimed = await claimOutboundBatch(db); // "worker B" arrives
          expect(Date.now() - started).toBeLessThan(1500); // did not block on the held lock
          expect(claimed.map((c) => c.body)).toEqual(["free"]);
        });
      } finally {
        await other.pool.end();
      }
    });

    it("a HUNG provider cannot pin a claim: the hard ceiling converts it into an ambiguous retryable attempt", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const hung = new ScriptedProvider(() => new Promise(() => {})); // never resolves
      const pass = await runOutboxPass(db, hung, { sendCeilingMs: 50, rng });
      expect(pass.retried).toBe(1);
      expect(await row(q.id)).toMatchObject({ status: "retry_wait", errorCode: "worker_timeout", errorMetadata: { ambiguous: true } });
    });

    it("a provider that THROWS (contract violation) is contained: counted as an ambiguous retryable attempt, never a crash", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "x");
      const provider = new ScriptedProvider(() => { throw new Error("boom"); });
      const pass = await runOutboxPass(db, provider, { rng });
      expect(pass.retried).toBe(1);
      expect(await row(q.id)).toMatchObject({ status: "retry_wait", errorCode: "provider_exception" });
    });

    it("SERVER RESTART with pending messages: a genuinely fresh connection pool finds and delivers them", async () => {
      const f = await seedConversation(db);
      const q = await queue(db, f, "survives a restart");
      const fresh = createTestDb();
      try {
        const provider = new ScriptedProvider();
        expect((await runOutboxPass(fresh.db, provider)).sent).toBe(1);
        expect((await fresh.db.query.outboxMessages.findFirst({ where: eq(outboxMessages.id, q.id) }))?.status).toBe("sent");
      } finally {
        await fresh.pool.end();
      }
    });
  });

  describe("ordering: per conversation, never global", () => {
    it("rapid multi-message turn: delivered strictly in order, one at a time, by a single drain", async () => {
      const f = await seedConversation(db);
      await queue(db, f, "A: Absolutely, I can help.");
      await queue(db, f, "B: What day works best for you?");
      await queue(db, f, "C: And what time?");
      const provider = new ScriptedProvider();
      await drainConversation(db, provider, f.conversationId);
      expect(provider.bodies).toEqual(["A: Absolutely, I can help.", "B: What day works best for you?", "C: And what time?"]);
    });

    it("a pass claims only the HEAD of a conversation — later messages cannot overtake it", async () => {
      const f = await seedConversation(db);
      await queue(db, f, "A");
      await queue(db, f, "B");
      const claimed = await claimOutboundBatch(db);
      expect(claimed.map((c) => c.body)).toEqual(["A"]);
    });

    it("B never arrives before A: while A waits to retry, B is held back — but ANOTHER conversation is not blocked", async () => {
      const slow = await seedConversation(db);
      const other = await seedConversation(db);
      const t = fakeClock();
      const a = await queue(db, slow, "A");
      await queue(db, slow, "B");
      await queue(db, other, "OTHER");
      const provider = new ScriptedProvider((call, _to, body) => (body === "A" && call === 1 ? TRANSIENT.http503 : { success: true }));

      await runOutboxPass(db, provider, { clock: t.clock, rng });
      await runOutboxPass(db, provider, { clock: t.clock, rng });
      expect(provider.bodies).toEqual(["A", "OTHER"]); // B held; OTHER not blocked
      expect((await row(a.id)).status).toBe("retry_wait");

      t.advance(30_000);
      await drainConversation(db, provider, slow.conversationId, { clock: t.clock });
      expect(provider.bodies).toEqual(["A", "OTHER", "A", "B"]); // A first, then B
    });

    it("a DEAD-LETTERED message releases the line — later messages are not blocked forever", async () => {
      const f = await seedConversation(db);
      await queue(db, f, "A (undeliverable)");
      await queue(db, f, "B");
      const provider = new ScriptedProvider((_c, _to, body) => (body.startsWith("A") ? PERMANENT.invalidRecipient : { success: true }));
      await drainConversation(db, provider, f.conversationId);
      await runOutboxPass(db, provider, { conversationId: f.conversationId });
      expect(provider.bodies).toEqual(["A (undeliverable)", "B"]);
    });

    it("two concurrent workers on one conversation never overlap sends and preserve order", async () => {
      const f = await seedConversation(db);
      for (const body of ["1", "2", "3", "4"]) await queue(db, f, body);
      const provider = new ScriptedProvider(async () => {
        await new Promise((r) => setTimeout(r, 25));
        return { success: true };
      });
      // Workers poll until everything is delivered (bounded by a deadline). A fixed pass
      // count was racy: a worker blocked behind another's in-flight send burns passes
      // instantly and could run out before the line freed up.
      const deadline = Date.now() + 10_000;
      await Promise.all([1, 2, 3].map(async () => {
        while (provider.sends.length < 4 && Date.now() < deadline) {
          await runOutboxPass(db, provider);
          await new Promise((r) => setTimeout(r, 5));
        }
      }));
      expect(provider.bodies).toEqual(["1", "2", "3", "4"]);
      for (let i = 1; i < provider.sends.length; i++) {
        expect(provider.sends[i].startedAt).toBeGreaterThanOrEqual(provider.sends[i - 1].endedAt!); // strictly sequential
      }
    });
  });

  describe("tenant isolation", () => {
    it("a worker scoped to tenant A never claims, sends, or alters tenant B's messages", async () => {
      const a = await seedConversation(db);
      const b = await seedConversation(db);
      const qa = await queue(db, a, "for A");
      const qb = await queue(db, b, "for B");
      const provider = new ScriptedProvider();
      await runOutboxPass(db, provider, { tenantId: a.tenantId });
      expect(provider.bodies).toEqual(["for A"]);
      expect((await row(qa.id)).status).toBe("sent");
      expect(await row(qb.id)).toMatchObject({ status: "pending", attemptCount: 0, claimToken: null });
      await runOutboxPass(db, provider, { tenantId: b.tenantId });
      expect(provider.bodies).toEqual(["for A", "for B"]);
    });

    it("a message cannot be queued for a customer of a different tenant", async () => {
      const a = await seedConversation(db);
      const b = await seedConversation(db);
      const [log] = await db.insert(messages).values({ tenantId: a.tenantId, conversationId: a.conversationId, direction: "outbound", senderType: "ai", content: "x" }).returning();
      await expect(
        enqueueOutboundMessage(db, { tenantId: a.tenantId, conversationId: a.conversationId, customerId: b.customerId, messageId: log.id, body: "x", idempotencyKey: "k" }),
      ).rejects.toThrow(/customer not found for this tenant/);
    });
  });
});
