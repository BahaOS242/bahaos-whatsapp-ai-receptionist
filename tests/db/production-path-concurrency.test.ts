import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { appointments } from "../../src/db/schema";
import { ScriptedLlmChatClient } from "../torture/helpers";
import { createTestDb, resetTestData } from "./db-test-helpers";
import type { LlmChatResult } from "../../src/ai/providers/llm-chat-client";

/**
 * Section 7's explicit requirement: integration coverage for the ACTUAL
 * production booking path — ReceptionistAgent → ConversationManager →
 * LLMProvider → the real database-backed ReceptionistTools — not only
 * the isolated src/db/appointments.ts helper (already covered by
 * appointments-concurrency.test.ts). Two independent, genuinely
 * concurrent customer conversations compete for the exact same
 * tenant/service/time; exactly one may result in a real database
 * appointment, and the losing customer must receive an accurate,
 * non-escalating conflict reply (see ReceptionistAgent's
 * composeSlotConflictReply / ToolResult.recoverable).
 *
 * Requires a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("Production booking path — concurrency (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  /** Drives one customer's conversation, scripted (no live model), up to
   * the moment everything required is known and pendingAction is
   * confirm_service — one message short of the actual booking attempt,
   * which the caller fires separately so two conversations' FINAL turns
   * can race against each other via Promise.all. */
  async function setUpReadyToConfirm(name: string, phone: string) {
    const script: LlmChatResult[] = [
      {
        content: "What day and time works for you?",
        toolCalls: [
          { id: "c1", name: "update_booking_progress", argumentsJson: JSON.stringify({ intent: "book_appointment" }) },
        ],
      },
      { content: "Could I get your name?", toolCalls: [] },
      { content: "unused — auto-confirm bypasses the model", toolCalls: [] },
    ];
    const client = new ScriptedLlmChatClient(script);
    const tools = createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db);
    const agent = new ReceptionistAgent(new LLMProvider(client), tools);
    const manager = new ConversationManager();
    const history: { role: "customer" | "assistant"; content: string }[] = [];

    for (const message of ["I want a cleaning", "Tuesday 2pm", `${name} ${phone}`]) {
      const request = manager.buildRequest({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history, message });
      const result = await agent.handleMessage(request);
      history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
      manager.setBookingState(result.bookingState);
      manager.setHandoffActive(result.handoffActive);
    }

    expect(manager.getBookingState().pendingAction).toBe("confirm_service");
    return { agent, manager, history };
  }

  it("two customers racing for the exact same slot through the REAL production path: exactly one booked appointment, the loser gets an accurate non-escalating reply", async () => {
    const [customerA, customerB] = await Promise.all([
      setUpReadyToConfirm("Trevor", "2428012847"),
      setUpReadyToConfirm("Sarah", "2428019999"),
    ]);

    const [resultA, resultB] = await Promise.all([
      customerA.agent.handleMessage(
        customerA.manager.buildRequest({
          business: BAHAMAS_DENTAL_SERVICE,
          customer: {},
          history: customerA.history,
          message: "yes",
        }),
      ),
      customerB.agent.handleMessage(
        customerB.manager.buildRequest({
          business: BAHAMAS_DENTAL_SERVICE,
          customer: {},
          history: customerB.history,
          message: "yes",
        }),
      ),
    ]);

    const outcomes = [resultA, resultB];
    const booked = outcomes.filter((r) =>
      r.actionsTaken.some((a) => a.action.type === "request_appointment" && a.result.success),
    );
    const conflicted = outcomes.filter((r) =>
      r.actionsTaken.some((a) => a.action.type === "request_appointment" && !a.result.success),
    );

    expect(booked).toHaveLength(1);
    expect(conflicted).toHaveLength(1);

    // The loser must NEVER hear "you're booked" and must NEVER be
    // escalated to a human for this — it's a normal, recoverable outcome.
    expect(conflicted[0].reply).toMatch(/just taken while i was booking it/i);
    expect(conflicted[0].reply.toLowerCase()).not.toMatch(/you'?re (all set|booked)/);
    expect(conflicted[0].handoffActive).toBe(false);
    expect(conflicted[0].actionsTaken.some((a) => a.action.type === "escalate")).toBe(false);

    // The winner correctly hears success.
    expect(booked[0].handoffActive).toBe(false);
    expect(booked[0].actionsTaken.some((a) => a.action.type === "escalate")).toBe(false);

    // Ground truth: the database itself has exactly one appointment.
    const rows = await db.query.appointments.findMany({
      where: eq(appointments.status, "booked"),
    });
    expect(rows).toHaveLength(1);
  });

  it("two customers requesting DIFFERENT times through the real production path: both succeed", async () => {
    const customerA = await setUpReadyToConfirm("Trevor", "2428012847");
    // Second conversation asks for a different time this time.
    const script: LlmChatResult[] = [
      {
        content: "What day and time works for you?",
        toolCalls: [
          { id: "c1", name: "update_booking_progress", argumentsJson: JSON.stringify({ intent: "book_appointment" }) },
        ],
      },
      { content: "Could I get your name?", toolCalls: [] },
      { content: "unused", toolCalls: [] },
    ];
    const clientB = new ScriptedLlmChatClient(script);
    const toolsB = createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db);
    const agentB = new ReceptionistAgent(new LLMProvider(clientB), toolsB);
    const managerB = new ConversationManager();
    const historyB: { role: "customer" | "assistant"; content: string }[] = [];
    for (const message of ["I want a cleaning", "Tuesday 3pm", "Sarah 2428019999"]) {
      const request = managerB.buildRequest({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history: historyB, message });
      const result = await agentB.handleMessage(request);
      historyB.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
      managerB.setBookingState(result.bookingState);
      managerB.setHandoffActive(result.handoffActive);
    }
    expect(managerB.getBookingState().pendingAction).toBe("confirm_service");

    const [resultA, resultB] = await Promise.all([
      customerA.agent.handleMessage(
        customerA.manager.buildRequest({
          business: BAHAMAS_DENTAL_SERVICE,
          customer: {},
          history: customerA.history,
          message: "yes",
        }),
      ),
      agentB.handleMessage(
        managerB.buildRequest({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history: historyB, message: "yes" }),
      ),
    ]);

    for (const result of [resultA, resultB]) {
      expect(result.actionsTaken.some((a) => a.action.type === "request_appointment" && a.result.success)).toBe(
        true,
      );
    }

    const rows = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
    expect(rows).toHaveLength(2);
  });
});
