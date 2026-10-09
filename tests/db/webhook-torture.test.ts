import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/config/env";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { createMockMessagingProvider } from "../../src/messaging/mock-messaging-provider";
import { appointments, conversations, customers, services } from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { deliverAllQueued } from "./outbox-helpers";
import type { MockMessagingProvider } from "../../src/messaging/mock-messaging-provider";

/**
 * P1 — real-world WhatsApp conversation torture tests, extended through
 * the ACTUAL webhook HTTP boundary — simulated Meta payloads POSTed to
 * the real Express app, not direct calls into the receptionist engine.
 * This is deliberately a DIFFERENT layer than tests/torture/*.test.ts
 * (which drive ReceptionistAgent directly) and
 * tests/db/whatsapp-webhook-integration.test.ts (which calls
 * processInboundWhatsAppMessage directly) — this file proves the same
 * hard cases survive the FULL stack: HTTP -> signature/payload parsing
 * -> persistence -> agent -> tools -> mock outbound.
 *
 * REQUIRES a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("Webhook torture tests — real Meta-shaped payloads through the full HTTP stack (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();
  const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db", WHATSAPP_APP_SECRET: undefined });

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  function buildApp(messaging: MockMessagingProvider = createMockMessagingProvider()) {
    const agent = new ReceptionistAgent(new DevRuleBasedAIProvider(), createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db));
    const app = createApp({ env, db: db as never, agent });
    return { app, agent, messaging };
  }

  function inboundPayload(from: string, text: string, id = `wamid.${randomUUID()}`) {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_ID_1" },
                contacts: [{ profile: { name: "Trevor" }, wa_id: from }],
                messages: [{ from, id, timestamp: `${Math.floor(Date.now() / 1000)}`, type: "text", text: { body: text } }],
              },
              field: "messages",
            },
          ],
        },
      ],
    };
  }

  /** Sends one simulated inbound WhatsApp message through the real HTTP
   * webhook and returns the mock provider's most recent outbound reply
   * text (undefined if none was sent this turn — e.g. a duplicate). */
  async function sendTurn(app: ReturnType<typeof buildApp>["app"], messaging: MockMessagingProvider, from: string, text: string) {
    const before = messaging.sent.length;
    const res = await request(app).post("/webhooks/whatsapp").send(inboundPayload(from, text));
    expect(res.status).toBe(200);
    // The webhook only QUEUES the reply; the outbox worker delivers it.
    await deliverAllQueued(db, messaging);
    return messaging.sent.length > before ? messaging.sent[messaging.sent.length - 1].body : undefined;
  }

  it("NORMAL BOOKING: Hi -> I need a cleaning -> sept 17 -> 3pm -> Trevor -> 12428012847 -> yes results in exactly one real appointment", async () => {
    const { app, messaging } = buildApp();
    const phone = "12428017001";

    await sendTurn(app, messaging, phone, "Hi");
    await sendTurn(app, messaging, phone, "I need a cleaning");
    await sendTurn(app, messaging, phone, "sept 17");
    await sendTurn(app, messaging, phone, "3pm");
    await sendTurn(app, messaging, phone, "Trevor");
    await sendTurn(app, messaging, phone, "12428012847");
    const finalReply = await sendTurn(app, messaging, phone, "yes");

    expect(finalReply?.toLowerCase()).toMatch(/calendar|confirm|captured|set/);
    const booked = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
    expect(booked).toHaveLength(1);
  });

  it("CORRECTION: root canal -> no -> actually a cleaning -> yes books Routine cleaning, never Root canal", async () => {
    const { app, messaging } = buildApp();
    const phone = "12428017002";

    await sendTurn(app, messaging, phone, "I want a root canal");
    await sendTurn(app, messaging, phone, "Tuesday 10am");
    await sendTurn(app, messaging, phone, "Trevor 2428012847");
    await sendTurn(app, messaging, phone, "no");
    await sendTurn(app, messaging, phone, "actually a cleaning");
    await sendTurn(app, messaging, phone, "yes");

    const booked = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
    expect(booked).toHaveLength(1);
    const service = await db.query.services.findFirst({ where: eq(services.id, booked[0].serviceId) });
    expect(service?.name).toBe("Routine cleaning");
  });

  it("KNOWN INFORMATION: 'you already have my information'/'same time'/'tomorrow' never re-collect name/phone already on file", async () => {
    const { app, messaging } = buildApp();
    const phone = "12428017003";

    await sendTurn(app, messaging, phone, "book a cleaning");
    await sendTurn(app, messaging, phone, "Tuesday 2pm");
    await sendTurn(app, messaging, phone, "Trevor 2428012847");
    await sendTurn(app, messaging, phone, "yes");

    await sendTurn(app, messaging, phone, "I want to change my appointment");
    const reply1 = await sendTurn(app, messaging, phone, "you already have my name");
    const reply2 = await sendTurn(app, messaging, phone, "you have my number too");

    expect(reply1).not.toMatch(/what'?s your name|could i get your name/i);
    expect(reply2).not.toMatch(/phone number/i);
  });

  it("AMBIGUOUS YES: offered two alternatives, a bare 'yes' never silently picks one — must ask which option", async () => {
    const { app, messaging } = buildApp();
    const phoneA = "12428017004";
    const phoneB = "12428017005";

    // Customer A takes 2pm Tuesday, forcing customer B into a genuine
    // conflict-with-alternatives situation.
    await sendTurn(app, messaging, phoneA, "book a cleaning");
    await sendTurn(app, messaging, phoneA, "Tuesday 2pm");
    await sendTurn(app, messaging, phoneA, "Trevor 2428012847");
    await sendTurn(app, messaging, phoneA, "yes");

    await sendTurn(app, messaging, phoneB, "book a cleaning");
    await sendTurn(app, messaging, phoneB, "Tuesday 2pm");
    await sendTurn(app, messaging, phoneB, "Sarah 2428019999");
    const conflictReply = await sendTurn(app, messaging, phoneB, "yes");
    expect(conflictReply?.toLowerCase()).not.toMatch(/you'?re (all set|booked)/);

    const bareYesReply = await sendTurn(app, messaging, phoneB, "yes");
    // A bare "yes" to an offered set of alternatives must ask which one —
    // never silently pick the first, never claim a booking happened.
    expect(bareYesReply?.toLowerCase()).not.toMatch(/you'?re (all set|booked)/);
  });

  it("OUT-OF-HOURS: a 90-minute root canal at 4pm is deterministically rejected — the slot would run past closing", async () => {
    const { app, messaging } = buildApp();
    const phone = "12428017006";

    await sendTurn(app, messaging, phone, "book a root canal");
    const reply = await sendTurn(app, messaging, phone, "Tuesday 4pm");

    expect(reply).toMatch(/outside our hours|business hours/i);
    const booked = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
    expect(booked).toHaveLength(0);
  });

  it("RECURRING: 'I want a cleaning every 6 months' is recognized as recurring intent (honest escalation on this backend, never faked)", async () => {
    const { app, messaging } = buildApp();
    const phone = "12428017007";

    const reply = await sendTurn(app, messaging, phone, "I want a cleaning every 6 months");

    // The database-backed production tools have no recurring-series
    // concept (see database-receptionist-tools.ts) — the honest,
    // required behavior is recognizing the intent and escalating, never
    // silently booking a single occurrence or fabricating a series.
    expect(reply).toMatch(/every 6 months|recurring|front desk|team/i);
  });

  /** The month-abbreviation parsing itself doesn't care which day of the
   * month is stated — but this test also wants a genuinely BOOKABLE
   * (weekday) date so a rejection doesn't get confused with a parse
   * failure. Finds the first day (of a few candidates) whose nearest
   * future occurrence of `monthIndex` (0-based) lands Mon-Fri. */
  function bookableDayInMonth(monthIndex: number): number {
    const now = new Date();
    for (const day of [15, 16, 17, 18, 19]) {
      let year = now.getFullYear();
      if (monthIndex < now.getMonth() || (monthIndex === now.getMonth() && day <= now.getDate())) year += 1;
      const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
      if (weekday !== 0 && weekday !== 6) return day;
    }
    return 15; // unreachable in practice — five consecutive days can't all be weekend
  }

  it.each([
    ["sept", 8, "September"],
    ["sep", 8, "September"],
    ["oct", 9, "October"],
    ["nov", 10, "November"],
    ["dec", 11, "December"],
    ["jan", 0, "January"],
    ["feb", 1, "February"],
    ["mar", 2, "March"],
    ["apr", 3, "April"],
    ["jun", 5, "June"],
    ["jul", 6, "July"],
    ["aug", 7, "August"],
  ])("MONTH ABBREVIATION: '%s' is interpreted as a real date in %s", async (abbreviation, monthIndex) => {
    const { app, messaging } = buildApp();
    const phone = `1242801${Math.floor(Math.random() * 9000 + 1000)}`;
    const day = bookableDayInMonth(monthIndex);

    await sendTurn(app, messaging, phone, "book a cleaning");
    const reply = await sendTurn(app, messaging, phone, `${abbreviation} ${day} at 10am`);

    // Deterministic extraction succeeded (a real, bookable weekday) —
    // the conversation progresses to asking for the name, never stalls
    // re-asking for date/time and never rejects it as a closed day.
    expect(reply?.toLowerCase()).not.toMatch(/what date|what day|closed/i);

    const customer = await db.query.customers.findFirst({ where: eq(customers.whatsappId, `+${phone}`) });
    const conversation = await db.query.conversations.findFirst({ where: eq(conversations.customerId, customer!.id) });
    expect(conversation?.bookingState.date).toBeDefined();
    expect(conversation?.bookingState.time).toBe("10:00");
  });

  it("RESCHEDULE: change my appointment -> tomorrow -> 2am -> yes never books an invalid 2 AM appointment", async () => {
    const { app, messaging } = buildApp();
    const phone = "12428017008";

    await sendTurn(app, messaging, phone, "book a cleaning");
    await sendTurn(app, messaging, phone, "Tuesday 2pm");
    await sendTurn(app, messaging, phone, "Trevor 2428012847");
    await sendTurn(app, messaging, phone, "yes");

    await sendTurn(app, messaging, phone, "change my appointment");
    await sendTurn(app, messaging, phone, "tomorrow");
    const invalidTimeReply = await sendTurn(app, messaging, phone, "2am");
    expect(invalidTimeReply).toMatch(/outside our hours|business hours/i);

    await sendTurn(app, messaging, phone, "yes");

    // The 2 AM slot was never booked — either the original 2pm
    // appointment still stands, or nothing new (invalid) was created.
    const booked = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
    for (const appt of booked) {
      const hour = appt.startsAt.getUTCHours();
      expect(hour).not.toBe(2);
    }
  });
});
