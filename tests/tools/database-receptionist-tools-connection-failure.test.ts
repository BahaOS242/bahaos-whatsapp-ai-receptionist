import { describe, expect, it } from "vitest";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import type { AIProvider, AIProviderResponse, RequestAppointmentPayload } from "../../src/ai/types";

/**
 * A genuine database connection failure (not a booking-race conflict —
 * see database-receptionist-tools.test.ts / recoverable slot-conflict
 * tests for that) is a completely different failure mode. It must never
 * crash the turn, and must never be treated as the recoverable
 * slot-conflict case (no `recoverable` field is ever set on a thrown
 * error — see ToolResult.recoverable's docstring). ReceptionistAgent's
 * existing executeAction try/catch + hard-escalate path already handles
 * ANY thrown tool error generically (see
 * tests/ai/receptionist-agent.test.ts's "safety: tool failure (throws)"
 * suite) — this file proves that composition actually holds for the
 * real database-backed tools specifically, the same way
 * google-calendar-receptionist-tools.test.ts's "5. calendar event
 * creation failure" suite proves it for the calendar tools. No real
 * Postgres needed — `db` is a deliberately broken stub simulating an
 * unreachable database, so this runs in the fast default `npm test`
 * suite, not `npm run test:db`.
 */

const VALID_PAYLOAD: RequestAppointmentPayload = {
  name: "Trevor",
  phone: "2428012847",
  service: "Routine cleaning",
  preferredDate: "Monday",
  preferredTime: "10:00",
};

/** Throws on ANY property access — simulates a totally unreachable
 * database without needing to know the exact Drizzle call shape
 * resolveTenant/resolveCustomer/createAppointment happen to use
 * internally (`.query.x`, `.select()`, `.insert()`, `.transaction()`,
 * ...). Whichever one fires first, this throws the same controlled
 * error. */
function brokenDb() {
  return new Proxy(
    {},
    {
      get(): never {
        throw new Error("connection refused");
      },
    },
  ) as never;
}

describe("Database tools — genuine connection failure (not a slot conflict)", () => {
  it("requestAppointment returns honest tool failure, never a false success, when the database is unreachable", async () => {
    const tools = createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, brokenDb());

    await expect(tools.requestAppointment(VALID_PAYLOAD)).rejects.toThrow(/connection refused/);
  });

  it("lets ReceptionistAgent's existing failure/escalation path handle it end to end — never a crash, never a false success, never mistaken for a recoverable slot conflict", async () => {
    const tools = createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, brokenDb());

    const provider: AIProvider = {
      async generateResponse(): Promise<AIProviderResponse> {
        return {
          reply: "Perfect — booking that now.",
          actions: [{ type: "request_appointment", payload: VALID_PAYLOAD }],
          bookingState: {},
        };
      },
    };
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history: [],
      message: "book it",
      bookingState: {},
    });

    // ReceptionistAgent.executeAction catches the throw — the turn
    // completes normally, it just never claims success.
    expect(result.safetyOverride).toBe(true);
    expect(result.reply).toMatch(/wasn't able to complete/i);
    expect(result.reply).not.toContain("Perfect"); // the provider's optimistic reply must never reach the customer
    expect(result.actionsTaken.some((a) => a.action.type === "escalate")).toBe(true);
    expect(result.handoffActive).toBe(true);
  });
});
