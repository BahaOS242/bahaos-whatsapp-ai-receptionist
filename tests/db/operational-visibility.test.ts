import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { processInboundWhatsAppMessage } from "../../src/whatsapp/webhook-processing";
import { appointments, conversations, customers, handoffs, messages } from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";
import type { AIProvider, AIProviderResponse } from "../../src/ai/types";

/**
 * P1 — human escalation / operational visibility audit. Not a
 * dashboard — a proof that the persisted data ALREADY supports the
 * chain a staff member needs to walk, using nothing but the existing
 * tables (customers, conversations, messages, handoffs, appointments):
 *
 *   Customer -> Conversation -> what they wanted -> why AI stopped ->
 *   current state -> whether an appointment exists
 *
 * REQUIRES a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("Operational visibility (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("a staff member can walk the full chain for an escalated conversation using only existing tables", async () => {
    const failingProvider: AIProvider = {
      async generateResponse(): Promise<AIProviderResponse> {
        throw new Error("simulated failure");
      },
    };
    const agent = new ReceptionistAgent(failingProvider, createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db));
    const phone = "+12428019201";

    await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent },
      { phone, message: "I need a root canal urgently", whatsappMessageId: `wamid.${randomUUID()}`, name: "Trevor" },
    );

    // STEP 1: find the customer by phone (what a staff dashboard's
    // search box would do).
    const customer = await db.query.customers.findFirst({ where: eq(customers.whatsappId, phone) });
    expect(customer).toBeDefined();
    expect(customer?.displayName).toBe("Trevor");

    // STEP 2: find their conversation(s).
    const conversation = await db.query.conversations.findFirst({ where: eq(conversations.customerId, customer!.id) });
    expect(conversation?.status).toBe("staff_owned"); // "why is AI not handling this" — answered by status alone

    // STEP 3: what they actually said (the raw ask).
    const conversationMessages = await db.query.messages.findMany({ where: eq(messages.conversationId, conversation!.id) });
    const firstCustomerMessage = conversationMessages.find((m) => m.direction === "inbound");
    expect(firstCustomerMessage?.content).toBe("I need a root canal urgently");

    // STEP 4: WHY the AI stopped — the handoff's own reason + snapshot.
    const handoff = await db.query.handoffs.findFirst({ where: eq(handoffs.conversationId, conversation!.id) });
    expect(handoff?.reason).toMatch(/AI provider failed/i);
    expect(handoff?.status).toBe("open"); // not yet claimed/resolved by anyone
    expect(handoff?.context).toBeDefined(); // structured snapshot, not "go re-read the transcript"

    // STEP 5: current state — directly on the conversation row, no
    // reconstruction needed.
    expect(conversation?.bookingState).toBeDefined();

    // STEP 6: does an appointment already exist for this customer?
    const existingAppointments = await db.query.appointments.findMany({ where: eq(appointments.customerId, customer!.id) });
    expect(existingAppointments).toHaveLength(0); // correctly none — nothing was ever booked
  });

  it("a resolved (non-escalated) booking is equally traceable: conversation status alone distinguishes it from one needing staff attention", async () => {
    const agent = new ReceptionistAgent(new DevRuleBasedAIProvider(), createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db));
    // Genuine finding while writing this test, noted in the final
    // report rather than fixed here: requestAppointment resolves its
    // OWN customer row from whatever phone number the customer STATES
    // in conversation (message-field-extraction.ts), independent of the
    // `customers` row the webhook layer already resolved from the
    // actual WhatsApp sender identity — the two only necessarily match
    // when the stated number equals the sending number. Using the same
    // number for both here deliberately tests the common, expected
    // case; a customer stating a DIFFERENT contact number is a real,
    // pre-existing architectural quirk, not something introduced or
    // fixed by this pass.
    const phone = "+12428012847";

    for (const message of ["book a cleaning", "sept 17", "3pm", "Trevor 2428012847", "yes"]) {
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone, message, whatsappMessageId: `wamid.${randomUUID()}` },
      );
    }

    const customer = await db.query.customers.findFirst({ where: eq(customers.whatsappId, phone) });
    const conversation = await db.query.conversations.findFirst({ where: eq(conversations.customerId, customer!.id) });
    expect(conversation?.status).toBe("ai_active"); // never needed staff — visible from status alone

    const handoffRows = await db.query.handoffs.findMany({ where: eq(handoffs.conversationId, conversation!.id) });
    expect(handoffRows).toHaveLength(0);

    const booked = await db.query.appointments.findMany({ where: eq(appointments.customerId, customer!.id) });
    expect(booked).toHaveLength(1);
    expect(booked[0].status).toBe("booked");
  });
});
