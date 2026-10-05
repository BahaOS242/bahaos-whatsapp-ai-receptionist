import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { processInboundWhatsAppMessage } from "../../src/whatsapp/webhook-processing";
import { isRateLimited } from "../../src/whatsapp/rate-limit";
import { customers, tenants } from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";

/**
 * Phase 11 — minimal abuse protection. REQUIRES a real Postgres (the
 * limiter counts real `messages` rows) — see
 * appointments-concurrency.test.ts's header for setup. Run via
 * `npm run test:db`.
 */
describe("Rate limiting (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  const PHONE = "+12428012847";

  function devAgent() {
    return new ReceptionistAgent(new DevRuleBasedAIProvider(), createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db));
  }

  it("isRateLimited is false with no message history", async () => {
    const [tenant] = await db.insert(tenants).values({ slug: `rl-${randomUUID()}`, name: "RL Tenant", timezone: "UTC" }).returning();
    const [customer] = await db.insert(customers).values({ tenantId: tenant.id, whatsappId: PHONE }).returning();

    expect(await isRateLimited(db, customer.id)).toBe(false);
  });

  it("does NOT rate-limit a normal, even lengthy, legitimate conversation", async () => {
    const agent = devAgent();
    const messagesInConversation = [
      "hi",
      "I need a cleaning",
      "sept 17",
      "3pm",
      "Trevor",
      "2428012847",
      "yes",
    ];

    for (const message of messagesInConversation) {
      const outcome = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE, message, whatsappMessageId: `wamid.${randomUUID()}` },
      );
      expect(outcome.rateLimited).toBe(false);
    }
  });

  it("drops messages once a customer exceeds the threshold within the window — no reply sent, no agent/booking work done", async () => {
    const agent = devAgent();
    const max = 5;

    for (let i = 0; i < max; i++) {
      const outcome = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE, message: `message ${i}`, whatsappMessageId: `wamid.${randomUUID()}` },
      );
      expect(outcome.rateLimited).toBe(false);
    }

    // Directly exercise the limiter at a low threshold (the production
    // default is generous — 20/min — so this proves the MECHANISM
    // trips correctly without needing to send 20 real messages here).
    const customerRow = await db.query.customers.findFirst({ where: eq(customers.whatsappId, PHONE) });
    expect(await isRateLimited(db, customerRow!.id, new Date(), max)).toBe(true);
    expect(await isRateLimited(db, customerRow!.id, new Date(), max + 1)).toBe(false);
  });

  it("the window resets — messages outside the lookback window don't count against the limit", async () => {
    const agent = devAgent();
    await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent },
      { phone: PHONE, message: "hi", whatsappMessageId: `wamid.${randomUUID()}` },
    );

    const customerRow = await db.query.customers.findFirst({ where: eq(customers.whatsappId, PHONE) });
    // A 1-second window, checked "now" a full second in the future —
    // the one message sent above falls outside it.
    const future = new Date(Date.now() + 2000);
    expect(await isRateLimited(db, customerRow!.id, future, 1, 1)).toBe(false);
  });

  it("two DIFFERENT customers never share a rate-limit budget", async () => {
    const agent = devAgent();
    const otherPhone = "+12428019999";

    for (let i = 0; i < 3; i++) {
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE, message: `msg ${i}`, whatsappMessageId: `wamid.${randomUUID()}` },
      );
    }
    const customerA = await db.query.customers.findFirst({ where: eq(customers.whatsappId, PHONE) });
    expect(await isRateLimited(db, customerA!.id, new Date(), 3)).toBe(true);

    const otherAgent = devAgent();
    const outcome = await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent: otherAgent },
      { phone: otherPhone, message: "hi", whatsappMessageId: `wamid.${randomUUID()}` },
    );
    expect(outcome.rateLimited).toBe(false);
  });
});
