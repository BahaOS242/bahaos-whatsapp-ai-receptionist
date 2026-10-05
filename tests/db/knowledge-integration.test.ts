import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { resolveTenant } from "../../src/db/domain-resolution";
import { approveObservation, confirmObservation, recordObservation, rejectObservation } from "../../src/db/language-observations";
import { createDbGapRecorder, DrizzleKnowledgeStore } from "../../src/db/knowledge-store";
import { createDbApprovedVocabulary } from "../../src/db/knowledge-vocabulary";
import { auditEvents, conversations, knowledgeConflicts, knowledgeRetrievalLogs, languageObservations, messages, tenants } from "../../src/db/schema";
import { HashingEmbedder } from "../../src/knowledge/embedding/hashing-embedder";
import { KnowledgeService } from "../../src/knowledge/knowledge-service";
import { seedDemoKnowledge } from "../../src/knowledge/seed/demo-knowledge";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { processInboundWhatsAppMessage } from "../../src/whatsapp/webhook-processing";
import { addApprovedTo, IDLE } from "../knowledge/db-helpers";
import { createTestDb, resetTestData } from "./db-test-helpers";

const { db, pool } = createTestDb();
const BUSINESS = BAHAMAS_DENTAL_SERVICE;

function makeService() {
  return new KnowledgeService({
    store: new DrizzleKnowledgeStore(db),
    embedder: new HashingEmbedder(),
    vocabulary: createDbApprovedVocabulary(db),
    gapRecorder: createDbGapRecorder(db),
    cacheTtlMs: 0,
  });
}

async function makeTenant(slug: string) {
  const [t] = await db.insert(tenants).values({ slug, name: slug, timezone: "UTC" }).returning();
  return t.id;
}

beforeEach(async () => resetTestData(db));
afterAll(async () => {
  await resetTestData(db);
  await pool.end();
});

describe("knowledge engine over Postgres — tenant isolation end to end", () => {
  it("tenant B cannot retrieve tenant A's knowledge; each sees only its own", async () => {
    const service = makeService();
    const a = await makeTenant("tenant-a");
    const b = await makeTenant("tenant-b");
    await addApprovedTo(service, a, { docKey: "loyalty", title: "A Loyalty", text: "Tenant A offers a loyalty discount of 40 percent." });
    await addApprovedTo(service, b, { docKey: "garage", title: "B Garage", text: "Tenant B offers free parking in the garage." });

    const ask = (tenantId: string, message: string) => service.lookupFor({ tenantId, business: BUSINESS })({ message, history: [], context: IDLE });
    expect(await ask(b, "do you have a loyalty discount")).toMatchObject({ outcome: "no_evidence" });
    expect(await ask(a, "do you have a loyalty discount")).toMatchObject({ outcome: "grounded" });
    expect(await ask(a, "is there parking in the garage")).toMatchObject({ outcome: "no_evidence" });
    expect(await ask(b, "is there parking in the garage")).toMatchObject({ outcome: "grounded" });
  });

  it("retrieval logs and conflicts are written under the asking tenant only", async () => {
    const service = makeService();
    const a = await makeTenant("tenant-a");
    const b = await makeTenant("tenant-b");
    await seedDemoKnowledge(service, BUSINESS, a);
    await service.lookupFor({ tenantId: a, business: BUSINESS })({ message: "what should I bring?", history: [], context: IDLE });
    expect((await service.store.listRetrievals(a)).length).toBe(1);
    expect(await service.store.listRetrievals(b)).toEqual([]);
  });
});

describe("language observations: the knowledge engine reads ONLY human-approved rows and never writes", () => {
  async function observation(tenantId: string, phrase: string, meaning: string) {
    return recordObservation(db, { tenantId, phrase, normalizedMeaning: meaning, intent: "price_question" });
  }

  it("observed / customer_confirmed / repeated / rejected phrases have NO effect; an approved one does", async () => {
    const t = await makeTenant("t");
    const observed = await observation(t, "wah it cost", "price");
    const confirmed = await observation(t, "how much fi", "price of");
    await confirmObservation(db, confirmed.id);
    const repeated = await observation(t, "fi how much", "price");
    await confirmObservation(db, repeated.id);
    await recordObservation(db, { tenantId: t, phrase: "fi how much", normalizedMeaning: "price", intent: "price_question" }); // -> repeated
    const rejected = await observation(t, "bad phrase", "price");
    await rejectObservation(db, rejected.id);

    const vocab = createDbApprovedVocabulary(db);
    expect(await vocab.listApproved(t)).toEqual([]);

    await approveObservation(db, confirmed.id);
    expect(await vocab.listApproved(t)).toEqual([{ phrase: "how much fi", meaning: "price of" }]);
    expect(observed.status).toBe("observed");
  });

  it("an approved phrase from ANOTHER tenant is never used", async () => {
    const t1 = await makeTenant("t1");
    const t2 = await makeTenant("t2");
    const o = await recordObservation(db, { tenantId: t1, phrase: "fi", normalizedMeaning: "for", intent: "x" });
    await approveObservation(db, o.id);
    const vocab = createDbApprovedVocabulary(db);
    expect(await vocab.listApproved(t1)).toHaveLength(1);
    expect(await vocab.listApproved(t2)).toEqual([]);
  });

  it("lookups, refusals and gap recording NEVER create or change language_observations (no automatic promotion)", async () => {
    const service = makeService();
    const t = await makeTenant("t");
    await seedDemoKnowledge(service, BUSINESS, t);
    const o = await recordObservation(db, { tenantId: t, phrase: "put me down fi", normalizedMeaning: "book appointment", intent: "book" });
    const before = await db.select().from(languageObservations);

    const lookup = service.lookupFor({ tenantId: t, business: BUSINESS });
    for (const q of ["do you do orthodontics", "put me down fi a cleaning?", "what should I bring", "how much fi a filling"]) {
      await lookup({ message: q, history: [], context: IDLE });
    }
    await service.recordGap({ tenantId: t, message: "put me down fi", reason: "low_coverage" });

    const after = await db.select().from(languageObservations);
    expect(after).toEqual(before);
    expect(after[0].status).toBe("observed");
    expect(after[0].observationCount).toBe(o.observationCount);
  });
});

