import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BAHAMAS_DENTAL_SERVICE as BIZ } from "../../src/ai/business-context";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { appointments } from "../../src/db/schema";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { processInboundWhatsAppMessage } from "../../src/whatsapp/webhook-processing";
import { createTestDb, resetTestData } from "./db-test-helpers";

/**
 * LANE: DATABASE INTEGRATION — fallback provider + REAL Postgres booking tools through the real
 * webhook processing path. Asserts what was DURABLY stored (customer row, appointment instant),
 * not just reply text. Disposable test DB; business clock frozen (Date only) at
 * 2026-10-09T16:00:00Z. Not a live-LLM evaluation.
 */
describe("next-week date regression, durable state (REQUIRES a real Postgres)", () => {
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

  it("'next week Friday at 2pm' is stored as 2026-10-16 14:00 Nassau = 18:00Z", async () => {
    await run("+12428019999", ["I want a cleaning", "yes", "next week Friday at 2pm", "Alicia 2425550100"]);
    expect(await db.select().from(appointments)).toHaveLength(0);
    await run("+12428019999", ["yes"]);
    const appts = await db.select().from(appointments);
    expect(appts).toHaveLength(1);
    expect(JSON.stringify(appts[0])).toContain("2026-10-16T18:00:00.000Z");
  });
});
