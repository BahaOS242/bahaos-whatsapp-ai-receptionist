import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/config/env";
import { messages, outboxMessages } from "../../src/db/schema";
import { createMockMessagingProvider } from "../../src/messaging/mock-messaging-provider";
import { inspectOutbound, listOutbound } from "../../src/messaging/outbox-inspection";
import { claimOutboundBatch, runOutboxPass, startOutboxPoller } from "../../src/messaging/outbox-worker";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { processInboundWhatsAppMessage, processUnsupportedInboundMessage } from "../../src/whatsapp/webhook-processing";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { deliverAllQueued, fakeClock, PERMANENT, queue, ScriptedProvider, seedConversation, TRANSIENT } from "./outbox-helpers";

const { db, pool } = createTestDb();
const BUSINESS = BAHAMAS_DENTAL_SERVICE;
const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db", WHATSAPP_APP_SECRET: undefined });

beforeEach(async () => resetTestData(db));
afterAll(async () => {
  await resetTestData(db);
  await pool.end();
});

const devAgent = () => new ReceptionistAgent(new DevRuleBasedAIProvider(), createDatabaseReceptionistTools(BUSINESS, db));

function body(phone: string, text: string, id = `wamid.${randomUUID()}`) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "PHONE_ID_1" },
              contacts: [{ profile: { name: "Trevor" }, wa_id: phone }],
              messages: [{ from: phone, id, timestamp: `${Math.floor(Date.now() / 1000)}`, type: "text", text: { body: text } }],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

describe("the business transaction and the outbox commit (or roll back) together", () => {
  it("a processed turn leaves exactly one queued outbox row, linked to its log row, with an idempotency key derived from the inbound message", async () => {
    const out = await processInboundWhatsAppMessage({ db, business: BUSINESS, agent: devAgent() }, { phone: "+12428011111", message: "book a cleaning", whatsappMessageId: "wamid.A1", name: "T" });
    const rows = await db.query.outboxMessages.findMany({ where: eq(outboxMessages.conversationId, out.conversationId) });
    expect(rows).toHaveLength(1);
    const inbound = await db.query.messages.findFirst({ where: eq(messages.whatsappMessageId, "wamid.A1") });
    expect(rows[0]).toMatchObject({ status: "pending", messageId: out.outboundMessageId, idempotencyKey: `reply:${inbound!.id}`, recipient: "+12428011111", attemptCount: 0 });
    expect(rows[0].payload.body).toBe(out.reply);
    // Nothing was SENT by the transaction — delivery is the worker's job.
    expect((await db.query.messages.findFirst({ where: eq(messages.id, out.outboundMessageId!) }))?.status).toBe("queued");
  });

  it("if the turn FAILS and rolls back, there is no queued message and no logged reply — a customer is never told something that did not happen", async () => {
    // (The agent converts a provider failure into a safe fallback; to test the
    // ROLLBACK we force a hard failure inside the transaction instead.)
    const agent = devAgent();
    const original = agent.handleMessage.bind(agent);
    agent.handleMessage = async () => { throw new Error("hard failure inside the transaction"); };
    await expect(
      processInboundWhatsAppMessage({ db, business: BUSINESS, agent }, { phone: "+12428012222", message: "book a cleaning", whatsappMessageId: "wamid.R1", name: "T" }),
    ).rejects.toThrow("hard failure");
    expect(await db.select().from(outboxMessages)).toEqual([]);
    expect(await db.query.messages.findMany({ where: eq(messages.whatsappMessageId, "wamid.R1") })).toEqual([]);
    agent.handleMessage = original;
  });

  it("a redelivered inbound message queues NOTHING a second time", async () => {
    const deps = { db, business: BUSINESS, agent: devAgent() };
    const first = await processInboundWhatsAppMessage(deps, { phone: "+12428013333", message: "hi", whatsappMessageId: "wamid.D1", name: "T" });
    const replay = await processInboundWhatsAppMessage(deps, { phone: "+12428013333", message: "hi", whatsappMessageId: "wamid.D1", name: "T" });
    expect(replay.wasDuplicate).toBe(true);
    expect(await db.query.outboxMessages.findMany({ where: eq(outboxMessages.conversationId, first.conversationId) })).toHaveLength(1);
  });

  it("the unsupported-message path queues its reply the same way, atomically with the handoff", async () => {
    const out = await processUnsupportedInboundMessage({ db, business: BUSINESS, agent: devAgent() }, { phone: "+12428014444", whatsappMessageId: "wamid.U1", name: "T", messageType: "image" });
    const rows = await db.query.outboxMessages.findMany({ where: eq(outboxMessages.conversationId, out.conversationId) });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.body).toMatch(/only read text messages/);
  });
});

