import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, messages, outboxMessages } from "../../src/db/schema";
import { enqueueOutboundMessage, OUTBOX_MAX_ATTEMPTS } from "../../src/messaging/outbox";
import { inspectOutbound } from "../../src/messaging/outbox-inspection";
import { requeueDeadLetter } from "../../src/messaging/outbox-requeue";
import { claimOutboundBatch, deliverClaimed, drainConversation, runOutboxPass } from "../../src/messaging/outbox-worker";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { fakeClock, PERMANENT, queue, ScriptedProvider, seedConversation, TRANSIENT } from "./outbox-helpers";

/** Dead-letter requeue (REQUIRES a real Postgres). `npm run test:db`. */
describe("Dead-letter requeue", () => {
  const { db, pool } = createTestDb();
  beforeEach(async () => resetTestData(db));
  afterAll(async () => {
    await resetTestData(db);
    await pool.end();
  });

  const row = async (id: string) => (await db.query.outboxMessages.findFirst({ where: eq(outboxMessages.id, id) }))!;

  /** Queues a message and drives it to dead_letter via a permanent failure. */
  async function deadLetter(f: Awaited<ReturnType<typeof seedConversation>>, body = "x") {
    const q = await queue(db, f, body);
    await runOutboxPass(db, new ScriptedProvider(() => PERMANENT.invalidRecipient), { conversationId: f.conversationId });
    expect((await row(q.id)).status).toBe("dead_letter");
    return q;
  }

  it("a dead letter is requeued: the SAME row becomes pending with a fresh retry budget, and its history is preserved", async () => {
    const f = await seedConversation(db);
    const q = await deadLetter(f, "important reply");
    const before = await row(q.id);

    const result = await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id, requestedBy: "dr.rolle" });

    expect(result).toEqual({ ok: true, outboxId: q.id, requeueCount: 1, previousAttemptCount: 1, outOfOrder: false });
    const after = await row(q.id);
    // identity preserved: nothing was inserted
    expect(await db.query.outboxMessages.findMany({ where: eq(outboxMessages.conversationId, f.conversationId) })).toHaveLength(1);
    expect(after).toMatchObject({
      id: q.id, idempotencyKey: before.idempotencyKey, messageId: before.messageId, seq: before.seq, payload: before.payload,
      status: "pending", attemptCount: 0, maxAttempts: OUTBOX_MAX_ATTEMPTS, requeueCount: 1,
      failedAt: null, claimToken: null, leaseExpiresAt: null, claimedAt: null,
      // the last failure stays visible until a delivery succeeds
      errorCode: "meta_131026", lastError: before.lastError,
    });
    expect(after.availableAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    // history appended (never overwritten); the stale top-level dead-letter reason is removed
    expect(after.errorMetadata).not.toHaveProperty("deadLetterReason");
    expect((after.errorMetadata as { history: unknown[] }).history).toEqual([
      expect.objectContaining({ event: "requeued", by: "dr.rolle", previousAttemptCount: 1, previousErrorCode: "meta_131026", deadLetterReason: "permanent", previousFailedAt: expect.any(String) }),
    ]);
    // the conversation log mirrors it
    expect(await db.query.messages.findFirst({ where: eq(messages.id, q.messageId) })).toMatchObject({ status: "queued", outboundAttempts: 0, nextRetryAt: null });
    // and an audit trail exists
    const audit = await db.query.auditEvents.findMany({ where: eq(auditEvents.entityId, q.id) });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tenantId: f.tenantId, eventType: "outbox.requeued", entityType: "outbox_message", actorType: "staff", metadata: { requestedBy: "dr.rolle", requeueCount: 1, previousAttemptCount: 1 } });
  });

  it("it can be requeued by the conversation-log message id as well", async () => {
    const f = await seedConversation(db);
    const q = await deadLetter(f);
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, messageId: q.messageId })).toMatchObject({ ok: true, outboxId: q.id });
  });

  it("a requeued message is DELIVERED, exactly once, with a FRESH fencing token and a fresh attempt budget", async () => {
    const f = await seedConversation(db);
    const q = await queue(db, f, "x");
    const [firstClaim] = await claimOutboundBatch(db); // token #1
    expect(firstClaim.id).toBe(q.id);
    // ...that attempt ends in a permanent failure:
    await db.execute(sqlDead(q.id));
    expect((await row(q.id)).status).toBe("dead_letter");

    await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id });
    const provider = new ScriptedProvider();
    const [secondClaim] = await claimOutboundBatch(db);
    expect(secondClaim.claimToken).not.toBe(firstClaim.claimToken);
    expect(secondClaim.attemptCount).toBe(1); // restarted
    await runOutboxPass(db, provider); // nothing left to claim: it is already processing under the second claim
    expect(provider.sends).toHaveLength(0);
    expect(await deliverClaimed(db, provider, secondClaim)).toBe("sent");
    expect(provider.sends).toHaveLength(1);
    expect(await row(q.id)).toMatchObject({ status: "sent", attemptCount: 1, requeueCount: 1, errorCode: null, lastError: null });
    expect((await row(q.id)).errorMetadata).toMatchObject({ history: [expect.objectContaining({ event: "requeued" })] }); // history survives success
  });

  it("a worker that held the PRE-dead-letter claim can never write to the requeued row (fencing)", async () => {
    const f = await seedConversation(db);
    const q = await queue(db, f, "x");
    const t = fakeClock();
    const [oldClaim] = await claimOutboundBatch(db, { clock: t.clock });
    await db.execute(sqlDead(q.id));
    await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id });
    const outcome = await deliverClaimed(db, new ScriptedProvider(), oldClaim, { clock: t.clock });
    expect(outcome).toBe("lost_lease");
    expect(await row(q.id)).toMatchObject({ status: "pending", attemptCount: 0 });
  });

  it("only dead letters can be requeued: every other state is refused and left untouched", async () => {
    const f = await seedConversation(db);
    const t = fakeClock();
    const pending = await queue(db, f, "p");
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: pending.id })).toEqual({ ok: false, reason: "not_dead_letter", currentStatus: "pending" });

    await runOutboxPass(db, new ScriptedProvider(() => TRANSIENT.http503), { clock: t.clock, rng: () => 0.5 });
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: pending.id })).toMatchObject({ reason: "not_dead_letter", currentStatus: "retry_wait" });

    t.advance(30_000);
    const [claimed] = await claimOutboundBatch(db, { clock: t.clock });
    expect(claimed.id).toBe(pending.id);
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: pending.id })).toMatchObject({ reason: "not_dead_letter", currentStatus: "processing" });

    await deliverClaimed(db, new ScriptedProvider(), claimed, { clock: t.clock });
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: pending.id })).toMatchObject({ reason: "not_dead_letter", currentStatus: "sent" });
    expect(await row(pending.id)).toMatchObject({ status: "sent", requeueCount: 0, attemptCount: 2 });
    expect(await db.query.auditEvents.findMany({ where: eq(auditEvents.entityId, pending.id) })).toEqual([]); // no phantom audit
  });

  it("a nonexistent message is reported as not found", async () => {
    const f = await seedConversation(db);
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: "00000000-0000-4000-8000-000000000000" })).toEqual({ ok: false, reason: "not_found" });
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, messageId: "00000000-0000-4000-8000-000000000000" })).toEqual({ ok: false, reason: "not_found" });
    await expect(requeueDeadLetter(db, { tenantId: f.tenantId })).rejects.toThrow(/outboxId or messageId/);
  });

  it("TENANT PROTECTION: another tenant cannot requeue (or even detect) this tenant's dead letter", async () => {
    const a = await seedConversation(db);
    const b = await seedConversation(db);
    const q = await deadLetter(a);
    const attempt = await requeueDeadLetter(db, { tenantId: b.tenantId, outboxId: q.id });
    expect(attempt).toEqual({ ok: false, reason: "not_found" }); // indistinguishable from a nonexistent id
    expect(await requeueDeadLetter(db, { tenantId: b.tenantId, messageId: q.messageId })).toEqual({ ok: false, reason: "not_found" });
    expect(await row(q.id)).toMatchObject({ status: "dead_letter", requeueCount: 0 });
    expect(await requeueDeadLetter(db, { tenantId: a.tenantId, outboxId: q.id })).toMatchObject({ ok: true });
  });

  it("CONCURRENT requeues of one dead letter: exactly one wins, the rest are no-ops, and the history has exactly one entry", async () => {
    const f = await seedConversation(db);
    const q = await deadLetter(f);
    const results = await Promise.all(Array.from({ length: 8 }, () => requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "not_dead_letter")).toBe(true);
    const r = await row(q.id);
    expect(r.requeueCount).toBe(1);
    expect((r.errorMetadata as { history: unknown[] }).history).toHaveLength(1);
    expect(await db.query.auditEvents.findMany({ where: eq(auditEvents.entityId, q.id) })).toHaveLength(1);
  });

  it("REPEATED requeue is a safe no-op; but requeue -> fail again -> requeue works and accumulates history", async () => {
    const f = await seedConversation(db);
    const q = await deadLetter(f);
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id })).toMatchObject({ ok: true, requeueCount: 1 });
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id })).toMatchObject({ ok: false, reason: "not_dead_letter" });
    expect((await row(q.id)).requeueCount).toBe(1);

    await runOutboxPass(db, new ScriptedProvider(() => PERMANENT.badCredentials), { conversationId: f.conversationId }); // dies again
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id, requestedBy: "second-try" })).toMatchObject({ ok: true, requeueCount: 2, previousAttemptCount: 1 });
    const history = (await row(q.id)).errorMetadata as { history: Array<Record<string, unknown>> };
    expect(history.history).toHaveLength(2);
    expect(history.history[0]).toMatchObject({ previousErrorCode: "meta_131026" });
    expect(history.history[1]).toMatchObject({ previousErrorCode: "meta_190", by: "second-try" });
  });

  it("an exhausted message (retries spent) can be requeued and gets a FULL fresh budget", async () => {
    const f = await seedConversation(db);
    const q = await queue(db, f, "x");
    const t = fakeClock();
    for (let i = 0; i < OUTBOX_MAX_ATTEMPTS; i++) {
      await runOutboxPass(db, new ScriptedProvider(() => TRANSIENT.http503), { clock: t.clock, rng: () => 0.5 });
      t.advance(300_000);
    }
    expect(await row(q.id)).toMatchObject({ status: "dead_letter", attemptCount: OUTBOX_MAX_ATTEMPTS });
    expect(await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id, now: t.now() })).toMatchObject({ ok: true, previousAttemptCount: OUTBOX_MAX_ATTEMPTS });
    expect(await row(q.id)).toMatchObject({ status: "pending", attemptCount: 0, maxAttempts: OUTBOX_MAX_ATTEMPTS });
    const provider = new ScriptedProvider(() => TRANSIENT.http503);
    for (let i = 0; i < OUTBOX_MAX_ATTEMPTS; i++) {
      await runOutboxPass(db, provider, { clock: t.clock, rng: () => 0.5 });
      t.advance(300_000);
    }
    expect(provider.sends).toHaveLength(OUTBOX_MAX_ATTEMPTS); // a full second budget, still bounded
    expect((await row(q.id)).status).toBe("dead_letter");
  });

  describe("conversation ordering", () => {
    it("a requeued message goes back to the HEAD of its line: later UNSENT messages wait behind it, then follow in order", async () => {
      const f = await seedConversation(db);
      const a = await deadLetter(f, "A (will be requeued)");
      const b = await queue(db, f, "B");
      const c = await queue(db, f, "C");
      // B and C were queued after A died but have not been delivered yet. Requeue A:
      const r = await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: a.id });
      expect(r).toMatchObject({ ok: true, outOfOrder: false });
      const provider = new ScriptedProvider();
      await drainConversation(db, provider, f.conversationId);
      expect(provider.bodies).toEqual(["A (will be requeued)", "B", "C"]);
      void b; void c;
    });

    it("if later messages were ALREADY SENT (the dead letter had released the line), requeue reports outOfOrder — it cannot un-send them", async () => {
      const f = await seedConversation(db);
      const a = await deadLetter(f, "A");
      await queue(db, f, "B");
      const provider = new ScriptedProvider();
      await drainConversation(db, provider, f.conversationId);
      expect(provider.bodies).toEqual(["B"]); // B went out while A sat dead
      const r = await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: a.id });
      expect(r).toMatchObject({ ok: true, outOfOrder: true });
      await drainConversation(db, provider, f.conversationId);
      expect(provider.bodies).toEqual(["B", "A"]); // honest: delivered, late
    });

    it("a requeued message does not block, and is not blocked by, another conversation", async () => {
      const f1 = await seedConversation(db);
      const f2 = await seedConversation(db);
      const dead = await deadLetter(f1);
      await queue(db, f2, "other conversation");
      await requeueDeadLetter(db, { tenantId: f1.tenantId, outboxId: dead.id });
      const provider = new ScriptedProvider();
      await runOutboxPass(db, provider);
      expect([...provider.bodies].sort()).toEqual(["other conversation", "x"]);
    });
  });

  it("no duplicate rows: re-enqueueing the same logical message after a requeue still resolves to the one row", async () => {
    const f = await seedConversation(db);
    const q = await deadLetter(f);
    await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id });
    const again = await enqueueOutboundMessage(db, { tenantId: f.tenantId, conversationId: f.conversationId, customerId: f.customerId, messageId: q.messageId, body: "x", idempotencyKey: q.key });
    expect(again).toEqual({ id: q.id, deduplicated: true });
    expect(await db.query.outboxMessages.findMany({ where: eq(outboxMessages.conversationId, f.conversationId) })).toHaveLength(1);
  });

  it("the requeue is visible to inspection", async () => {
    const f = await seedConversation(db);
    const q = await deadLetter(f);
    await requeueDeadLetter(db, { tenantId: f.tenantId, outboxId: q.id });
    const d = (await inspectOutbound(db, { outboxId: q.id }))!;
    expect(d).toMatchObject({ status: "pending", requeueCount: 1 });
    expect(d.explanation).toMatch(/Re-queued by an operator \(requeue #1\).*meta_131026/);
  });
});

import { sql } from "drizzle-orm";
/** Forces a row currently `processing` into dead_letter (simulates its worker recording a permanent failure). */
function sqlDead(id: string) {
  return sql`UPDATE outbox_messages SET status='dead_letter', failed_at=now(), claim_token=NULL, lease_expires_at=NULL,
    error_code='meta_131026', last_error='forced', error_metadata=jsonb_build_object('deadLetterReason','permanent') WHERE id=${id}::uuid`;
}
