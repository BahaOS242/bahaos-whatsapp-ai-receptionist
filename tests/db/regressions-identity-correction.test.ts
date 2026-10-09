import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BAHAMAS_DENTAL_SERVICE as BIZ } from "../../src/ai/business-context";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { appointments, customers } from "../../src/db/schema";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { processInboundWhatsAppMessage } from "../../src/whatsapp/webhook-processing";
import { createTestDb, resetTestData } from "./db-test-helpers";

/**
 * LANE: DATABASE INTEGRATION — fallback provider + REAL Postgres booking tools through the real
 * webhook processing path. Asserts what was DURABLY stored (customer row, appointment instant),
 * not just reply text. Disposable test DB; business clock frozen (Date only) at
 * 2026-10-09T16:00:00Z. Not a live-LLM evaluation.
 */
describe("identity-correction regression, durable state (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  beforeEach(async () => {
    await resetTestData(db);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T16:00:00Z") });
  });
  afterEach(() => { vi.useRealTimers(); });
  afterAll(async () => { await pool.end(); });

  const run = async (phone: string, steps: string[]) => {
    const agent = new ReceptionistAgent(new DevRuleBasedAIProvider(), createDatabaseReceptionistTools(BIZ, db));
    for (const message of steps) await processInboundWhatsAppMessage({ db, business: BIZ, agent }, { phone, message, whatsappMessageId: `wamid.${randomUUID()}` });
  };

  it("a time correction does not corrupt the stored customer name; booking has the corrected time", async () => {
    await run("+12428012847", ["I want a cleaning", "yes", "Tuesday 2pm", "actually 3pm", "Trevor 2428012847"]);
    expect(await db.select().from(appointments)).toHaveLength(0); // nothing durable before confirmation
    await run("+12428012847", ["yes"]);
    const appts = await db.select().from(appointments);
    expect(appts).toHaveLength(1);
    const customer = (await db.select().from(customers).where(eq(customers.id, appts[0].customerId)))[0];
    expect(customer.displayName ?? "").not.toMatch(/actually/i);
    expect(JSON.stringify(appts[0])).toContain("2026-10-13T19:00:00.000Z"); // Tue 2026-10-13 3:00pm Nassau (EDT, UTC-4)
  });
});
