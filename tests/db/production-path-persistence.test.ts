import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { PersistedConversationManager } from "../../src/db/persisted-conversation";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { handoffs } from "../../src/db/schema";
import { ScriptedLlmChatClient } from "../torture/helpers";
import { createTestDb, resetTestData } from "./db-test-helpers";
import type { LlmChatResult } from "../../src/ai/providers/llm-chat-client";

/**
 * End-to-end proof that Objective 1's persistence layer is genuinely
 * WIRED into the real production path — ReceptionistAgent →
 * (conversationId-stamping) → ReceptionistTools → real Postgres — not
 * just directly callable in isolation (see database-receptionist-tools.test.ts's
 * "real persistence" suites for that). Drives the actual conversation
 * through PersistedConversationManager + LLMProvider +
 * createDatabaseReceptionistTools, exactly the combination a real
 * WhatsApp webhook would eventually use (see PHASE1_PROGRESS.md — the
 * webhook itself remains explicitly out of scope).
 *
 * REQUIRES a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("Production path — persistence wiring (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("an escalation through the REAL conversational stack persists a real, traceable handoff row — and survives a process restart", async () => {
    const script: LlmChatResult[] = [
      {
        content: "I'd be happy to have someone from the team help with that.",
        toolCalls: [
          {
            id: "c1",
            name: "escalate",
            argumentsJson: JSON.stringify({ reason: "customer explicitly asked for a person" }),
          },
        ],
      },
    ];
    const client = new ScriptedLlmChatClient(script);
    const tools = createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db);
    const agent = new ReceptionistAgent(new LLMProvider(client), tools);

    const manager = await PersistedConversationManager.loadOrCreate(
      db,
      BAHAMAS_DENTAL_SERVICE,
      "+12428012847",
      "Trevor",
    );
    await manager.recordInboundMessage("can I talk to a person please");

    const request = manager.buildRequest({
      customer: {},
      history: await manager.loadHistory(),
      message: "can I talk to a person please",
    });
    // The one thing a real caller (a future webhook) would do that
    // buildRequest alone doesn't: attach the durable conversationId so
    // ReceptionistAgent can stamp it onto the escalate action.
    const requestWithConversation = { ...request, conversationId: manager.conversationId };

    const result = await agent.handleMessage(requestWithConversation);
    await manager.recordOutboundMessage(result.reply);
    await manager.commitTurn(result.bookingState, result.handoffActive);

    expect(result.handoffActive).toBe(true);
    expect(result.actionsTaken.some((a) => a.action.type === "escalate" && a.result.success)).toBe(true);

    // Simulate a process restart: fresh pool, fresh connection.
    const fresh = createTestDb();
    try {
      const rows = await fresh.db.query.handoffs.findMany({
        where: eq(handoffs.conversationId, manager.conversationId),
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].reason).toBe("customer explicitly asked for a person");
      expect(rows[0].status).toBe("open");
      expect(rows[0].context).toBeDefined();

      // The conversation's own persisted state also survives.
      const restoredManager = await PersistedConversationManager.loadOrCreate(
        fresh.db,
        BAHAMAS_DENTAL_SERVICE,
        "+12428012847",
      );
      expect(restoredManager.conversationId).toBe(manager.conversationId);
      expect(restoredManager.getHandoffActive()).toBe(true);
      const history = await restoredManager.loadHistory();
      expect(history).toEqual([
        { role: "customer", content: "can I talk to a person please" },
        { role: "assistant", content: result.reply },
      ]);
    } finally {
      await fresh.pool.end();
    }
  });
});
