import { describe, expect, it } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { BusinessContext, ConversationTurn, ReceptionistTools } from "../../src/ai/types";

/**
 * Required flow order (enforced in dev-rule-based-provider.ts's
 * finishFlowTurn, right after business-hours validation): service -> date
 * -> time -> availability check -> name -> phone -> booking action. These
 * 5 tests cover exactly that new step; business-hours coverage itself
 * lives in business-hours-flow.test.ts, unchanged.
 */

const BUSINESS_WITH_HELD_SLOT: BusinessContext = {
  ...BAHAMAS_DENTAL_SERVICE,
  unavailableSlots: [{ date: "Tuesday", time: "14:00" }],
};

function makeAgent(
  tools: ReceptionistTools = createSimulatedReceptionistTools(BUSINESS_WITH_HELD_SLOT),
) {
  return new ReceptionistAgent(new DevRuleBasedAIProvider(), tools);
}

async function runConversation(messages: string[], tools?: ReceptionistTools) {
  const agent = makeAgent(tools);
  const conversationManager = new ConversationManager();
  const history: ConversationTurn[] = [];
  const turns: Awaited<ReturnType<ReceptionistAgent["handleMessage"]>>[] = [];

  for (const message of messages) {
    const request = conversationManager.buildRequest({
      business: BUSINESS_WITH_HELD_SLOT,
      customer: {},
      history,
      message,
    });
    const result = await agent.handleMessage(request);
    turns.push(result);
    history.push(
      { role: "customer", content: message },
      { role: "assistant", content: result.reply },
    );
    conversationManager.setBookingState(result.bookingState);
  }

  return { last: turns[turns.length - 1], turns };
}

const BOOK_FILLING_UP_TO_TIME = ["I'd like to book an appointment", "filling"];

describe("Availability — checked after business hours, before name/phone", () => {
  it("1. an available slot proceeds to asking for name (unaffected by the new check)", async () => {
    const { last: result } = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 3pm"]);

    expect(result.actionsTaken).toEqual([]);
    expect(result.reply).toMatch(/name/i);
    expect(result.bookingState.date).toBe("Tuesday");
    expect(result.bookingState.time).toBe("15:00");
  });

  it("2. an unavailable (but in-hours) slot does NOT ask for name — the very next reply asks about the time instead", async () => {
    const { last: result } = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 2pm"]);

    expect(result.actionsTaken).toEqual([]);
    expect(result.reply).toMatch(/already booked/i);
    expect(result.reply).not.toMatch(/could i get your name/i);
    expect(result.bookingState.service).toBe("Basic filling");
    expect(result.bookingState.date).toBe("Tuesday");
    expect(result.bookingState.time).toBeUndefined();
  });

  it("3. an unavailable slot offers same-day available alternative times", async () => {
    const { last: result } = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 2pm"]);

    // 9:00 AM is the first same-day slot that is both within hours for a
    // 45-minute filling and not the held 14:00 slot.
    expect(result.reply).toMatch(/9:00 AM/);
  });

  it("4. selecting an offered alternative proceeds normally and asks for name", async () => {
    const { last: result } = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Tuesday 2pm", // unavailable — offers 9:00 AM among others
      "9am", // customer picks the alternative
    ]);

    expect(result.actionsTaken).toEqual([]);
    expect(result.reply).toMatch(/name/i);
    expect(result.bookingState.date).toBe("Tuesday");
    expect(result.bookingState.time).toBe("09:00");
  });

  it("5. the booking completes once name/phone are given after selecting the alternative, and confirmed", async () => {
    const { turns } = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Tuesday 2pm", // unavailable
      "9am", // selects alternative
      "Trevor 12428012847",
      "yes",
    ]);
    const confirming = turns[turns.length - 2];
    const result = turns[turns.length - 1];

    // Objective 2's hard gate: every field being known first presents a
    // confirm-and-summarize prompt, not an immediate booking.
    expect(confirming.actionsTaken).toEqual([]);
    expect(confirming.bookingState.pendingAction).toBe("confirm_booking");
    expect(confirming.reply).toMatch(/reply yes to confirm/i);

    expect(result.actionsTaken).toEqual([
      expect.objectContaining({
        action: {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "09:00",
          },
        },
        result: { success: true },
      }),
    ]);
    expect(result.bookingState).toEqual({});
  });
});
