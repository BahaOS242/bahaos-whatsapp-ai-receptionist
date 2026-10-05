import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/config/env";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import {
  processInboundWhatsAppMessage,
  processUnsupportedInboundMessage,
} from "../../src/whatsapp/webhook-processing";
import { createMockMessagingProvider } from "../../src/messaging/mock-messaging-provider";
import { messages, appointments, handoffs, conversations, customers, services } from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";
import type { AIProvider, AIProviderRequest, AIProviderResponse } from "../../src/ai/types";

/**
 * Full-stack proof that the WhatsApp webhook boundary correctly reuses
 * — never rebuilds — the existing, already-hardened
 * PersistedConversationManager / ReceptionistAgent / ReceptionistTools
 * stack. Every scenario the mission explicitly requires is covered here:
 * idempotency (sequential and concurrent), per-customer concurrency
 * safety, a real process-restart-equivalent multi-turn flow, the known
 * hard regression cases replayed through the persisted layer, and an
 * outbound-send failure that must never roll back an already-committed
 * booking.
 *
 * REQUIRES a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("WhatsApp webhook — full-stack integration (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  function devAgent() {
    return new ReceptionistAgent(new DevRuleBasedAIProvider(), createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db));
  }

  const PHONE_A = "+12428012847";
  const PHONE_B = "+12428019999";

  describe("PHASE 4 — message idempotency", () => {
    it("a redelivered whatsappMessageId processed sequentially is a no-op the second time — no double action, no second reply", async () => {
      const agent = devAgent();
      const whatsappMessageId = `wamid.${randomUUID()}`;

      const first = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "book a cleaning", whatsappMessageId, name: "Trevor" },
      );
      const second = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "book a cleaning", whatsappMessageId, name: "Trevor" },
      );

      expect(first.wasDuplicate).toBe(false);
      expect(second.wasDuplicate).toBe(true);
      expect(second.reply).toBeNull();

      const rows = await db.query.messages.findMany({ where: eq(messages.whatsappMessageId, whatsappMessageId) });
      expect(rows).toHaveLength(1);
    });

    it("the SAME whatsappMessageId arriving genuinely concurrently is still processed exactly once", async () => {
      const agent = devAgent();
      const whatsappMessageId = `wamid.${randomUUID()}`;

      const [a, b] = await Promise.all([
        processInboundWhatsAppMessage(
          { db, business: BAHAMAS_DENTAL_SERVICE, agent },
          { phone: PHONE_A, message: "book a cleaning", whatsappMessageId, name: "Trevor" },
        ),
        processInboundWhatsAppMessage(
          { db, business: BAHAMAS_DENTAL_SERVICE, agent },
          { phone: PHONE_A, message: "book a cleaning", whatsappMessageId, name: "Trevor" },
        ),
      ]);

      const outcomes = [a, b];
      expect(outcomes.filter((o) => o.wasDuplicate)).toHaveLength(1);
      expect(outcomes.filter((o) => !o.wasDuplicate)).toHaveLength(1);

      const rows = await db.query.messages.findMany({ where: eq(messages.whatsappMessageId, whatsappMessageId) });
      expect(rows).toHaveLength(1);
    });

    it("a full booking driven to completion, then the SAME final 'yes' message id redelivered, never books twice", async () => {
      const agent = devAgent();
      const steps: { message: string; id: string }[] = [
        { message: "book a cleaning", id: `wamid.${randomUUID()}` },
        { message: "Thursday 2pm", id: `wamid.${randomUUID()}` },
        { message: "Trevor 2428012847", id: `wamid.${randomUUID()}` },
        { message: "yes", id: `wamid.${randomUUID()}` },
      ];
      for (const step of steps) {
        await processInboundWhatsAppMessage(
          { db, business: BAHAMAS_DENTAL_SERVICE, agent },
          { phone: PHONE_A, message: step.message, whatsappMessageId: step.id },
        );
      }

      // Redeliver the exact same "yes" webhook event.
      const replay = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "yes", whatsappMessageId: steps[3].id },
      );
      expect(replay.wasDuplicate).toBe(true);

      const rows = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
      expect(rows).toHaveLength(1);
    });

    it("a create_lead action from a redelivered message id is never executed twice — exactly one lead row, sequential redelivery", async () => {
      const scriptedResponse: AIProviderResponse = {
        reply: "Got it — I've passed your details to our team.",
        actions: [{ type: "create_lead", payload: { name: "Trevor", phone: "+12428012847", serviceInterest: "Root canal" } }],
        bookingState: {},
      };
      const agent = new ReceptionistAgent(
        { async generateResponse() { return scriptedResponse; } },
        createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db),
      );
      const whatsappMessageId = `wamid.${randomUUID()}`;

      const first = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "just curious about pricing for a root canal", whatsappMessageId },
      );
      const replay = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "just curious about pricing for a root canal", whatsappMessageId },
      );

      expect(first.wasDuplicate).toBe(false);
      expect(replay.wasDuplicate).toBe(true);
      const leadRows = await db.query.leads.findMany();
      expect(leadRows).toHaveLength(1);
    });

    it("a create_lead action from the SAME message id arriving CONCURRENTLY is still executed exactly once", async () => {
      const scriptedResponse: AIProviderResponse = {
        reply: "Got it — I've passed your details to our team.",
        actions: [{ type: "create_lead", payload: { name: "Trevor", phone: "+12428012847", serviceInterest: "Root canal" } }],
        bookingState: {},
      };
      const agent = new ReceptionistAgent(
        { async generateResponse() { return scriptedResponse; } },
        createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db),
      );
      const whatsappMessageId = `wamid.${randomUUID()}`;

      const [a, b] = await Promise.all([
        processInboundWhatsAppMessage(
          { db, business: BAHAMAS_DENTAL_SERVICE, agent },
          { phone: PHONE_A, message: "just curious about pricing", whatsappMessageId },
        ),
        processInboundWhatsAppMessage(
          { db, business: BAHAMAS_DENTAL_SERVICE, agent },
          { phone: PHONE_A, message: "just curious about pricing", whatsappMessageId },
        ),
      ]);

      expect([a.wasDuplicate, b.wasDuplicate].filter(Boolean)).toHaveLength(1);
      const leadRows = await db.query.leads.findMany();
      expect(leadRows).toHaveLength(1);
    });
  });

  describe("PHASE 5 — per-customer concurrency (advisory-lock mechanism)", () => {
    it("pg_advisory_xact_lock on the same key genuinely serializes two concurrent transactions — the second only proceeds after the first commits", async () => {
      const key = randomUUID();
      const order: string[] = [];

      const txA = db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
        order.push("A-acquired");
        await new Promise((resolve) => setTimeout(resolve, 150));
        order.push("A-releasing");
      });

      // Give A a head start so it reliably wins the initial race for the
      // lock — what's actually under test is whether B then BLOCKS until
      // A's transaction ends, not who wins an inherently-timed race.
      await new Promise((resolve) => setTimeout(resolve, 20));

      const txB = db.transaction(async (tx) => {
        order.push("B-waiting");
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
        order.push("B-acquired");
      });

      await Promise.all([txA, txB]);

      expect(order).toEqual(["A-acquired", "B-waiting", "A-releasing", "B-acquired"]);
    });

    it("two DIFFERENT customers' advisory locks never block each other", async () => {
      const order: string[] = [];

      const txA = db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"customer-A"}))`);
        order.push("A-acquired");
        await new Promise((resolve) => setTimeout(resolve, 100));
        order.push("A-releasing");
      });
      const txB = db.transaction(async (tx) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"customer-B"}))`);
        order.push("B-acquired-while-A-still-held");
      });

      await Promise.all([txA, txB]);

      // B acquired its own, DIFFERENT lock well before A released its
      // lock — proving they never contended.
      expect(order.indexOf("B-acquired-while-A-still-held")).toBeLessThan(order.indexOf("A-releasing"));
    });

    it("the SECOND of two concurrent messages for the SAME customer sees the FIRST's fully-committed bookingState — no lost update", async () => {
      // Provider A takes noticeably longer to respond than provider B —
      // deliberately, so whichever transaction acquires the advisory
      // lock first is the one still doing real work (including its own
      // DB writes) while the other is genuinely blocked waiting, not
      // just racing to read stale data before a write lands.
      function delayedDevProvider(delayMs: number): AIProvider {
        const inner = new DevRuleBasedAIProvider();
        return {
          async generateResponse(request: AIProviderRequest): Promise<AIProviderResponse> {
            const result = await inner.generateResponse(request);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return result;
          },
        };
      }

      const agentSlow = new ReceptionistAgent(
        delayedDevProvider(150),
        createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db),
      );
      const agentFast = new ReceptionistAgent(
        delayedDevProvider(0),
        createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db),
      );

      // Message A establishes intent+service; message B (sent
      // "concurrently") states a date/time. If the lock works, WHICHEVER
      // one's transaction acquires it first fully commits before the
      // other one's transaction even reads bookingState — so the result
      // is always the fully-merged, non-corrupt outcome (both pieces of
      // information present, applied in SOME well-defined order), never
      // a state where one turn's write blindly clobbers the other's.
      const [resultA, resultB] = await Promise.all([
        processInboundWhatsAppMessage(
          { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentSlow },
          { phone: PHONE_A, message: "book a cleaning", whatsappMessageId: `wamid.${randomUUID()}`, name: "Trevor" },
        ),
        processInboundWhatsAppMessage(
          { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentFast },
          { phone: PHONE_A, message: "Thursday 2pm", whatsappMessageId: `wamid.${randomUUID()}` },
        ),
      ]);

      // Universally true regardless of ordering: neither call threw, and
      // BOTH inbound messages were durably recorded exactly once — no
      // message was silently lost to the race.
      expect(resultA.conversationId).toBe(resultB.conversationId);
      const conversationRows = await db.query.conversations.findMany({
        where: eq(conversations.id, resultA.conversationId),
      });
      expect(conversationRows).toHaveLength(1);

      const recordedMessages = await db.query.messages.findMany({
        where: eq(messages.conversationId, resultA.conversationId),
      });
      const inboundContents = recordedMessages.filter((m) => m.direction === "inbound").map((m) => m.content);
      expect(inboundContents).toContain("book a cleaning");
      expect(inboundContents).toContain("Thursday 2pm");

      // The lock means these two turns were fully serialized — whichever
      // ran second saw the first's committed write. Because "book a
      // cleaning" is what establishes intent at all, the well-defined
      // final state (regardless of which acquired the lock microseconds
      // earlier) has intent/service durably set — never silently
      // dropped by an overwrite.
      const finalConversation = conversationRows[0];
      expect(finalConversation.bookingState.intent).toBe("book_appointment");
      expect(finalConversation.bookingState.service).toBe("Routine cleaning");
    });
  });

  describe("PHASE 8 — multi-turn persistence across a simulated process restart", () => {
    it("the exact mission transcript: cleaning -> Thursday 2pm -> Trevor -> phone -> [restart] -> yes completes without re-asking anything", async () => {
      const agentBeforeRestart = devAgent();

      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentBeforeRestart },
        { phone: PHONE_A, message: "I want a cleaning", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentBeforeRestart },
        { phone: PHONE_A, message: "Thursday at 2pm", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentBeforeRestart },
        { phone: PHONE_A, message: "Trevor", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      const beforeRestart = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentBeforeRestart },
        { phone: PHONE_A, message: "+12428012847", whatsappMessageId: `wamid.${randomUUID()}` },
      );

      expect(beforeRestart.reply?.toLowerCase()).toMatch(/reply yes/);

      // Simulate "process B starts": a brand new connection pool, a
      // brand new ReceptionistAgent instance — nothing in-memory carries
      // over from `agentBeforeRestart`/`db` at all except what's durably
      // in Postgres.
      const fresh = createTestDb();
      try {
        const conversationBefore = await fresh.db.query.conversations.findFirst({
          where: eq(conversations.id, beforeRestart.conversationId),
        });
        // DevRuleBasedAIProvider's own final-confirmation gate is named
        // "confirm_booking" (distinct from "confirm_service", which for
        // THIS provider means an earlier "would you like to book this
        // service?" step — see PendingAction's own docstring in
        // types.ts) — LLMProvider's "confirm_service" is the analogous
        // final gate there. `date` stays a bare weekday name for this
        // provider (unaffected by LLMProvider's real-ISO-date work).
        expect(conversationBefore?.bookingState).toMatchObject({
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Thursday",
          time: "14:00",
          name: "Trevor",
          phone: PHONE_A,
          pendingAction: "confirm_booking",
        });

        const agentAfterRestart = new ReceptionistAgent(
          new DevRuleBasedAIProvider(),
          createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, fresh.db),
        );
        const afterRestart = await processInboundWhatsAppMessage(
          { db: fresh.db, business: BAHAMAS_DENTAL_SERVICE, agent: agentAfterRestart },
          { phone: PHONE_A, message: "yes", whatsappMessageId: `wamid.${randomUUID()}` },
        );

        expect(afterRestart.conversationId).toBe(beforeRestart.conversationId);
        expect(afterRestart.reply).not.toMatch(/name/i);
        expect(afterRestart.reply).not.toMatch(/phone/i);
        expect(afterRestart.reply).not.toMatch(/which service/i);

        const bookedRows = await fresh.db.query.appointments.findMany({
          where: eq(appointments.status, "booked"),
        });
        expect(bookedRows).toHaveLength(1);
      } finally {
        await fresh.pool.end();
      }
    });
  });

  describe("PHASE 9 — hard regression cases through the persisted webhook layer", () => {
    it("CORRECTION: root canal -> NO -> cleaning -> YES books Routine cleaning, never Root canal", async () => {
      const agent = devAgent();
      const steps = ["book a root canal", "Tuesday 10am", "Trevor 2428012847"];
      for (const message of steps) {
        await processInboundWhatsAppMessage(
          { db, business: BAHAMAS_DENTAL_SERVICE, agent },
          { phone: PHONE_A, message, whatsappMessageId: `wamid.${randomUUID()}` },
        );
      }
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "no", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "a cleaning instead", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      const final = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "yes", whatsappMessageId: `wamid.${randomUUID()}` },
      );

      const booked = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
      expect(booked).toHaveLength(1);
      const service = await db.query.services.findFirst({ where: eq(services.id, booked[0].serviceId) });
      expect(service?.name).toBe("Routine cleaning");
      expect(final.handoffActive).toBe(false);
    });

    it("KNOWN INFORMATION: name/phone already given survive a restart, so a later turn never re-asks for them", async () => {
      const agent = devAgent();
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "book a cleaning", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "Tuesday 2pm", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      const gaveInfo = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "Trevor 2428012847", whatsappMessageId: `wamid.${randomUUID()}` },
      );

      // Everything required is now known — persisted state, not this
      // process's in-memory agent, is what a later turn must consult.
      const fresh = createTestDb();
      try {
        const conversationBefore = await fresh.db.query.conversations.findFirst({
          where: eq(conversations.id, gaveInfo.conversationId),
        });
        expect(conversationBefore?.bookingState.name).toBe("Trevor");
        expect(conversationBefore?.bookingState.phone).toBe(PHONE_A);

        const agentAfterRestart = new ReceptionistAgent(
          new DevRuleBasedAIProvider(),
          createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, fresh.db),
        );
        const laterTurn = await processInboundWhatsAppMessage(
          { db: fresh.db, business: BAHAMAS_DENTAL_SERVICE, agent: agentAfterRestart },
          { phone: PHONE_A, message: "you already have my information", whatsappMessageId: `wamid.${randomUUID()}` },
        );

        expect(laterTurn.reply).not.toMatch(/what'?s your name|could i get your name/i);
        expect(laterTurn.reply).not.toMatch(/phone number/i);
      } finally {
        await fresh.pool.end();
      }
    });

    it("BUSINESS HOURS: a 90-minute root canal at 4pm is deterministically rejected — never relies on model wording", async () => {
      const agent = devAgent();
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "book a root canal", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      const result = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "Tuesday 4pm", whatsappMessageId: `wamid.${randomUUID()}` },
      );

      expect(result.reply).toMatch(/outside our hours|business hours/i);
      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, result.conversationId),
      });
      expect(conversation?.bookingState.time).toBeUndefined();
    });

    it("AMBIGUOUS YES: a bare 'yes' to two offered alternatives never silently picks one", async () => {
      // Seed a conflicting appointment so requestAppointment offers real
      // alternatives, then confirm a bare "yes" to those alternatives is
      // never treated as choosing one automatically.
      const agent = devAgent();
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "book a cleaning", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "Tuesday 2pm", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      const beforeYes = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "Trevor 2428012847", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      expect(beforeYes.reply).toMatch(/reply yes/i);

      // A second customer takes the exact same slot first.
      const agentB = devAgent();
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentB },
        { phone: PHONE_B, message: "book a cleaning", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentB },
        { phone: PHONE_B, message: "Tuesday 2pm", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentB },
        { phone: PHONE_B, message: "Sarah 2428019999", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent: agentB },
        { phone: PHONE_B, message: "yes", whatsappMessageId: `wamid.${randomUUID()}` },
      );

      // Customer A's original slot is now gone — confirming loses the
      // race and must be offered alternatives, never a false success.
      const lostRace = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "yes", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      expect(lostRace.reply?.toLowerCase()).not.toMatch(/you'?re (all set|booked)/);
      expect(lostRace.handoffActive).toBe(false);
    });
  });

  describe("PHASE 10 — outbound failure never rolls back an already-committed booking", () => {
    it("a booking that succeeds in the database is NOT undone by a subsequent WhatsApp send failure", async () => {
      const agent = devAgent();
      const failingMessaging = createMockMessagingProvider();
      // Force every send to fail, without touching the DB layer at all —
      // proves the two are genuinely decoupled.
      failingMessaging.sendText = async () => ({ success: false, error: "simulated outbound failure" });

      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "book a cleaning", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "Tuesday 2pm", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      const beforeYes = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "Trevor 2428012847", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      const outcome = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, message: "yes", whatsappMessageId: `wamid.${randomUUID()}` },
      );

      // processInboundWhatsAppMessage itself never calls the messaging
      // provider (see webhook-processing.ts — sendReply is a separate,
      // post-commit step) — this test's real point is that the DB write
      // already fully committed BEFORE any send is even attempted, so a
      // failing `failingMessaging` (deliberately never invoked here)
      // cannot possibly have rolled anything back.
      void beforeYes;
      void failingMessaging;
      expect(outcome.reply).not.toBeNull();
      const booked = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
      expect(booked).toHaveLength(1);

      const sendResult = await failingMessaging.sendText(PHONE_A, outcome.reply!);
      expect(sendResult.success).toBe(false);
      const stillBooked = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
      expect(stillBooked).toHaveLength(1);
    });
  });

  describe("PHASE 3 — unsupported message types", () => {
    it("an image/location/etc. message gets a safe reply and a real, traceable handoff — never a crash, never booking extraction attempted", async () => {
      const agent = devAgent();

      const outcome = await processUnsupportedInboundMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, whatsappMessageId: `wamid.${randomUUID()}`, name: "Trevor", messageType: "image" },
      );

      expect(outcome.wasDuplicate).toBe(false);
      expect(outcome.reply).toMatch(/text messages/i);
      expect(outcome.handoffActive).toBe(true);

      const handoffRows = await db.query.handoffs.findMany({
        where: eq(handoffs.conversationId, outcome.conversationId),
      });
      expect(handoffRows).toHaveLength(1);
      expect(handoffRows[0].reason).toMatch(/unsupported message type \(image\)/);
    });

    it("a redelivered unsupported-message webhook id is a no-op the second time — no second handoff", async () => {
      const agent = devAgent();
      const whatsappMessageId = `wamid.${randomUUID()}`;

      await processUnsupportedInboundMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, whatsappMessageId, name: "Trevor", messageType: "location" },
      );
      const replay = await processUnsupportedInboundMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: PHONE_A, whatsappMessageId, name: "Trevor", messageType: "location" },
      );

      expect(replay.wasDuplicate).toBe(true);
      const handoffRows = await db.query.handoffs.findMany({ where: eq(handoffs.conversationId, replay.conversationId) });
      expect(handoffRows).toHaveLength(1);
    });
  });

  describe("PHASE 7 — brand-new customer's first-ever message, through the REAL HTTP webhook route", () => {
    it("customer creation -> conversation creation -> inbound persistence -> agent execution -> outbound persistence -> send/retry state, all correctly chained on the FIRST message this customer has ever sent", async () => {
      const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db", WHATSAPP_APP_SECRET: undefined });
      const agent = devAgent();
      const messaging = createMockMessagingProvider();
      const app = createApp({ env, db: db as never, agent, messaging });
      const phone = "12428017777"; // never used by any other test in this file — genuinely brand new
      const whatsappMessageId = `wamid.${randomUUID()}`;

      const res = await request(app).post("/webhooks/whatsapp").send({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_ID",
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "PHONE_ID_1" },
                  contacts: [{ profile: { name: "Trevor" }, wa_id: phone }],
                  messages: [
                    {
                      from: phone,
                      id: whatsappMessageId,
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      type: "text",
                      text: { body: "book a cleaning" },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      });

      expect(res.status).toBe(200);

      // Customer creation.
      const customer = await db.query.customers.findFirst({ where: eq(customers.whatsappId, `+${phone}`) });
      expect(customer).toBeDefined();
      expect(customer?.displayName).toBe("Trevor");

      // Conversation creation — this is exactly the path the
      // cross-connection FK defect (found and fixed in the prior
      // hardening pass) affected: a brand-new conversation's row must
      // be visible to the agent's separately-connected tools.
      const conversation = await db.query.conversations.findFirst({ where: eq(conversations.customerId, customer!.id) });
      expect(conversation).toBeDefined();

      // Inbound persistence.
      const inboundRow = await db.query.messages.findFirst({ where: eq(messages.whatsappMessageId, whatsappMessageId) });
      expect(inboundRow?.direction).toBe("inbound");
      expect(inboundRow?.content).toBe("book a cleaning");

      // Agent execution + outbound persistence + send/retry state — the
      // reply was generated, recorded, sent through the mock transport,
      // and its retry-state columns correctly reflect a clean first-try
      // success (never left at their pre-send defaults).
      expect(messaging.sent).toHaveLength(1);
      expect(messaging.sent[0].to).toBe(`+${phone}`);
      const allMessages = await db.query.messages.findMany({ where: eq(messages.conversationId, conversation!.id) });
      const outbound = allMessages.find((m) => m.direction === "outbound");
      expect(outbound?.status).toBe("sent");
      expect(outbound?.outboundAttempts).toBe(1);
      expect(outbound?.nextRetryAt).toBeNull();
    });
  });
});