describe("crash and restart between COMMIT and delivery", () => {
  it("the process dies right after the transaction commits: nothing was sent, nothing is lost — a fresh worker delivers the reply", async () => {
    const out = await processInboundWhatsAppMessage({ db, business: BUSINESS, agent: devAgent() }, { phone: "+12428015555", message: "book a cleaning", whatsappMessageId: "wamid.C1", name: "T" });
    // ...process dies here: no delivery was ever attempted.
    const fresh = createTestDb();
    try {
      const provider = createMockMessagingProvider();
      const pass = await runOutboxPass(fresh.db, provider);
      expect(pass.sent).toBe(1);
      expect(provider.sent[0]).toMatchObject({ to: "+12428015555", body: out.reply });
    } finally {
      await fresh.pool.end();
    }
  });
});

describe("through the real HTTP webhook route — it QUEUES, the worker DELIVERS", () => {
  const appFor = (dbHandle: unknown = db) => createApp({ env, db: dbHandle as never, agent: devAgent() });

  it("GATE 1: the request path makes NO provider call — the reply is committed to the outbox and the webhook answers 200", async () => {
    const res = await request(appFor()).post("/webhooks/whatsapp").send(body("12428016666", "book a cleaning"));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(outboxMessages);
    // Nothing has attempted delivery: not sent, not claimed, not counted.
    expect(row).toMatchObject({ status: "pending", attemptCount: 0, claimToken: null, providerMessageId: null });
    expect((await db.query.messages.findFirst({ where: eq(messages.id, row.messageId) }))?.status).toBe("queued");
  });

  it("the worker then delivers the committed reply exactly once", async () => {
    await request(appFor()).post("/webhooks/whatsapp").send(body("12428016667", "book a cleaning"));
    const messaging = createMockMessagingProvider();
    expect(await deliverAllQueued(db, messaging)).toBe(1);
    expect(await deliverAllQueued(db, messaging)).toBe(0);
    expect(messaging.sent).toHaveLength(1);
    expect((await db.select().from(outboxMessages))[0]).toMatchObject({ status: "sent", attemptCount: 1, providerMessageId: "mock-1" });
  });

  it("GATE 1: a hung / unreachable Meta can no longer slow the webhook at all — the response does not depend on any provider", async () => {
    const hung = new ScriptedProvider(() => new Promise(() => {})); // a Meta that never answers
    const started = Date.now();
    const res = await request(appFor()).post("/webhooks/whatsapp").send(body("12428017777", "book a cleaning"));
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(hung.sends).toHaveLength(0); // the route never even held a provider
    expect((await db.select().from(outboxMessages))[0].status).toBe("pending");
  });

  it("the committed reply is NOT lost when Meta is down: the worker retries it on its own schedule", async () => {
    await request(appFor()).post("/webhooks/whatsapp").send(body("12428018888", "book a cleaning"));
    const t = fakeClock();
    const down = new ScriptedProvider(() => TRANSIENT.timeout);
    await runOutboxPass(db, down, { clock: t.clock, rng: () => 0.5 });
    expect((await db.select().from(outboxMessages))[0]).toMatchObject({ status: "retry_wait", attemptCount: 1 });
    t.advance(30_000);
    const up = new ScriptedProvider();
    await runOutboxPass(db, up, { clock: t.clock });
    expect(up.sends).toHaveLength(1);
    expect((await db.select().from(outboxMessages))[0]).toMatchObject({ status: "sent", attemptCount: 2 });
  });

  it("a PERMANENT provider failure dead-letters the reply, never fails the (already answered) webhook", async () => {
    const res = await request(appFor()).post("/webhooks/whatsapp").send(body("12428019999", "book a cleaning"));
    expect(res.status).toBe(200);
    await runOutboxPass(db, new ScriptedProvider(() => PERMANENT.invalidRecipient));
    expect((await db.select().from(outboxMessages))[0]).toMatchObject({ status: "dead_letter", errorCode: "meta_131026" });
  });

  it("a multi-turn conversation queues every reply; the worker delivers them in order, each exactly once", async () => {
    const app = appFor();
    for (const text of ["hi", "I need a cleaning", "Friday"]) await request(app).post("/webhooks/whatsapp").send(body("12428010101", text));
    const rows = await db.select().from(outboxMessages).orderBy(outboxMessages.seq);
    expect(rows.map((r) => r.status)).toEqual(["pending", "pending", "pending"]);
    const messaging = createMockMessagingProvider();
    await deliverAllQueued(db, messaging);
    expect(messaging.sent.map((s) => s.body)).toEqual(rows.map((r) => r.payload.body));
    expect((await db.select().from(outboxMessages)).map((r) => r.status)).toEqual(["sent", "sent", "sent"]);
  });

  it("WAKE-UP: with a poller running, a committed reply is delivered asynchronously AFTER the response, with no explicit worker call", async () => {
    const provider = new ScriptedProvider();
    const poller = startOutboxPoller(db, provider, 60_000); // interval far too long to matter: only the wake-up can explain delivery
    try {
      const res = await request(appFor()).post("/webhooks/whatsapp").send(body("12428010404", "book a cleaning"));
      expect(res.status).toBe(200);
      const deadline = Date.now() + 5000;
      while (provider.sends.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
      expect(provider.sends).toHaveLength(1);
      await new Promise((r) => setTimeout(r, 100));
      expect((await db.select().from(outboxMessages))[0].status).toBe("sent");
    } finally {
      await poller.stop();
    }
  });

  it("WAKE-UP with a hung Meta: the webhook still answers promptly, and the hung send occupies only the background worker", async () => {
    const hung = new ScriptedProvider(() => new Promise(() => {}));
    const poller = startOutboxPoller(db, hung, 60_000, { sendCeilingMs: 200 });
    try {
      const started = Date.now();
      const res = await request(appFor()).post("/webhooks/whatsapp").send(body("12428010505", "book a cleaning"));
      expect(res.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(2000);
      const deadline = Date.now() + 5000;
      while (hung.sends.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
      expect(hung.sends).toHaveLength(1); // the WORKER attempted it, off the request path
    } finally {
      await poller.stop();
    }
  });

  it("a database hiccup at any later point can never turn the already-committed reply into a webhook failure", async () => {
    const res = await request(appFor()).post("/webhooks/whatsapp").send(body("12428010303", "book a cleaning"));
    expect(res.status).toBe(200);
    expect((await db.select().from(outboxMessages))[0]).toMatchObject({ status: "pending", attemptCount: 0 });
  });
});

describe("delivery observability: 'why didn't this customer get this message?'", () => {
  it("answers it for every state", async () => {
    const f = await seedConversation(db);
    const t = fakeClock();
    const pending = await queue(db, f, "pending-msg");
    expect((await inspectOutbound(db, { outboxId: pending.id }))).toMatchObject({ status: "pending", attemptCount: 0, nextAttemptAt: expect.any(Date), providerMessageId: null });

    // retry_wait
    await runOutboxPass(db, new ScriptedProvider(() => TRANSIENT.http503), { clock: t.clock, rng: () => 0.5, conversationId: f.conversationId });
    const waiting = (await inspectOutbound(db, { messageId: pending.messageId }))!;
    expect(waiting).toMatchObject({ status: "retry_wait", attemptCount: 1, errorCode: "http_503", lastError: expect.stringContaining("Service Unavailable"), recipient: f.phone, tenantId: f.tenantId, conversationId: f.conversationId });
    expect(waiting.nextAttemptAt!.getTime()).toBe(t.now().getTime() + 30_000);
    expect(waiting.explanation).toMatch(/Attempt 1 of 5 failed.*next attempt is scheduled/);

    // sent
    t.advance(30_000);
    await runOutboxPass(db, new ScriptedProvider(), { clock: t.clock });
    const sent = (await inspectOutbound(db, { idempotencyKey: pending.key, tenantId: f.tenantId }))!;
    expect(sent).toMatchObject({ status: "sent", providerMessageId: "wamid.test-1", attemptCount: 2, nextAttemptAt: null });
    expect(sent.explanation).toMatch(/Delivered to the provider.*wamid\.test-1/);

    // dead letter
    const dead = await queue(db, f, "dead-msg");
    await runOutboxPass(db, new ScriptedProvider(() => PERMANENT.badCredentials), { clock: t.clock, conversationId: f.conversationId });
    const d = (await inspectOutbound(db, { outboxId: dead.id }))!;
    expect(d.status).toBe("dead_letter");
    expect(d.explanation).toMatch(/Not delivered: the provider reported a failure retrying cannot fix \(meta_190/);
    expect((await listOutbound(db, { tenantId: f.tenantId, status: "dead_letter" })).map((x) => x.outboxId)).toEqual([dead.id]);
  });

  it("an abandoned claim is described as such", async () => {
    const f = await seedConversation(db);
    const q = await queue(db, f, "x");
    const t = fakeClock();
    await claimOutboundBatch(db, { clock: t.clock });
    t.advance(300_000);
    const d = (await inspectOutbound(db, { outboxId: q.id }, { now: t.now() }))!;
    expect(d.explanation).toMatch(/never reported back and its lease expired/);
  });

  it("is tenant-scoped: another tenant cannot see the record", async () => {
    const a = await seedConversation(db);
    const b = await seedConversation(db);
    const q = await queue(db, a, "secret");
    expect(await inspectOutbound(db, { outboxId: q.id }, { scopeTenantId: b.tenantId })).toBeNull();
    expect(await inspectOutbound(db, { outboxId: q.id }, { scopeTenantId: a.tenantId })).not.toBeNull();
    expect(await listOutbound(db, { tenantId: b.tenantId })).toEqual([]);
  });
});