describe("end to end: a real WhatsApp turn through the persisted stack with knowledge enabled", () => {
  const PHONE = "+12428012847";

  async function setup() {
    const service = makeService();
    const tenantId = await resolveTenant(db, BUSINESS);
    await seedDemoKnowledge(service, BUSINESS, tenantId);
    const agent = new ReceptionistAgent(new DevRuleBasedAIProvider(), createDatabaseReceptionistTools(BUSINESS, db), undefined, service);
    const send = (message: string, id: string) => processInboundWhatsAppMessage({ db, business: BUSINESS, agent }, { phone: PHONE, message, whatsappMessageId: id, name: "Trevor" });
    return { service, tenantId, send };
  }

  it("a knowledge question is answered from the database, persisted, and traceable ('why did it say that?')", async () => {
    const { service, tenantId, send } = await setup();
    const r = await send("what should I bring? my number is 242-555-0123", "wamid.k1");
    expect(r.reply).toMatch(/photo ID/);
    expect(r.handoffActive).toBe(false);

    const logs = await service.explain(tenantId, r.conversationId);
    expect(logs).toHaveLength(1);
    expect(logs[0].outcome).toBe("grounded");
    expect(logs[0].queryRedacted).toBe("what should I bring? my number is [number]"); // PII never stored
    expect(logs[0].evidence[0]).toMatchObject({ documentKey: "first-visit", documentTitle: "Your First Visit", documentVersion: 1, authority: "human_approved" });
    expect(logs[0].evidence[0].score).toBeGreaterThan(0.6);
    expect(logs[0].evidence[0].snippet).toContain("photo ID");
    expect(logs[0].conversationId).toBe(r.conversationId);

    const [row] = await db.select().from(knowledgeRetrievalLogs).where(eq(knowledgeRetrievalLogs.conversationId, r.conversationId));
    expect(row.tenantId).toBe(tenantId);
  });

  it("an unanswerable question is refused, flagged for the operator (audit event), and does NOT escalate the conversation", async () => {
    const { tenantId, send } = await setup();
    const r = await send("do you offer pediatric root canals?", "wamid.k2");
    expect(r.reply).toMatch(/don't have that information/);
    expect(r.handoffActive).toBe(false);

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, r.conversationId));
    expect(conv.status).toBe("ai_active");
    const events = await db.select().from(auditEvents).where(eq(auditEvents.tenantId, tenantId));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "knowledge.gap", entityType: "conversation", entityId: r.conversationId });
    expect(events[0].metadata).toMatchObject({ question: "do you offer pediatric root canals?" });
  });

  it("booking is untouched: the full flow still creates a real appointment and never consults knowledge", async () => {
    const { service, tenantId, send } = await setup();
    for (const [i, m] of ["I'd like to book a cleaning", "Friday", "10am", "Maria Lopez", "242-555-0117", "yes"].entries()) {
      await send(m, `wamid.b${i}`);
    }
    const booked = await db.query.appointments.findMany();
    expect(booked).toHaveLength(1);
    expect(booked[0].status).toBe("booked");
    expect(await service.store.listRetrievals(tenantId)).toEqual([]); // zero retrievals during the booking
    const outbound = await db.select().from(messages).where(eq(messages.direction, "outbound"));
    expect(outbound.length).toBeGreaterThanOrEqual(6);
  });

  it("a conflict introduced by a new approved document is visible to the operator, and surfaced to the customer as 'needs confirmation' when unresolved", async () => {
    const { service, tenantId, send } = await setup();
    // Structured config says cleaning is B$125; a human-approved doc says $100 => authority wins, conflict recorded.
    await addApprovedTo(service, tenantId, { docKey: "old-prices", title: "Old Prices", authority: "human_approved", text: "Routine cleaning costs $100." });
    const open = await service.listOpenConflicts(tenantId);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ subject: "service:cleaning", attribute: "price", resolution: "authority_wins" });

    const r = await send("how much is a cleaning", "wamid.c1"); // deterministic price intent => configuration
    expect(r.reply).toContain("B$125");
    expect(r.reply).not.toContain("$100");

    const rows = await db.select().from(knowledgeConflicts).where(eq(knowledgeConflicts.tenantId, tenantId));
    expect(rows).toHaveLength(1);
  });
});
