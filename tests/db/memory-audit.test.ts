import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/config/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BAHAMAS_DENTAL_SERVICE as BIZ } from "../../src/ai/business-context";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import type { AIProvider, AIProviderRequest, AIProviderResponse } from "../../src/ai/types";
import * as schema from "../../src/db/schema";
import { conversations, customerMemories, messages, outboxMessages } from "../../src/db/schema";
import { createStaffUser } from "../../src/inbox/auth";
import { takeOverConversation } from "../../src/inbox/ownership";
import { MemoryService } from "../../src/memory/service";
import { consoleMemoryTelemetry } from "../../src/memory/telemetry";
import { applyCandidate, correctMemory, deleteAllForCustomer, deleteMemory, invalidateMemory, listMemories, purgeCustomerMemories } from "../../src/memory/store";
import type { MemoryCandidate } from "../../src/memory/types";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { processInboundWhatsAppMessage } from "../../src/whatsapp/webhook-processing";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { seedConversation } from "./outbox-helpers";

/** Phase 4 release-audit regressions. REQUIRES a real Postgres. */
describe("memory audit (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  const NOW = new Date("2026-08-20T15:00:00Z");
  beforeEach(async () => { await resetTestData(db); });
  afterAll(async () => { await pool.end(); });

  const cand = (over: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
    kind: "preferred_name", slot: "name", value: "Alicia", source: "customer_stated", provenance: "explicit", ...over,
  });
  const morning = cand({ kind: "scheduling_preference", slot: "time_of_day", value: "morning" });
  const scopeOf = (f: { tenantId: string; customerId: string }) => ({ tenantId: f.tenantId, customerId: f.customerId });
  const active = async (f: { tenantId: string; customerId: string }) => (await listMemories(db, scopeOf(f), { now: NOW })).map((m) => `${m.kind}:${m.value}`).sort();

  function harness(opts: { capture?: AIProviderRequest[]; memory?: MemoryService | null; gate?: Promise<void>; onEnter?: () => void; logger?: { logQuery(q: string): void } } = {}) {
    const inner = new DevRuleBasedAIProvider();
    let calls = 0;
    const provider: AIProvider = {
      async generateResponse(req): Promise<AIProviderResponse> { calls++; opts.capture?.push(req); opts.onEnter?.(); if (opts.gate) await opts.gate; return inner.generateResponse(req); },
    };
    const wdb = opts.logger ? drizzle(pool, { schema, logger: opts.logger }) : db;
    const agent = new ReceptionistAgent(provider, createDatabaseReceptionistTools(BIZ, wdb));
    const memory = opts.memory === null ? undefined : (opts.memory ?? new MemoryService({ business: BIZ }));
    return {
      send: (phone: string, message: string, wamid = `wamid.${randomUUID()}`) => processInboundWhatsAppMessage({ db: wdb, business: BIZ, agent, memory }, { phone, message, whatsappMessageId: wamid }),
      calls: () => calls,
    };
  }
  const customerFor = async (phone: string) => {
    const c = (await db.query.customers.findFirst({ where: eq(schema.customers.whatsappId, phone) }))!;
    return { tenantId: c.tenantId, customerId: c.id };
  };

  describe("conversational memory-control requests", () => {
    async function withFacts(phone: string) {
      const h = harness();
      await h.send(phone, "My name is Alicia. I prefer morning appointments.");
      const s = await customerFor(phone);
      expect(await active(s)).toEqual(["preferred_name:Alicia", "scheduling_preference:morning"]);
      return { h, s };
    }

    it.each([
      ["Forget that I prefer mornings.", ["preferred_name:Alicia"]],
      ["That's not my preference anymore", ["preferred_name:Alicia"]],
      ["Don't remember my name", ["scheduling_preference:morning"]],
      ["Stop remembering things about me", []],
    ])("%s", async (msg, expected) => {
      const phone = `+1242801${String(Math.floor(Math.random() * 9000) + 1000)}`;
      const { h, s } = await withFacts(phone);
      const seen: AIProviderRequest[] = [];
      const h2 = harness({ capture: seen });
      await h2.send(phone, msg);
      expect(await active(s)).toEqual(expected);
      // the model is told the truth about what the system did — and what it did not do
      expect(seen.at(-1)!.memory).toContain("PRIVACY REQUEST");
      expect(seen.at(-1)!.memory).toContain("conversation history");
      expect(h).toBeTruthy();
    });

    it("a control request never creates a new memory, even when it states a value", async () => {
      const phone = "+12428013001";
      const h = harness();
      await h.send(phone, "Forget that I prefer mornings, I now prefer afternoons");
      expect(await active(await customerFor(phone))).toEqual([]);
    });

    it("deleted facts do not come back from the same message being redelivered, nor from a later unrelated turn", async () => {
      const phone = "+12428013002";
      const h = harness();
      const wamid = `wamid.${randomUUID()}`;
      await h.send(phone, "I prefer morning appointments", wamid);
      const s = await customerFor(phone);
      await h.send(phone, "Stop remembering things about me");
      expect(await active(s)).toEqual([]);
      await h.send(phone, "I prefer morning appointments", wamid); // retried delivery of the ORIGINAL message
      await h.send(phone, "What are your hours?");
      expect(await active(s)).toEqual([]);
    });
  });

  describe("deleted or corrected memory cannot be resurrected by stale work", () => {
    it("an extraction whose source message pre-dates a deletion is refused", async () => {
      const f = await seedConversation(db);
      const [m] = await db.insert(messages).values({ tenantId: f.tenantId, conversationId: f.conversationId, direction: "inbound", senderType: "customer", content: "I prefer mornings", createdAt: new Date(NOW.getTime() - 60_000) }).returning();
      const first = await applyCandidate(db, scopeOf(f), morning, { now: new Date(NOW.getTime() - 30_000), sourceMessageId: m.id, conversationId: f.conversationId });
      await deleteMemory(db, scopeOf(f), (first as { id: string }).id, {}, NOW);
      const stale = await applyCandidate(db, scopeOf(f), morning, { now: new Date(NOW.getTime() + 5_000), sourceMessageId: m.id, conversationId: f.conversationId });
      expect(stale).toEqual({ outcome: "rejected", reason: "stale_after_deletion" });
      expect(await active(f)).toEqual([]);
    });

    it("a NEW message after the deletion is a fresh statement and is stored", async () => {
      const f = await seedConversation(db);
      const first = await applyCandidate(db, scopeOf(f), morning, { now: new Date(NOW.getTime() - 30_000) });
      await deleteMemory(db, scopeOf(f), (first as { id: string }).id, {}, NOW);
      const [m] = await db.insert(messages).values({ tenantId: f.tenantId, conversationId: f.conversationId, direction: "inbound", senderType: "customer", content: "I prefer mornings", createdAt: new Date(NOW.getTime() + 1000) }).returning();
      const again = await applyCandidate(db, scopeOf(f), morning, { now: new Date(NOW.getTime() + 2000), sourceMessageId: m.id });
      expect(again.outcome).toBe("created");
    });

    it("correction racing extraction leaves exactly one active value", async () => {
      const f = await seedConversation(db);
      const a = (await applyCandidate(db, scopeOf(f), cand(), { now: NOW })) as { id: string };
      await Promise.all([
        correctMemory(db, scopeOf(f), a.id, "Carla", {}, new Date(NOW.getTime() + 1)).catch(() => null),
        applyCandidate(db, scopeOf(f), cand({ value: "Dina" }), { now: new Date(NOW.getTime() + 2) }).catch(() => null),
        applyCandidate(db, scopeOf(f), cand({ value: "Eva" }), { now: new Date(NOW.getTime() + 3) }).catch(() => null),
      ]);
      const rows = await db.select().from(customerMemories).where(eq(customerMemories.customerId, f.customerId));
      expect(rows.filter((r) => r.status === "active")).toHaveLength(1);
    });

    it("deletion racing retrieval: retrieval sees all-or-nothing, never a partial or scrubbed value", async () => {
      const f = await seedConversation(db);
      const a = (await applyCandidate(db, scopeOf(f), cand(), { now: NOW })) as { id: string };
      const [, listed] = await Promise.all([deleteMemory(db, scopeOf(f), a.id, {}, NOW), listMemories(db, scopeOf(f), { now: NOW })]);
      expect([[], ["Alicia"]]).toContainEqual(listed.map((m) => m.value));
    });
  });

  describe("tenant and customer scoping on every operation (tenant filter proven independently of customer filter)", () => {
    it("a scope with the RIGHT customer but the WRONG tenant touches nothing", async () => {
      const a = await seedConversation(db);
      const b = await seedConversation(db);
      const out = (await applyCandidate(db, scopeOf(a), cand(), { now: NOW })) as { id: string };
      const wrong = { tenantId: b.tenantId, customerId: a.customerId };
      expect(await listMemories(db, wrong, { now: NOW })).toEqual([]);
      expect(await invalidateMemory(db, wrong, out.id)).toBe(false);
      expect(await deleteMemory(db, wrong, out.id)).toBe(false);
      expect(await correctMemory(db, wrong, out.id, "Mallory")).toEqual({ outcome: "not_found" });
      expect(await deleteAllForCustomer(db, wrong)).toBe(0);
      expect(await purgeCustomerMemories(db, wrong)).toBe(0);
      expect(await active(a)).toEqual(["preferred_name:Alicia"]);
    });

    it("a write pairing a tenant with another tenant's customer is refused (no cross-tenant row can be created)", async () => {
      const a = await seedConversation(db);
      const b = await seedConversation(db);
      const r = await applyCandidate(db, { tenantId: a.tenantId, customerId: b.customerId }, cand(), { now: NOW });
      expect(r.outcome).toBe("rejected");
      expect(await db.select().from(customerMemories)).toHaveLength(0);
    });
  });

  describe("telemetry and audit never carry customer content", () => {
    it("console telemetry for sensitive/odd messages contains no message text", async () => {
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      try {
        const phone = "+12428013003";
        const h = harness({ memory: new MemoryService({ business: BIZ, telemetry: consoleMemoryTelemetry }) });
        for (const m of ["My name is Zanzibarella and I have diabetes", "I prefer mornings because of my toothache", "Forget that I prefer Quuxwords"]) await h.send(phone, m);
        const out = spy.mock.calls.map((c) => String(c[0])).join("\n");
        expect(out).toContain('"scope":"memory"');
        for (const secret of ["Zanzibarella", "diabetes", "toothache", "Quuxwords", "mornings"]) expect(out).not.toContain(secret);
      } finally { spy.mockRestore(); }
    });
  });

  describe("continuity accuracy", () => {
    it("requested_human is recorded only when the customer actually asked for a person", async () => {
      const h = harness();
      const a = "+12428013011";
      await h.send(a, "I want to speak to a human please");
      const asked = (await db.select().from(customerMemories)).filter((m) => m.slot === "requested_human" && m.status === "active");
      expect(asked).toHaveLength(1);
      expect(asked[0].expiresAt).toBeTruthy(); // continuity always expires
    });
    it("an escalation for any other reason does not claim the customer asked for a person", async () => {
      const h = harness();
      const b = "+12428013012";
      for (const m of ["blorp zzz", "qwerty asdf", "zxcv hjkl", "plugh xyzzy"]) await h.send(b, m);
      expect((await db.select().from(customerMemories)).filter((m) => m.slot === "requested_human")).toHaveLength(0);
    });
  });

  describe("human handoff interactions", () => {
    it("takeover during the model call: reply suppressed, memory block unused, facts still stored, nothing sent", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let entered!: () => void;
      const started = new Promise<void>((r) => (entered = r));
      const h = harness({ gate, onEnter: () => entered() });
      const phone = "+12428013004";
      const pending = h.send(phone, "My name is Alicia. Can I book a cleaning?");
      await started;
      const conv = (await db.query.conversations.findFirst())!;
      const staff = await createStaffUser(db, { tenantId: conv.tenantId, email: "s@example.test", name: "Sam", role: "staff", password: "correct horse battery" });
      await takeOverConversation(db, { staffUserId: staff.id, tenantId: conv.tenantId, role: "staff" }, conv.id);
      release();
      const r = await pending;
      expect(r.reply).toBeNull();
      expect(r.suppressedByHuman).toBe(true);
      expect(await db.select().from(outboxMessages)).toHaveLength(0);
      expect(await active(await customerFor(phone))).toEqual(["preferred_name:Alicia"]);
    });

    it.each(["human_pending", "staff_owned", "resolved"] as const)("conversation %s: customer facts follow the same rules and trigger no reply", async (status) => {
      const h = harness();
      const phone = `+1242801${status.length}9${status.length}`;
      const first = await h.send(phone, "hello");
      await db.update(conversations).set({ status }).where(eq(conversations.id, first.conversationId));
      const calls = h.calls();
      const outbox = (await db.select().from(outboxMessages)).length;
      await h.send(phone, "My name is Beto. I have diabetes.");
      if (status !== "resolved") expect(h.calls()).toBe(calls); // resolved opens a fresh AI conversation by design
      if (status !== "resolved") expect((await db.select().from(outboxMessages)).length).toBe(outbox);
      expect(await active(await customerFor(phone))).toEqual(["preferred_name:Beto"]);
    });

    it("deleting memory while a conversation is human-owned works and changes no ownership or outbound state", async () => {
      const f = await seedConversation(db);
      await db.update(conversations).set({ status: "staff_owned" }).where(eq(conversations.id, f.conversationId));
      const a = (await applyCandidate(db, scopeOf(f), cand(), { now: NOW })) as { id: string };
      expect(await deleteMemory(db, scopeOf(f), a.id)).toBe(true);
      expect((await db.query.conversations.findFirst({ where: eq(conversations.id, f.conversationId) }))!.status).toBe("staff_owned");
      expect(await db.select().from(outboxMessages)).toHaveLength(0);
    });

    it("memory correction concurrent with an ownership transition: both commit, state consistent", async () => {
      const f = await seedConversation(db);
      const a = (await applyCandidate(db, scopeOf(f), cand(), { now: NOW })) as { id: string };
      const staff = await createStaffUser(db, { tenantId: f.tenantId, email: "t@example.test", name: "Tia", role: "staff", password: "correct horse battery" });
      const [c, t] = await Promise.all([
        correctMemory(db, scopeOf(f), a.id, "Carla"),
        takeOverConversation(db, { staffUserId: staff.id, tenantId: f.tenantId, role: "staff" }, f.conversationId),
      ]);
      expect(c).toMatchObject({ outcome: "created" });
      expect(t.ok).toBe(true);
      expect(await active(f)).toEqual(["preferred_name:Carla"]);
    });
  });

  describe("resilience", () => {
    it("many concurrent customer messages: all persisted, exactly one active name", async () => {
      const h = harness();
      const phone = "+12428013005";
      const names = ["Ana", "Bea", "Cleo", "Dina", "Eva", "Fay"];
      await Promise.all(names.map((n) => h.send(phone, `My name is ${n}`)));
      const s = await customerFor(phone);
      expect((await active(s)).filter((x) => x.startsWith("preferred_name"))).toHaveLength(1);
      const inbound = await db.select().from(messages).where(eq(messages.direction, "inbound"));
      expect(inbound).toHaveLength(names.length);
    });

    it("a REAL database error inside memory (table unavailable) never rolls back the message, reply or handoff", async () => {
      const h = harness();
      const phone = "+12428013006";
      await h.send(phone, "hello");
      await db.execute(sql`ALTER TABLE customer_memories RENAME TO customer_memories_off`);
      try {
        const r = await h.send(phone, "My name is Alicia. I want to speak to a human please");
        expect(r.reply).toBeTruthy();
        expect(r.handoffActive).toBe(true);
        const conv = (await db.query.conversations.findFirst({ where: eq(conversations.id, r.conversationId) }))!;
        expect(conv.status).toBe("human_pending");
        expect((await db.select().from(messages).where(eq(messages.conversationId, r.conversationId))).length).toBeGreaterThanOrEqual(3);
        expect((await db.select().from(outboxMessages)).length).toBeGreaterThanOrEqual(2);
      } finally {
        await db.execute(sql`ALTER TABLE customer_memories_off RENAME TO customer_memories`);
      }
    });
  });

  describe("feature flag isolation", () => {
    it("OFF: not a single SQL statement touches customer_memories during full conversations", async () => {
      const statements: string[] = [];
      const h = harness({ memory: null, logger: { logQuery: (q) => statements.push(q) } });
      const phone = "+12428013007";
      for (const m of ["hello", "My name is Alicia. I prefer mornings", "Can I book a cleaning next Tuesday?", "I want a human", "are you there?"]) await h.send(phone, m);
      expect(statements.length).toBeGreaterThan(10);
      expect(statements.filter((q) => /customer_memories/i.test(q))).toEqual([]);
    });

    describe("through the REAL HTTP webhook route (env flag decides)", () => {
      const post = (app: ReturnType<typeof createApp>, phone: string, text: string) =>
        request(app).post("/webhooks/whatsapp").send({
          object: "whatsapp_business_account",
          entry: [{ id: "W", changes: [{ field: "messages", value: {
            metadata: { phone_number_id: "P" }, contacts: [{ profile: { name: "X" }, wa_id: phone }],
            messages: [{ from: phone, id: `wamid.${randomUUID()}`, timestamp: `${Math.floor(Date.now() / 1000)}`, type: "text", text: { body: text } }],
          } }] }],
        });
      const mkApp = (flag?: "true" | "false") => {
        const env = loadEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/d", WHATSAPP_APP_SECRET: undefined, ...(flag ? { MEMORY_ENABLED: flag } : {}) });
        const agent = new ReceptionistAgent(new DevRuleBasedAIProvider(), createDatabaseReceptionistTools(BIZ, db));
        return createApp({ env, db: db as never, agent });
      };
      it("flag unset (default): the route builds no memory service — nothing is stored", async () => {
        expect((await post(mkApp(), "12428014001", "My name is Alicia. I prefer mornings.")).status).toBe(200);
        expect(await db.select().from(customerMemories)).toHaveLength(0);
      });
      it("flag false: nothing is stored", async () => {
        expect((await post(mkApp("false"), "12428014002", "My name is Alicia")).status).toBe(200);
        expect(await db.select().from(customerMemories)).toHaveLength(0);
      });
      it("flag true: the route builds the service and facts are stored", async () => {
        expect((await post(mkApp("true"), "12428014003", "My name is Alicia")).status).toBe(200);
        expect((await db.select().from(customerMemories)).filter((m) => m.status === "active")).toHaveLength(1);
      });
    });

    it("ON: statements do touch it (the probe above is meaningful)", async () => {
      const statements: string[] = [];
      const h = harness({ logger: { logQuery: (q) => statements.push(q) } });
      await h.send("+12428013008", "My name is Alicia");
      expect(statements.some((q) => /customer_memories/i.test(q))).toBe(true);
    });

    it("OFF vs ON: identical booking/handoff outcomes for the same script when nothing is remembered", async () => {
      const script = ["hello", "I want to book a cleaning", "I want a human"];
      const run = async (memory: boolean, phone: string) => {
        const h = harness({ memory: memory ? undefined : null });
        const out: Array<[string | null, boolean]> = [];
        for (const m of script) { const r = await h.send(phone, m); out.push([r.reply, r.handoffActive]); }
        return out;
      };
      expect(await run(true, "+12428013009")).toEqual(await run(false, "+12428013010"));
    });
  });
});
