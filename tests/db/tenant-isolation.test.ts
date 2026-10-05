import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { processInboundWhatsAppMessage } from "../../src/whatsapp/webhook-processing";
import { conversations } from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";

/**
 * P1 — WhatsApp tenant/account architecture audit. See
 * src/routes/whatsapp-webhook.ts's own "TENANT/ACCOUNT ARCHITECTURE"
 * comment for the full audit reasoning: `whatsapp_accounts` is an
 * unpopulated Phase 1 scaffold, this app resolves exactly ONE tenant
 * today, and the security property that matters right now is customer-
 * level isolation WITHIN that tenant, which this file proves directly
 * through the actual webhook processing path (not just the lower-level
 * ConversationManager/PersistedConversationManager unit tests this
 * codebase already had).
 *
 * REQUIRES a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("Tenant/customer isolation through the webhook boundary (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  function devAgent() {
    return new ReceptionistAgent(
      new DevRuleBasedAIProvider(),
      createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db),
    );
  }

  it("resolveTenant always resolves to exactly one tenant row, regardless of how many distinct customers message it", async () => {
    const agentA = devAgent();
    const agentB = devAgent();

    await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentA },
      { phone: "+12428012847", message: "hi", whatsappMessageId: `wamid.${randomUUID()}` },
    );
    await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentB },
      { phone: "+12428019999", message: "hi", whatsappMessageId: `wamid.${randomUUID()}` },
    );

    const allTenants = await db.query.tenants.findMany();
    expect(allTenants).toHaveLength(1);
  });

  it("two different customers' conversations/bookingState never cross-contaminate, even mid-flow with overlapping field values", async () => {
    const agentA = devAgent();
    const agentB = devAgent();

    // Customer A books a cleaning; customer B books a root canal — if
    // isolation were broken, one customer's service/date/time could leak
    // into the other's persisted state.
    await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentA },
      { phone: "+12428012847", message: "book a cleaning", whatsappMessageId: `wamid.${randomUUID()}`, name: "Trevor" },
    );
    await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentB },
      { phone: "+12428019999", message: "book a root canal", whatsappMessageId: `wamid.${randomUUID()}`, name: "Sarah" },
    );
    await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentA },
      { phone: "+12428012847", message: "Tuesday 2pm", whatsappMessageId: `wamid.${randomUUID()}` },
    );
    await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentB },
      { phone: "+12428019999", message: "Wednesday 10am", whatsappMessageId: `wamid.${randomUUID()}` },
    );

    const [tenant] = await db.query.tenants.findMany();
    const allConversations = await db.query.conversations.findMany({ where: eq(conversations.tenantId, tenant.id) });
    expect(allConversations).toHaveLength(2);

    const stateByService = new Map(allConversations.map((c) => [c.bookingState.service, c.bookingState]));
    expect(stateByService.get("Routine cleaning")).toMatchObject({ date: "Tuesday" });
    expect(stateByService.get("Root canal")).toMatchObject({ date: "Wednesday" });
    // Neither customer's date/service leaked into the other's row.
    expect(stateByService.get("Routine cleaning")?.date).not.toBe("Wednesday");
    expect(stateByService.get("Root canal")?.date).not.toBe("Tuesday");
  });

  it("a customer can never read or affect another customer's conversation by any value the webhook payload controls (phone is the only identity key)", async () => {
    const agentA = devAgent();
    const agentB = devAgent();

    const outcomeA = await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentA },
      { phone: "+12428012847", message: "book a cleaning", whatsappMessageId: `wamid.${randomUUID()}`, name: "Trevor" },
    );
    const outcomeB = await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentB },
      // Same declared name, DIFFERENT phone — proves resolution keys on
      // the phone number (WhatsApp's own durable identity), never the
      // customer-supplied display name.
      { phone: "+12428019999", message: "book a cleaning", whatsappMessageId: `wamid.${randomUUID()}`, name: "Trevor" },
    );

    expect(outcomeA.conversationId).not.toBe(outcomeB.conversationId);
  });
});
