import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import type { AIProvider, AIProviderResponse } from "../../src/ai/types";
import { auditEvents, conversations, messages, outboxMessages, staffUsers } from "../../src/db/schema";
import { authenticate, createStaffUser, login, logout, MAX_FAILED_LOGINS, LOCKOUT_MS, SESSION_TTL_MS, type StaffIdentity } from "../../src/inbox/auth";
import {
  acceptHandoff, assignConversation, closeConversation, reopenConversation, returnToAi, takeOverConversation,
} from "../../src/inbox/ownership";
import { getConversationDetail, listConversations } from "../../src/inbox/queries";
import { retryFailedStaffMessage, sendStaffReply } from "../../src/inbox/staff-reply";
import { runOutboxPass } from "../../src/messaging/outbox-worker";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { processInboundWhatsAppMessage } from "../../src/whatsapp/webhook-processing";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { queue, ScriptedProvider, seedConversation, type Fixture } from "./outbox-helpers";

/** Phase 3: ownership state machine, AI suppression + races, staff replies, auth, tenant isolation.
 * REQUIRES a real Postgres — run via `npm run test:db`. */
describe("Human handoff & inbox (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  const T0 = new Date("2026-08-20T15:00:00Z");

  beforeEach(async () => { await resetTestData(db); });
  afterAll(async () => { await pool.end(); });

  async function staff(tenantId: string, role: "admin" | "staff", name = `${role}-${randomUUID().slice(0, 4)}`): Promise<StaffIdentity> {
    const { id } = await createStaffUser(db, { tenantId, email: `${name}@example.test`, name, role, password: "correct horse battery" });
    return { staffUserId: id, tenantId, role, name };
  }
  const setStatus = (f: Fixture, status: "ai_active" | "human_pending" | "staff_owned" | "resolved") =>
    db.update(conversations).set({ status }).where(eq(conversations.id, f.conversationId));
  const status = async (f: Fixture) => (await db.query.conversations.findFirst({ where: eq(conversations.id, f.conversationId) }))!;

  describe("state machine", () => {
    it("walks pending → accept → release, takeover → close → reopen with audit and versions", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      await setStatus(f, "human_pending");

      expect((await acceptHandoff(db, a, f.conversationId)).ok).toBe(true);
      let c = await status(f);
      expect(c.status).toBe("staff_owned");
      expect(c.assignedStaffUserId).toBe(a.staffUserId);
      const v1 = c.ownershipVersion;

      expect((await returnToAi(db, a, f.conversationId)).ok).toBe(true);
      c = await status(f);
      expect(c.status).toBe("ai_active");
      expect(c.ownershipVersion).toBeGreaterThan(v1);

      expect((await takeOverConversation(db, a, f.conversationId)).ok).toBe(true);
      expect((await closeConversation(db, a, f.conversationId, "done")).ok).toBe(true);
      expect((await status(f)).status).toBe("resolved");
      expect((await reopenConversation(db, a, f.conversationId)).ok).toBe(true);
      expect((await status(f)).status).toBe("staff_owned"); // reopening staff member owns it; AI stays off until released

      const audit = await db.select().from(auditEvents).where(eq(auditEvents.tenantId, f.tenantId));
      expect(audit.length).toBeGreaterThanOrEqual(5);
    });

    it.each([
      ["accept on ai_active", "ai_active", (d: typeof db, a: StaffIdentity, id: string) => acceptHandoff(d, a, id)],
      ["release on ai_active", "ai_active", (d: typeof db, a: StaffIdentity, id: string) => returnToAi(d, a, id)],
      ["takeover on resolved", "resolved", (d: typeof db, a: StaffIdentity, id: string) => takeOverConversation(d, a, id)],
      ["close on resolved", "resolved", (d: typeof db, a: StaffIdentity, id: string) => closeConversation(d, a, id)],
      ["reopen on ai_active", "ai_active", (d: typeof db, a: StaffIdentity, id: string) => reopenConversation(d, a, id)],
      ["assign on resolved", "resolved", (d: typeof db, a: StaffIdentity, id: string) => assignConversation(d, a, id, a.staffUserId)],
    ] as const)("rejects %s without changing anything", async (_n, from, op) => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "admin");
      await setStatus(f, from);
      const r = await op(db, a, f.conversationId);
      expect(r.ok).toBe(false);
      expect((await status(f)).status).toBe(from);
    });

    it("only one of two concurrent takeovers wins; the loser is told, not silently overridden", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      const b = await staff(f.tenantId, "staff");
      const [ra, rb] = await Promise.all([takeOverConversation(db, a, f.conversationId), takeOverConversation(db, b, f.conversationId)]);
      expect([ra.ok, rb.ok].filter(Boolean)).toHaveLength(1);
      const owner = (await status(f)).assignedStaffUserId;
      expect(owner).toBe(ra.ok ? a.staffUserId : b.staffUserId);
    });

    it("a stale expectedVersion is refused", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      const r = await takeOverConversation(db, a, f.conversationId, { expectedVersion: 99 });
      expect(r).toMatchObject({ ok: false, reason: "stale" });
    });

    it("non-admin cannot take over or close another staff member's conversation; admin can", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      const b = await staff(f.tenantId, "staff");
      const admin = await staff(f.tenantId, "admin");
      await takeOverConversation(db, a, f.conversationId);
      expect(await takeOverConversation(db, b, f.conversationId)).toMatchObject({ ok: false, reason: "forbidden" });
      expect(await closeConversation(db, b, f.conversationId)).toMatchObject({ ok: false, reason: "forbidden" });
      expect((await takeOverConversation(db, admin, f.conversationId)).ok).toBe(true);
      expect((await status(f)).assignedStaffUserId).toBe(admin.staffUserId);
    });

    it("assignment: staff may only self-assign; assignee must be an active member of the same tenant", async () => {
      const f = await seedConversation(db);
      const other = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      const b = await staff(f.tenantId, "staff");
      const admin = await staff(f.tenantId, "admin");
      const foreign = await staff(other.tenantId, "staff");
      expect(await assignConversation(db, a, f.conversationId, b.staffUserId)).toMatchObject({ ok: false, reason: "forbidden" });
      expect(await assignConversation(db, admin, f.conversationId, foreign.staffUserId)).toMatchObject({ ok: false, reason: "invalid_assignee" });
      expect((await assignConversation(db, admin, f.conversationId, b.staffUserId)).ok).toBe(true);
      const c = await status(f);
      expect(c.status).toBe("staff_owned");
      expect(c.assignedStaffUserId).toBe(b.staffUserId);
    });

    it("reopening is refused when the customer already has another active conversation", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      await setStatus(f, "resolved");
      await db.insert(conversations).values({ tenantId: f.tenantId, customerId: f.customerId });
      expect(await reopenConversation(db, a, f.conversationId)).toMatchObject({ ok: false, reason: "customer_has_active_conversation" });
    });
  });

  describe("tenant isolation (no existence leaks)", () => {
    it("another tenant's conversation is 'not_found' for every operation, identical to a nonexistent id", async () => {
      const mine = await seedConversation(db);
      const theirs = await seedConversation(db);
      const me = await staff(mine.tenantId, "admin");
      const ghost = randomUUID();
      for (const id of [theirs.conversationId, ghost]) {
        expect(await takeOverConversation(db, me, id)).toEqual({ ok: false, reason: "not_found" });
        expect(await closeConversation(db, me, id)).toEqual({ ok: false, reason: "not_found" });
        expect(await sendStaffReply(db, me, id, { body: "hi", clientMessageId: "client-id-0001" })).toMatchObject({ ok: false, reason: "not_found" });
        expect(await getConversationDetail(db, me, id)).toBeNull();
      }
      expect((await listConversations(db, me)).conversations.map((c) => c.id)).toEqual([mine.conversationId]);
      expect((await status(theirs)).status).toBe("ai_active");
    });

    it("search never matches another tenant's data", async () => {
      const mine = await seedConversation(db);
      const theirs = await seedConversation(db);
      await db.insert(messages).values({ tenantId: theirs.tenantId, conversationId: theirs.conversationId, direction: "inbound", senderType: "customer", content: "secret-needle" });
      const me = await staff(mine.tenantId, "staff");
      expect((await listConversations(db, me, { q: "secret-needle" })).conversations).toHaveLength(0);
    });
  });

  describe("AI suppression", () => {
    function countingAgent() {
      const inner = new DevRuleBasedAIProvider();
      let calls = 0;
      const provider: AIProvider = { generateResponse: (...a) => { calls++; return inner.generateResponse(...a); } };
      return { agent: new ReceptionistAgent(provider, createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db)), calls: () => calls };
    }
    const inbound = (phone: string, message: string) => ({ phone, message, whatsappMessageId: `wamid.${randomUUID()}` });

    for (const owned of ["human_pending", "staff_owned"] as const) {
      it(`while ${owned}: customer message is kept, no AI call, no reply, no outbox row, conversation surfaced`, async () => {
        const { agent, calls } = countingAgent();
        const phone = "+12428015550";
        const first = await processInboundWhatsAppMessage({ db, business: BAHAMAS_DENTAL_SERVICE, agent }, inbound(phone, "hi"));
        await db.update(conversations).set({ status: owned }).where(eq(conversations.id, first.conversationId));
        const before = calls();
        const outboxBefore = (await db.select().from(outboxMessages)).length;

        const r = await processInboundWhatsAppMessage({ db, business: BAHAMAS_DENTAL_SERVICE, agent }, inbound(phone, "are you there?"));
        expect(r.suppressedByHuman).toBe(true);
        expect(r.reply).toBeNull();
        expect(calls()).toBe(before);
        expect((await db.select().from(outboxMessages)).length).toBe(outboxBefore);
        const msgs = await db.query.messages.findMany({ where: eq(messages.conversationId, first.conversationId) });
        expect(msgs.some((m) => m.content === "are you there?" && m.direction === "inbound")).toBe(true);
        const c = await status({ conversationId: first.conversationId } as Fixture);
        expect(c.status).toBe(owned);
        expect(c.waitingSince).not.toBeNull();
      });
    }

    it("a duplicate delivery during human ownership is still deduplicated", async () => {
      const { agent } = countingAgent();
      const phone = "+12428015551";
      const first = await processInboundWhatsAppMessage({ db, business: BAHAMAS_DENTAL_SERVICE, agent }, inbound(phone, "hi"));
      await db.update(conversations).set({ status: "staff_owned" }).where(eq(conversations.id, first.conversationId));
      const m = inbound(phone, "again");
      await processInboundWhatsAppMessage({ db, business: BAHAMAS_DENTAL_SERVICE, agent }, m);
      const dup = await processInboundWhatsAppMessage({ db, business: BAHAMAS_DENTAL_SERVICE, agent }, m);
      expect(dup.wasDuplicate).toBe(true);
      const rows = await db.query.messages.findMany({ where: and(eq(messages.conversationId, first.conversationId), eq(messages.content, "again")) });
      expect(rows).toHaveLength(1);
    });

    it("RACE: a takeover that lands while the LLM is thinking prevents the reply from being queued", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let entered!: () => void;
      const started = new Promise<void>((r) => (entered = r));
      const inner = new DevRuleBasedAIProvider();
      const provider: AIProvider = {
        async generateResponse(...a): Promise<AIProviderResponse> { entered(); await gate; return inner.generateResponse(...a); },
      };
      const agent = new ReceptionistAgent(provider, createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db));
      const phone = "+12428015552";

      const pending = processInboundWhatsAppMessage({ db, business: BAHAMAS_DENTAL_SERVICE, agent }, inbound(phone, "hello there"));
      await started;
      const conv = (await db.query.conversations.findFirst())!;
      const me = await staff(conv.tenantId, "staff");
      expect((await takeOverConversation(db, me, conv.id)).ok).toBe(true); // must not block on the LLM
      release();
      const r = await pending;

      expect(r.reply).toBeNull();
      expect(r.suppressedByHuman).toBe(true);
      expect(await db.select().from(outboxMessages)).toHaveLength(0);
      const msgs = await db.query.messages.findMany({ where: eq(messages.conversationId, conv.id) });
      expect(msgs.filter((m) => m.direction === "outbound" && m.status !== "suppressed")).toHaveLength(0);
      expect((await status({ conversationId: conv.id } as Fixture)).status).toBe("staff_owned");
    });

    it("AUDIT: takeover then release while the LLM is thinking (A→B→A) still suppresses the stale reply", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let entered!: () => void;
      const started = new Promise<void>((r) => (entered = r));
      const inner = new DevRuleBasedAIProvider();
      const provider: AIProvider = { async generateResponse(...a): Promise<AIProviderResponse> { entered(); await gate; return inner.generateResponse(...a); } };
      const agent = new ReceptionistAgent(provider, createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db));
      const pending = processInboundWhatsAppMessage({ db, business: BAHAMAS_DENTAL_SERVICE, agent }, inbound("+12428015560", "hello"));
      await started;
      const conv = (await db.query.conversations.findFirst())!;
      const me = await staff(conv.tenantId, "staff");
      await takeOverConversation(db, me, conv.id);
      await sendStaffReply(db, me, conv.id, { body: "I'm on it", clientMessageId: "client-id-6001" });
      await returnToAi(db, me, conv.id);
      release();
      const r = await pending;
      expect(r.reply).toBeNull();
      expect(r.suppressedByHuman).toBe(true);
      const ai = await db.select().from(outboxMessages).where(eq(outboxMessages.origin, "ai"));
      expect(ai).toHaveLength(0);
      expect((await status({ conversationId: conv.id } as Fixture)).status).toBe("ai_active");
    });

    it("an AI reply already in the outbox is withdrawn on takeover and never sent", async () => {
      const f = await seedConversation(db);
      const me = await staff(f.tenantId, "staff");
      const q = await queue(db, f, "AI draft");
      const r = await takeOverConversation(db, me, f.conversationId);
      expect(r).toMatchObject({ ok: true, withdrawnAiReplies: 1 });
      const provider = new ScriptedProvider();
      await runOutboxPass(db, provider, { clock: () => new Date(Date.now() + 60_000) });
      expect(provider.sends).toHaveLength(0);
      const ob = await db.query.outboxMessages.findFirst({ where: eq(outboxMessages.messageId, q.messageId) });
      expect(ob?.status).toBe("cancelled");
    });

    it("worker never delivers an AI-origin message for a staff-owned conversation even if its row slipped through", async () => {
      const f = await seedConversation(db);
      await queue(db, f, "stale AI draft");
      await setStatus(f, "staff_owned"); // bypass withdrawal on purpose
      const provider = new ScriptedProvider();
      await runOutboxPass(db, provider, {});
      expect(provider.sends).toHaveLength(0);
    });

    it("AUDIT: an AI row stranded mid-send (crashed worker) is cancelled on takeover handling and does not block staff replies; it is not claimed as 'not sent'", async () => {
      const f = await seedConversation(db);
      const me = await staff(f.tenantId, "staff");
      const q = await queue(db, f, "AI draft whose worker crashed");
      await db.update(outboxMessages).set({ status: "processing", attemptCount: 1, claimToken: randomUUID(), leaseExpiresAt: new Date(Date.now() - 60_000) }).where(eq(outboxMessages.messageId, q.messageId));
      await takeOverConversation(db, me, f.conversationId);
      await sendStaffReply(db, me, f.conversationId, { body: "staff answer", clientMessageId: "client-id-7001" });
      const provider = new ScriptedProvider();
      await runOutboxPass(db, provider, { clock: () => new Date(Date.now() + 5_000) });
      expect(provider.bodies).toEqual(["staff answer"]);
      const ob = await db.query.outboxMessages.findFirst({ where: eq(outboxMessages.messageId, q.messageId) });
      expect(ob?.status).toBe("cancelled");
      // truthfulness: an earlier attempt may have reached Meta, and the record says so
      expect(JSON.stringify(ob?.errorMetadata)).toContain("priorAttempts");
    });

    it("AUDIT: withdrawing a retry_wait AI row records that earlier attempts may have been delivered", async () => {
      const f = await seedConversation(db);
      const me = await staff(f.tenantId, "staff");
      const q = await queue(db, f, "AI draft after a timeout");
      await db.update(outboxMessages).set({ status: "retry_wait", attemptCount: 1 }).where(eq(outboxMessages.messageId, q.messageId));
      await takeOverConversation(db, me, f.conversationId);
      const d = await getConversationDetail(db, me, f.conversationId);
      const m = d!.messages.find((x) => x.id === q.messageId)!;
      expect(m.delivery).toMatchObject({ state: "withdrawn", mayHaveBeenDelivered: true });
      // a never-attempted row withdrawn by the same takeover is truthfully "not sent"
      const f2 = await seedConversation(db, f.tenantId);
      const never = await queue(db, f2, "never attempted");
      await takeOverConversation(db, me, f2.conversationId);
      const d2 = await getConversationDetail(db, me, f2.conversationId);
      expect(d2!.messages.find((x) => x.id === never.messageId)!.delivery).toMatchObject({ state: "withdrawn", mayHaveBeenDelivered: false });
    });

    it("after return-to-AI the next customer message is answered again", async () => {
      const { agent } = countingAgent();
      const phone = "+12428015553";
      const first = await processInboundWhatsAppMessage({ db, business: BAHAMAS_DENTAL_SERVICE, agent }, inbound(phone, "hi"));
      const conv = (await db.query.conversations.findFirst({ where: eq(conversations.id, first.conversationId) }))!;
      const me = await staff(conv.tenantId, "staff");
      await takeOverConversation(db, me, conv.id);
      await returnToAi(db, me, conv.id);
      const r = await processInboundWhatsAppMessage({ db, business: BAHAMAS_DENTAL_SERVICE, agent }, inbound(phone, "hi again"));
      expect(r.suppressedByHuman).toBeFalsy();
      expect(r.reply).not.toBeNull();
    });
  });

  describe("staff replies via the durable outbox", () => {
    it("requires ownership; persists message + outbox row atomically; delivers through the worker", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      const b = await staff(f.tenantId, "staff");
      expect(await sendStaffReply(db, a, f.conversationId, { body: "hello", clientMessageId: "client-id-0001" })).toMatchObject({ ok: false, reason: "invalid_transition" });
      await takeOverConversation(db, a, f.conversationId);
      expect(await sendStaffReply(db, b, f.conversationId, { body: "hello", clientMessageId: "client-id-0001" })).toMatchObject({ ok: false, reason: "forbidden" });

      const r = await sendStaffReply(db, a, f.conversationId, { body: "  Hi, this is Anna  ", clientMessageId: "client-id-0002" });
      expect(r.ok).toBe(true);
      const ob = await db.query.outboxMessages.findFirst({ where: eq(outboxMessages.conversationId, f.conversationId) });
      expect(ob).toMatchObject({ origin: "staff", status: "pending", messageId: (r as { messageId: string }).messageId });
      const provider = new ScriptedProvider();
      await runOutboxPass(db, provider, { clock: () => new Date(Date.now() + 60_000) });
      expect(provider.bodies).toEqual(["Hi, this is Anna"]);
      const msg = await db.query.messages.findFirst({ where: eq(messages.id, (r as { messageId: string }).messageId) });
      expect(msg).toMatchObject({ content: "Hi, this is Anna", senderType: "staff", authorStaffUserId: a.staffUserId });
    });

    it("double-submit with the same clientMessageId creates one message and one outbox row", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      await takeOverConversation(db, a, f.conversationId);
      const input = { body: "once", clientMessageId: "client-id-0003" };
      const [r1, r2] = await Promise.all([sendStaffReply(db, a, f.conversationId, input), sendStaffReply(db, a, f.conversationId, input)]);
      expect(r1.ok && r2.ok).toBe(true);
      expect(await db.select().from(outboxMessages).where(eq(outboxMessages.conversationId, f.conversationId))).toHaveLength(1);
      expect(await db.query.messages.findMany({ where: and(eq(messages.conversationId, f.conversationId), eq(messages.senderType, "staff")) })).toHaveLength(1);
    });

    it("same clientMessageId with different text is a conflict, not a silent overwrite", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      await takeOverConversation(db, a, f.conversationId);
      await sendStaffReply(db, a, f.conversationId, { body: "one", clientMessageId: "client-id-0004" });
      expect(await sendStaffReply(db, a, f.conversationId, { body: "two", clientMessageId: "client-id-0004" })).toMatchObject({ ok: false, reason: "idempotency_conflict" });
    });

    it("rejects empty, oversized and malformed input without side effects", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      await takeOverConversation(db, a, f.conversationId);
      expect(await sendStaffReply(db, a, f.conversationId, { body: "   ", clientMessageId: "client-id-0005" })).toMatchObject({ reason: "invalid_body" });
      expect(await sendStaffReply(db, a, f.conversationId, { body: "x".repeat(4097), clientMessageId: "client-id-0005" })).toMatchObject({ reason: "invalid_body" });
      expect(await sendStaffReply(db, a, f.conversationId, { body: "ok", clientMessageId: "x" })).toMatchObject({ reason: "invalid_client_id" });
      expect(await db.select().from(outboxMessages)).toHaveLength(0);
    });

    it("preserves send order; failures are reported truthfully and are retryable by the owner", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      const b = await staff(f.tenantId, "staff");
      await takeOverConversation(db, a, f.conversationId);
      const first = await sendStaffReply(db, a, f.conversationId, { body: "first", clientMessageId: "client-id-0006" });
      await sendStaffReply(db, a, f.conversationId, { body: "second", clientMessageId: "client-id-0007" });
      const failing = new ScriptedProvider(() => ({ success: false, retryable: false, error: "bad number" }) as never);
      await runOutboxPass(db, failing, { clock: () => new Date(Date.now() + 60_000) });

      const detail = await getConversationDetail(db, a, f.conversationId);
      const mine = detail!.messages.filter((m) => m.senderType === "staff");
      expect(mine[0].delivery?.state).toBe("failed");
      expect(mine[0].delivery?.retryable).toBe(true);

      expect(await retryFailedStaffMessage(db, b, f.conversationId, (first as { messageId: string }).messageId)).toMatchObject({ ok: false, reason: "forbidden" });
      expect((await retryFailedStaffMessage(db, a, f.conversationId, (first as { messageId: string }).messageId)).ok).toBe(true);
      const ok = new ScriptedProvider();
      await runOutboxPass(db, ok, { clock: () => new Date(Date.now() + 120_000) });
      expect(ok.bodies[0]).toBe("first");
    });

    it("a reply submitted after the conversation was released is refused", async () => {
      const f = await seedConversation(db);
      const a = await staff(f.tenantId, "staff");
      await takeOverConversation(db, a, f.conversationId);
      await returnToAi(db, a, f.conversationId);
      expect(await sendStaffReply(db, a, f.conversationId, { body: "late", clientMessageId: "client-id-0008" })).toMatchObject({ ok: false, reason: "invalid_transition" });
      expect(await db.select().from(outboxMessages)).toHaveLength(0);
    });
  });

  describe("auth", () => {
    it("logs in, authenticates, expires, logs out; failures are indistinguishable; lockout works", async () => {
      const f = await seedConversation(db);
      const tenant = (await db.query.tenants.findFirst())!;
      const a = await staff(f.tenantId, "staff", "anna");
      const creds = { tenant: tenant.slug, email: "anna@example.test", password: "correct horse battery" };

      const ok = await login(db, creds, T0);
      expect(ok.ok).toBe(true);
      const token = (ok as { token: string }).token;
      expect(await authenticate(db, token, T0)).toMatchObject({ staffUserId: a.staffUserId, tenantId: f.tenantId });
      expect(await authenticate(db, token, new Date(T0.getTime() + SESSION_TTL_MS + 1))).toBeNull();
      expect(await authenticate(db, undefined, T0)).toBeNull();
      await logout(db, token, T0);
      expect(await authenticate(db, token, T0)).toBeNull();

      const wrongPw = await login(db, { ...creds, password: "nope-nope-nope" }, T0);
      const wrongUser = await login(db, { ...creds, email: "ghost@example.test" }, T0);
      const wrongTenant = await login(db, { ...creds, tenant: "nonexistent" }, T0);
      expect(wrongPw).toEqual(wrongUser);
      expect(wrongUser).toEqual(wrongTenant);

      for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login(db, { ...creds, password: "bad-bad-bad-bad" }, T0);
      expect((await login(db, creds, T0)).ok).toBe(false); // locked even with the right password
      expect((await login(db, creds, new Date(T0.getTime() + LOCKOUT_MS + 1))).ok).toBe(true);
    });

    it("AUDIT: parallel wrong guesses are all counted — the lockout cannot be dodged by concurrency", async () => {
      const f = await seedConversation(db);
      const tenant = (await db.query.tenants.findFirst())!;
      await staff(f.tenantId, "staff", "bruno");
      const creds = { tenant: tenant.slug, email: "bruno@example.test", password: "correct horse battery" };
      await Promise.all(Array.from({ length: MAX_FAILED_LOGINS }, () => login(db, { ...creds, password: "wrong-wrong-wrong" }, T0)));
      expect((await login(db, creds, T0)).ok).toBe(false); // locked despite the right password
    });

    it("rejects weak passwords and never stores one in plaintext", async () => {
      const f = await seedConversation(db);
      await expect(createStaffUser(db, { tenantId: f.tenantId, email: "w@example.test", name: "W", role: "staff", password: "short" })).rejects.toThrow();
      const s = await staff(f.tenantId, "staff");
      const row = await db.query.staffUsers.findFirst({ where: eq(staffUsers.id, s.staffUserId) });
      expect(row?.passwordHash).toBeTruthy();
      expect(row?.passwordHash).not.toContain("correct horse");
    });
  });
});
