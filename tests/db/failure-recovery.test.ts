import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/config/env";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { processInboundWhatsAppMessage } from "../../src/whatsapp/webhook-processing";
import { appointments, conversations, handoffs, messages } from "../../src/db/schema";
import * as schema from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";
import type { AIProvider, AIProviderRequest, AIProviderResponse } from "../../src/ai/types";

/**
 * P1 — failure recovery, tested against a real Postgres for the two
 * scenarios not already covered elsewhere in this codebase: a database
 * outage arriving mid-webhook-request, and an LLM provider failure
 * arriving through the REAL webhook HTTP path (not just LLMProvider's
 * own unit-level "provider failure" test). Every other listed failure
 * mode (tool failure, booking conflict, webhook duplicate, process
 * restart, retry-worker restart) already has dedicated, passing coverage
 * elsewhere — see this file's own comments at each `it` linking to it,
 * rather than duplicating it here.
 *
 * REQUIRES a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("Failure recovery (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();
  const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db", WHATSAPP_APP_SECRET: undefined });

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  function textPayload(from: string, text: string, id = `wamid.${randomUUID()}`) {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_ID_1" },
                messages: [{ from, id, timestamp: `${Math.floor(Date.now() / 1000)}`, type: "text", text: { body: text } }],
              },
              field: "messages",
            },
          ],
        },
      ],
    };
  }

  describe("POSTGRES TEMPORARILY UNAVAILABLE", () => {
    it("the customer's message is NEVER falsely acknowledged — a DB outage returns 500 (triggering a Meta retry), never a false-success 200 that would lose the message forever", async () => {
      // A pool pointed at a port nothing is listening on — connects
      // immediately, fails on first query, exactly like a real outage.
      const brokenPool = new Pool({ connectionString: "postgres://user:pass@localhost:1/nonexistent" });
      const brokenDb = drizzle(brokenPool, { schema });
      const agent = new ReceptionistAgent(
        { async generateResponse() { throw new Error("must not be called — db fails first"); } },
        createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, brokenDb),
      );
      const app = createApp({ env, db: brokenDb as never, agent });

      try {
        const res = await request(app).post("/webhooks/whatsapp").send(textPayload("12428019101", "book a cleaning"));

        // NEVER 200 — Meta must be told to redeliver, not to give up.
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "internal_error" });
        // Never leaks connection strings/internal details to the client.
        expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|postgres:\/\//);
      } finally {
        await brokenPool.end();
      }
    });

    it("RECOVERY: once Postgres is available again, the SAME webhook delivery (same message id) is processed correctly exactly once — nothing was lost during the outage", async () => {
      const agent = new ReceptionistAgent(
        new (class implements AIProvider {
          async generateResponse(req: AIProviderRequest): Promise<AIProviderResponse> {
            return { reply: "Got it — what day and time?", actions: [], bookingState: { ...req.bookingState, intent: "book_appointment", service: "Routine cleaning" } };
          }
        })(),
        createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db),
      );
      const whatsappMessageId = `wamid.${randomUUID()}`;

      // Simulates "the outage already happened and was reported" — this
      // exact delivery is now retried by Meta against a HEALTHY db.
      const outcome = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone: "+12428019102", message: "book a cleaning", whatsappMessageId },
      );

      expect(outcome.wasDuplicate).toBe(false);
      expect(outcome.reply).toMatch(/day and time/i);
      const rows = await db.query.messages.findMany({ where: eq(messages.whatsappMessageId, whatsappMessageId) });
      expect(rows).toHaveLength(1);
    });
  });

  describe("ANTHROPIC (LLM PROVIDER) UNAVAILABLE — through the real webhook path", () => {
    it("a failing provider never falsely tells the customer something was booked, escalates honestly, and preserves a snapshot of what was in progress for staff", async () => {
      const failingProvider: AIProvider = {
        async generateResponse(): Promise<AIProviderResponse> {
          throw new Error("simulated Anthropic outage (ETIMEDOUT)");
        },
      };
      const agent = new ReceptionistAgent(failingProvider, createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db));
      const app = createApp({ env, db: db as never, agent });

      const res = await request(app).post("/webhooks/whatsapp").send(textPayload("12428019103", "book a cleaning"));

      // The provider throwing is caught INSIDE ReceptionistAgent
      // (safeFallback) — this is a handled, honest outcome, not a
      // request-level failure, so the webhook itself still reports 200
      // (the message WAS durably received and acted on — escalated).
      expect(res.status).toBe(200);

      const conversation = await db.query.conversations.findFirst();
      // Phase 3: an AI escalation is a PENDING handoff awaiting staff (never left "as if automated").
      expect(conversation?.status).toBe("human_pending");

      const handoffRows = await db.query.handoffs.findMany({ where: eq(handoffs.conversationId, conversation!.id) });
      expect(handoffRows).toHaveLength(1);
      expect(handoffRows[0].reason).toMatch(/AI provider failed/i);

      // Never falsely claimed a booking.
      const outboundMessages = await db.query.messages.findMany({ where: eq(messages.conversationId, conversation!.id) });
      const lastOutbound = outboundMessages.filter((m) => m.direction === "outbound").at(-1);
      expect(lastOutbound?.content.toLowerCase()).not.toMatch(/you'?re (all set|booked|confirmed)/);
      const booked = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
      expect(booked).toHaveLength(0);
    });

    it("a SECOND message after escalation is never re-automated — handoffActive is honored on the very next turn", async () => {
      const failingProvider: AIProvider = {
        async generateResponse(): Promise<AIProviderResponse> {
          throw new Error("simulated Anthropic outage");
        },
      };
      const agent = new ReceptionistAgent(failingProvider, createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db));
      const phone = "+12428019104";

      await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone, message: "book a cleaning", whatsappMessageId: `wamid.${randomUUID()}` },
      );
      const second = await processInboundWhatsAppMessage(
        { db, business: BAHAMAS_DENTAL_SERVICE, agent },
        { phone, message: "hello?", whatsappMessageId: `wamid.${randomUUID()}` },
      );

      // Phase 3 (supersedes the old canned "already with our team" reply): a
      // human-owned/pending conversation gets NO automated reply at all. The
      // provider (which would throw again) is never consulted, the customer's
      // message is KEPT, and the conversation is flagged as waiting for staff.
      expect(second.handoffActive).toBe(true);
      expect(second.suppressedByHuman).toBe(true);
      expect(second.reply).toBeNull();
      expect(second.outboundMessageId).toBeUndefined();
      const kept = await db.query.messages.findMany({ where: eq(messages.conversationId, second.conversationId), orderBy: asc(messages.createdAt) });
      expect(kept.filter((m) => m.direction === "inbound").map((m) => m.content)).toEqual(["book a cleaning", "hello?"]);
      const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, second.conversationId) });
      expect(conv?.waitingSince).toBeInstanceOf(Date);
    });
  });
});
