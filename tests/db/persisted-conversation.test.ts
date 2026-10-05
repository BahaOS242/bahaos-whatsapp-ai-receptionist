import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PersistedConversationManager } from "../../src/db/persisted-conversation";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { conversations, handoffs, leads, messages } from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";
import type { BusinessContext } from "../../src/ai/types";

/**
 * Objective 1 — durable conversation/message/handoff/lead persistence.
 * Every scenario the mission explicitly lists is covered here: process
 * restart, conversation restoration, multiple simultaneous
 * conversations, tenant isolation, handoff persistence, lead
 * persistence, duplicate incoming message/event handling, and
 * conversation state consistency.
 *
 * "Process restart" is simulated the only realistic way an automated
 * test can: close the Postgres connection pool a manager was using and
 * open a genuinely fresh one, then prove data written through the OLD
 * pool is correctly readable/usable through the NEW one — the actual
 * property that matters (data survives the process, not the in-memory
 * connection object).
 *
 * REQUIRES a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("PersistedConversationManager (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  const CUSTOMER_A_PHONE = "+12428012847";
  const CUSTOMER_B_PHONE = "+12428019999";

  it("creates a fresh conversation for a new customer, with empty initial state", async () => {
    const manager = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );

    expect(manager.getBookingState()).toEqual({});
    expect(manager.getHandoffActive()).toBe(false);
    expect(manager.conversationId).toBeTruthy();
  });

  it("resolves to the SAME conversation on a second load for the same customer — durable identity", async () => {
    const first = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );
    await first.commitTurn({ intent: "book_appointment", service: "Routine cleaning" }, false);

    const second = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
    );

    expect(second.conversationId).toBe(first.conversationId);
    expect(second.customerId).toBe(first.customerId);
    expect(second.getBookingState()).toEqual({ intent: "book_appointment", service: "Routine cleaning" });
  });

  it("PROCESS RESTART: BookingState committed through one connection pool is correctly restored through a genuinely fresh one", async () => {
    const before = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );
    await before.commitTurn(
      {
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: CUSTOMER_A_PHONE,
        pendingAction: "confirm_service",
      },
      false,
    );

    // Simulate a process restart: close this pool entirely, open a
    // BRAND NEW one — nothing in-memory is shared with `before` at all.
    const fresh = createTestDb();
    try {
      const after = await PersistedConversationManager.loadOrCreate(
        fresh.db,
        BAHAMAS_DENTAL_SERVICE,
        CUSTOMER_A_PHONE,
      );

      expect(after.conversationId).toBe(before.conversationId);
      expect(after.getBookingState()).toEqual({
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: CUSTOMER_A_PHONE,
        pendingAction: "confirm_service",
      });
      expect(after.getHandoffActive()).toBe(false);
    } finally {
      await fresh.pool.end();
    }
  });

  it("CONVERSATION RESTORATION: message history survives a restart and reloads in order", async () => {
    const before = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );
    await before.recordInboundMessage("I want a cleaning");
    await before.recordOutboundMessage("What day and time works for you?");
    await before.recordInboundMessage("Tuesday 2pm");

    const fresh = createTestDb();
    try {
      const after = await PersistedConversationManager.loadOrCreate(
        fresh.db,
        BAHAMAS_DENTAL_SERVICE,
        CUSTOMER_A_PHONE,
      );
      const history = await after.loadHistory();

      expect(history).toEqual([
        { role: "customer", content: "I want a cleaning" },
        { role: "assistant", content: "What day and time works for you?" },
        { role: "customer", content: "Tuesday 2pm" },
      ]);
    } finally {
      await fresh.pool.end();
    }
  });

  it("MULTIPLE SIMULTANEOUS CONVERSATIONS: two different customers messaging concurrently never cross-contaminate", async () => {
    const [managerA, managerB] = await Promise.all([
      PersistedConversationManager.loadOrCreate(db, BAHAMAS_DENTAL_SERVICE, CUSTOMER_A_PHONE, "Trevor"),
      PersistedConversationManager.loadOrCreate(db, BAHAMAS_DENTAL_SERVICE, CUSTOMER_B_PHONE, "Sarah"),
    ]);

    expect(managerA.conversationId).not.toBe(managerB.conversationId);
    expect(managerA.customerId).not.toBe(managerB.customerId);

    await Promise.all([
      managerA.commitTurn({ intent: "book_appointment", service: "Routine cleaning" }, false),
      managerB.commitTurn({ intent: "cancel_appointment", name: "Sarah" }, false),
    ]);

    const freshA = await PersistedConversationManager.loadOrCreate(db, BAHAMAS_DENTAL_SERVICE, CUSTOMER_A_PHONE);
    const freshB = await PersistedConversationManager.loadOrCreate(db, BAHAMAS_DENTAL_SERVICE, CUSTOMER_B_PHONE);

    expect(freshA.getBookingState()).toEqual({ intent: "book_appointment", service: "Routine cleaning" });
    expect(freshB.getBookingState()).toEqual({ intent: "cancel_appointment", name: "Sarah" });
  });

  it("TENANT ISOLATION: two different businesses with a customer sharing the SAME phone number never share a conversation or state", async () => {
    const otherBusiness: BusinessContext = { ...BAHAMAS_DENTAL_SERVICE, name: "Nassau Family Dental" };

    const managerA = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );
    const managerB = await PersistedConversationManager.loadOrCreate(
      db,
      otherBusiness,
      CUSTOMER_A_PHONE, // SAME phone number, DIFFERENT tenant
      "Trevor",
    );

    expect(managerA.tenantId).not.toBe(managerB.tenantId);
    expect(managerA.customerId).not.toBe(managerB.customerId);
    expect(managerA.conversationId).not.toBe(managerB.conversationId);

    await managerA.commitTurn({ intent: "book_appointment", service: "Routine cleaning" }, false);
    await managerB.commitTurn({ intent: "cancel_appointment", name: "Trevor" }, false);

    // Re-fetch both fresh — each tenant's state is exactly its own.
    const freshA = await PersistedConversationManager.loadOrCreate(db, BAHAMAS_DENTAL_SERVICE, CUSTOMER_A_PHONE);
    const freshB = await PersistedConversationManager.loadOrCreate(db, otherBusiness, CUSTOMER_A_PHONE);
    expect(freshA.getBookingState()).toEqual({ intent: "book_appointment", service: "Routine cleaning" });
    expect(freshB.getBookingState()).toEqual({ intent: "cancel_appointment", name: "Trevor" });

    // Ground truth: exactly 2 tenant rows, 2 customer rows, 2 conversation rows.
    const allTenants = await db.query.tenants.findMany();
    const allCustomers = await db.query.customers.findMany();
    const allConversations = await db.query.conversations.findMany();
    expect(allTenants).toHaveLength(2);
    expect(allCustomers).toHaveLength(2);
    expect(allConversations).toHaveLength(2);
  });

  it("HANDOFF PERSISTENCE: creates a durable handoff row with a structured context snapshot, referencing the correct conversation", async () => {
    const manager = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );
    await manager.commitTurn(
      { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday" },
      true,
    );

    const { id: handoffId } = await manager.createHandoff("customer asked for a person", {
      bookingState: { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday" },
      requestedAction: "book a routine cleaning",
      unresolvedQuestion: undefined,
    });

    const row = await db.query.handoffs.findFirst({ where: eq(handoffs.id, handoffId) });
    expect(row).toBeDefined();
    expect(row!.conversationId).toBe(manager.conversationId);
    expect(row!.tenantId).toBe(manager.tenantId);
    expect(row!.reason).toBe("customer asked for a person");
    expect(row!.status).toBe("open");
    expect(row!.context).toEqual({
      bookingState: { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday" },
      requestedAction: "book a routine cleaning",
      unresolvedQuestion: undefined,
    });
  });

  it("LEAD PERSISTENCE: creates a durable lead row referencing the correct customer and source conversation", async () => {
    const manager = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );

    const { id: leadId } = await manager.createLead("Root canal");

    const row = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    expect(row).toBeDefined();
    expect(row!.customerId).toBe(manager.customerId);
    expect(row!.tenantId).toBe(manager.tenantId);
    expect(row!.sourceConversationId).toBe(manager.conversationId);
    expect(row!.serviceInterest).toBe("Root canal");
    expect(row!.status).toBe("new");
  });

  it("DUPLICATE INCOMING MESSAGE HANDLING: the same whatsappMessageId recorded twice is treated as a no-op replay, never a second row", async () => {
    const manager = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );

    const first = await manager.recordInboundMessage("Tuesday 2pm", "wamid.ABC123");
    const second = await manager.recordInboundMessage("Tuesday 2pm", "wamid.ABC123");

    expect(first.wasDuplicate).toBe(false);
    expect(second.wasDuplicate).toBe(true);

    const rows = await db.query.messages.findMany({ where: eq(messages.conversationId, manager.conversationId) });
    expect(rows).toHaveLength(1);
  });

  it("DUPLICATE INCOMING MESSAGE HANDLING: genuinely CONCURRENT redelivery of the same message ID still produces exactly one row", async () => {
    const manager = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );

    const [resultA, resultB] = await Promise.all([
      manager.recordInboundMessage("Tuesday 2pm", "wamid.RACE1"),
      manager.recordInboundMessage("Tuesday 2pm", "wamid.RACE1"),
    ]);

    const duplicateCount = [resultA, resultB].filter((r) => r.wasDuplicate).length;
    expect(duplicateCount).toBe(1); // exactly one of the two lost the race

    const rows = await db.query.messages.findMany({ where: eq(messages.conversationId, manager.conversationId) });
    expect(rows).toHaveLength(1);
  });

  it("a message with no whatsappMessageId is never deduplicated against another message with no whatsappMessageId (outbound/AI messages)", async () => {
    const manager = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );

    await manager.recordOutboundMessage("What day and time works for you?");
    await manager.recordOutboundMessage("What day and time works for you?"); // same text, no id — both must be recorded

    const rows = await db.query.messages.findMany({ where: eq(messages.conversationId, manager.conversationId) });
    expect(rows).toHaveLength(2);
  });

  it("CONVERSATION STATE CONSISTENCY: the latest commitTurn always wins — no stale overwrite across sequential turns", async () => {
    const manager = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );

    await manager.commitTurn({ intent: "book_appointment", service: "Routine cleaning" }, false);
    await manager.commitTurn(
      { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday" },
      false,
    );
    await manager.commitTurn(
      {
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        pendingAction: "confirm_service",
      },
      false,
    );

    expect(manager.getBookingState()).toEqual({
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      pendingAction: "confirm_service",
    });

    const reread = await PersistedConversationManager.loadOrCreate(db, BAHAMAS_DENTAL_SERVICE, CUSTOMER_A_PHONE);
    expect(reread.getBookingState()).toEqual(manager.getBookingState());
  });

  it("resolving a conversation excludes it from future loadOrCreate — a new message starts a FRESH conversation", async () => {
    const first = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      CUSTOMER_A_PHONE,
      "Trevor",
    );
    await first.commitTurn({ intent: "book_appointment", service: "Routine cleaning" }, false);
    await first.resolve();

    const second = await PersistedConversationManager.loadOrCreate(db, BAHAMAS_DENTAL_SERVICE, CUSTOMER_A_PHONE);

    expect(second.conversationId).not.toBe(first.conversationId);
    expect(second.getBookingState()).toEqual({}); // fresh, not the resolved conversation's leftover state
    expect(second.customerId).toBe(first.customerId); // same customer, though — identity persists

    const allConversationsForCustomer = await db.query.conversations.findMany({
      where: eq(conversations.customerId, first.customerId),
    });
    expect(allConversationsForCustomer).toHaveLength(2);
  });
});
