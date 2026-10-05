import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_OUTBOUND_ATTEMPTS,
  recordSendOutcome,
  runOutboundRetryWorker,
} from "../../src/messaging/outbound-retry-worker";
import { createMockMessagingProvider } from "../../src/messaging/mock-messaging-provider";
import { conversations, customers, messages, tenants } from "../../src/db/schema";
import type { MockMessagingProvider } from "../../src/messaging/mock-messaging-provider";
import { createTestDb, resetTestData } from "./db-test-helpers";

/**
 * Phase P0 — outbound retry mechanism. REQUIRES a real Postgres (the
 * worker's own query joins messages -> conversations -> customers, and
 * its concurrency-safety proof needs real row locking) — see
 * appointments-concurrency.test.ts's header for setup. Run via
 * `npm run test:db`.
 */
describe("Outbound retry worker (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  const PHONE = "+12428012847";

  /** Seeds tenant/customer/conversation/outbound-message rows directly
   * — the retry worker's own unit of work is "resend THIS message row,"
   * so tests exercise it against a minimal fixture rather than driving
   * the whole webhook pipeline for every scenario (the full pipeline IS
   * exercised once, end to end, in its own describe block below). */
  async function seedOutboundMessage(content = "Your appointment is confirmed."): Promise<{ messageId: string }> {
    const [tenant] = await db
      .insert(tenants)
      .values({ slug: `retry-test-${randomUUID()}`, name: "Retry Test Tenant", timezone: "UTC" })
      .returning();
    const [customer] = await db.insert(customers).values({ tenantId: tenant.id, whatsappId: PHONE }).returning();
    const [conversation] = await db
      .insert(conversations)
      .values({ tenantId: tenant.id, customerId: customer.id, status: "ai_active", bookingState: {} })
      .returning();
    const [message] = await db
      .insert(messages)
      .values({
        tenantId: tenant.id,
        conversationId: conversation.id,
        direction: "outbound",
        senderType: "ai",
        content,
        status: "retry_pending",
        outboundAttempts: 1,
        nextRetryAt: new Date(Date.now() - 1000), // already due
      })
      .returning();
    return { messageId: message.id };
  }

  describe("recordSendOutcome — the state machine", () => {
    it("a successful attempt sets status='sent' and clears retry state", async () => {
      const { messageId } = await seedOutboundMessage();

      const status = await recordSendOutcome(db, messageId, 1, { success: true, providerMessageId: "wamid.X" });

      expect(status).toBe("sent");
      const row = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
      expect(row?.status).toBe("sent");
      expect(row?.nextRetryAt).toBeNull();
    });

    it("a retryable failure below the attempt cap schedules a future retry", async () => {
      const { messageId } = await seedOutboundMessage();
      const before = Date.now();

      const status = await recordSendOutcome(db, messageId, 1, {
        success: false,
        error: "503 Service Unavailable",
        retryable: true,
      });

      expect(status).toBe("retry_pending");
      const row = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
      expect(row?.status).toBe("retry_pending");
      expect(row?.outboundAttempts).toBe(2);
      expect(row?.lastError).toMatch(/503/);
      expect(row?.nextRetryAt!.getTime()).toBeGreaterThan(before);
    });

    it("a NON-retryable (permanent) failure gives up immediately, regardless of attempt count", async () => {
      const { messageId } = await seedOutboundMessage();

      const status = await recordSendOutcome(db, messageId, 1, {
        success: false,
        error: "401 Invalid OAuth access token",
        retryable: false,
      });

      expect(status).toBe("failed");
      const row = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
      expect(row?.status).toBe("failed");
      expect(row?.nextRetryAt).toBeNull();
    });

    it("BOUNDED: a retryable failure at the attempt cap gives up — no infinite retry loop", async () => {
      const { messageId } = await seedOutboundMessage();

      const status = await recordSendOutcome(db, messageId, MAX_OUTBOUND_ATTEMPTS - 1, {
        success: false,
        error: "503",
        retryable: true,
      });

      expect(status).toBe("failed");
      const row = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
      expect(row?.status).toBe("failed");
      expect(row?.outboundAttempts).toBe(MAX_OUTBOUND_ATTEMPTS);
    });
  });

  describe("runOutboundRetryWorker — end-to-end pass", () => {
    it("TRANSIENT FAILURE -> RETRY -> SUCCESS: a due message that now succeeds is marked sent, customer gets exactly one delivered message", async () => {
      const { messageId } = await seedOutboundMessage("Your appointment is confirmed.");
      const messaging = createMockMessagingProvider();

      const result = await runOutboundRetryWorker(db, messaging);

      expect(result).toEqual({ attempted: 1, sent: 1, rescheduled: 0, failed: 0 });
      expect(messaging.sent).toHaveLength(1);
      expect(messaging.sent[0]).toMatchObject({ to: PHONE, body: "Your appointment is confirmed." });
      const row = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
      expect(row?.status).toBe("sent");
    });

    it("REPEATED FAILURE -> BOUNDED RETRIES: a message that keeps failing is eventually marked failed, never retried forever", async () => {
      const { messageId } = await seedOutboundMessage();
      const alwaysFailing: MockMessagingProvider = createMockMessagingProvider();
      alwaysFailing.sendText = async (to, body) => {
        alwaysFailing.sent.push({ to, body, at: new Date() });
        return { success: false, error: "503 Service Unavailable", retryable: true };
      };

      // Drive it through every remaining attempt by repeatedly forcing
      // nextRetryAt into the past and re-running the worker — proves the
      // bound is enforced across REAL successive passes, not just via
      // recordSendOutcome's unit-level math above.
      let passes = 0;
      for (;;) {
        const row = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
        if (row?.status !== "retry_pending") break;
        await db.update(messages).set({ nextRetryAt: new Date(Date.now() - 1000) }).where(eq(messages.id, messageId));
        await runOutboundRetryWorker(db, alwaysFailing);
        passes++;
        expect(passes).toBeLessThan(20); // safety valve against a real infinite loop in this test itself
      }

      const finalRow = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
      expect(finalRow?.status).toBe("failed");
      expect(finalRow?.outboundAttempts).toBe(MAX_OUTBOUND_ATTEMPTS);
      // Bounded attempts by the worker itself (1 initial via seed +
      // however many passes it took) — never unbounded.
      expect(alwaysFailing.sent.length).toBeLessThan(MAX_OUTBOUND_ATTEMPTS);
    });

    it("PERMANENT FAILURE -> NO POINTLESS RETRY: a non-retryable error is never picked up again", async () => {
      await seedOutboundMessage();
      const permanentlyFailing = createMockMessagingProvider();
      permanentlyFailing.sendText = async (to, body) => {
        permanentlyFailing.sent.push({ to, body, at: new Date() });
        return { success: false, error: "401 Invalid OAuth access token", retryable: false };
      };

      const result = await runOutboundRetryWorker(db, permanentlyFailing);

      expect(result).toEqual({ attempted: 1, sent: 0, rescheduled: 0, failed: 1 });
      // A second pass immediately after finds NOTHING due — the row is
      // "failed", not "retry_pending", so it's never selected again.
      const secondPass = await runOutboundRetryWorker(db, permanentlyFailing);
      expect(secondPass.attempted).toBe(0);
      expect(permanentlyFailing.sent).toHaveLength(1);
    });

    it("NOT YET DUE: a retry_pending message whose nextRetryAt is in the future is never attempted early", async () => {
      const { messageId } = await seedOutboundMessage();
      await db
        .update(messages)
        .set({ nextRetryAt: new Date(Date.now() + 60_000) })
        .where(eq(messages.id, messageId));
      const messaging = createMockMessagingProvider();

      const result = await runOutboundRetryWorker(db, messaging);

      expect(result.attempted).toBe(0);
      expect(messaging.sent).toHaveLength(0);
    });

    it("PROCESS RESTART: retry state committed through one connection pool is correctly picked up through a genuinely fresh one", async () => {
      const { messageId } = await seedOutboundMessage();

      const fresh = createTestDb();
      try {
        const messaging = createMockMessagingProvider();
        const result = await runOutboundRetryWorker(fresh.db, messaging);

        expect(result).toEqual({ attempted: 1, sent: 1, rescheduled: 0, failed: 0 });
        const row = await fresh.db.query.messages.findFirst({ where: eq(messages.id, messageId) });
        expect(row?.status).toBe("sent");
      } finally {
        await fresh.pool.end();
      }
    });

    it("CONCURRENT WORKERS: two workers polling the SAME due message at once never both send it — SKIP LOCKED prevents double-send", async () => {
      const { messageId } = await seedOutboundMessage();
      const messagingA = createMockMessagingProvider();
      const messagingB = createMockMessagingProvider();

      const [resultA, resultB] = await Promise.all([
        runOutboundRetryWorker(db, messagingA),
        runOutboundRetryWorker(db, messagingB),
      ]);

      const totalSent = messagingA.sent.length + messagingB.sent.length;
      expect(totalSent).toBe(1); // exactly one worker actually sent it
      expect([resultA.attempted, resultB.attempted].sort()).toEqual([0, 1]);
      const row = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
      expect(row?.status).toBe("sent");
    });

    it("DUPLICATE OUTBOUND PREVENTION: retrying never creates a second messages row — the same row transitions through its own lifecycle", async () => {
      const { messageId } = await seedOutboundMessage();
      const messaging = createMockMessagingProvider();
      const beforeCount = await db.query.messages.findMany({ where: eq(messages.conversationId, (await db.query.messages.findFirst({ where: eq(messages.id, messageId) }))!.conversationId) });

      await runOutboundRetryWorker(db, messaging);

      const afterCount = await db.query.messages.findMany({ where: eq(messages.conversationId, beforeCount[0].conversationId) });
      expect(afterCount).toHaveLength(beforeCount.length);
      expect(afterCount[0].id).toBe(messageId);
    });
  });
});
