import { describe, expect, it, vi } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { BookingState, ConversationTurn, ReceptionistTools } from "../../src/ai/types";

/**
 * End-to-end business-hours coverage through the real
 * ReceptionistAgent/DevRuleBasedAIProvider/ReceptionistTools stack —
 * mirroring how the app actually runs, not just the pure validation
 * function in isolation (see business-hours.test.ts for that).
 */

function makeAgent(
  tools: ReceptionistTools = createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE),
) {
  return new ReceptionistAgent(new DevRuleBasedAIProvider(), tools);
}

async function runConversation(messages: string[], tools?: ReceptionistTools) {
  const agent = makeAgent(tools);
  const conversationManager = new ConversationManager();
  const history: ConversationTurn[] = [];
  let last: Awaited<ReturnType<ReceptionistAgent["handleMessage"]>> | undefined;

  for (const message of messages) {
    const request = conversationManager.buildRequest({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history,
      message,
    });
    last = await agent.handleMessage(request);
    history.push(
      { role: "customer", content: message },
      { role: "assistant", content: last.reply },
    );
    conversationManager.setBookingState(last.bookingState);
  }

  return last!;
}

const BOOK_FILLING_UP_TO_TIME = [
  "I'd like to book an appointment",
  "filling", // Basic filling, 45 minutes
];

describe("Business hours — time parsing (integration confirmation)", () => {
  it("6 AM and 6 PM resolve to different, unambiguous times", async () => {
    const morning = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 6am"]);
    expect(morning.bookingState.time).toBe("06:00");

    const evening = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 6pm"]);
    expect(evening.bookingState.time).toBe("18:00");
  });

  it("a bare ambiguous '6' is never accepted as a time", async () => {
    const result = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 6"]);
    expect(result.bookingState.time).toBeUndefined();
    expect(result.reply).toMatch(/am\/pm/i);
  });
});

describe("Business hours — valid appointment inside hours", () => {
  it("books successfully for a normal mid-day slot", async () => {
    const result = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Tuesday 2pm",
      "Trevor 12428012847",
    ]);

    expect(result.actionsTaken).toEqual([
      expect.objectContaining({
        action: expect.objectContaining({ type: "request_appointment" }),
        result: { success: true },
      }),
    ]);
    expect(result.safetyOverride).toBe(false);
    expect(result.bookingState).toEqual({});
  });
});

describe("Business hours — boundaries", () => {
  it("accepts exactly opening time (09:00)", async () => {
    const result = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Tuesday 9am",
      "Trevor 12428012847",
    ]);
    expect(result.actionsTaken[0].action.type).toBe("request_appointment");
    expect(result.actionsTaken[0].result.success).toBe(true);
  });

  it("rejects exactly closing time (17:00) as a start for a 45-minute service", async () => {
    const result = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Tuesday 5pm",
      "Trevor 12428012847",
    ]);
    expect(result.actionsTaken).toEqual([]);
    expect(result.reply).toMatch(/outside our hours/i);
  });
});

describe("Business hours — out-of-hours and closed-day rejection", () => {
  it('"Tuesday 6 PM" is rejected: no request_appointment, service/name/phone preserved', async () => {
    const requestAppointment = vi.fn(async () => ({ success: true }));
    const tools: ReceptionistTools = {
      createLead: vi.fn(async () => ({ success: true })),
      requestAppointment,
      requestReschedule: vi.fn(async () => ({ success: true })),
      requestCancellation: vi.fn(async () => ({ success: true })),
      escalate: vi.fn(async () => ({ success: true })),
    };

    const result = await runConversation(
      [...BOOK_FILLING_UP_TO_TIME, "Trevor 12428012847", "Tuesday 6pm"],
      tools,
    );

    // The booking tool must never be called for an out-of-hours request.
    expect(requestAppointment).not.toHaveBeenCalled();
    expect(result.actionsTaken).toEqual([]);
    expect(result.safetyOverride).toBe(false);

    expect(result.reply).toMatch(/outside our hours/i);
    expect(result.reply).toMatch(/what time/i);

    const preserved: BookingState = result.bookingState;
    expect(preserved.service).toBe("Basic filling");
    expect(preserved.name).toBe("Trevor");
    expect(preserved.phone).toBe("+12428012847");
    expect(preserved.date).toBeUndefined();
    expect(preserved.time).toBeUndefined();
  });

  it('"Sunday at 3 PM" is rejected: closed day, other info preserved, asks for another day', async () => {
    const requestAppointment = vi.fn(async () => ({ success: true }));
    const tools: ReceptionistTools = {
      createLead: vi.fn(async () => ({ success: true })),
      requestAppointment,
      requestReschedule: vi.fn(async () => ({ success: true })),
      requestCancellation: vi.fn(async () => ({ success: true })),
      escalate: vi.fn(async () => ({ success: true })),
    };

    const result = await runConversation(
      [...BOOK_FILLING_UP_TO_TIME, "Trevor 12428012847", "Sunday at 3pm"],
      tools,
    );

    expect(requestAppointment).not.toHaveBeenCalled();
    expect(result.actionsTaken).toEqual([]);
    expect(result.reply).toMatch(/closed on sundays/i);
    expect(result.reply).toMatch(/what day/i);

    expect(result.bookingState.service).toBe("Basic filling");
    expect(result.bookingState.name).toBe("Trevor");
    expect(result.bookingState.phone).toBe("+12428012847");
    expect(result.bookingState.date).toBeUndefined();
  });
});

describe("Business hours — valid request immediately after correcting an invalid time", () => {
  it("succeeds on the next turn once a valid time is given, without repeating earlier fields", async () => {
    const result = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Trevor 12428012847",
      "Tuesday 6pm", // rejected — after hours
      "Tuesday 2pm", // corrected — within hours
    ]);

    expect(result.actionsTaken).toEqual([
      expect.objectContaining({
        action: {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
        result: { success: true },
      }),
    ]);
    expect(result.reply).not.toMatch(/could i get your name|phone number/i);
  });
});

describe("Business hours — tool-level backstop", () => {
  it("createSimulatedReceptionistTools.requestAppointment independently rejects an out-of-hours payload, bypassing any provider", async () => {
    const tools = createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE);

    const result = await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Basic filling",
      preferredDate: "Sunday",
      preferredTime: "15:00",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/outside business hours/i);
  });

  it("createSimulatedReceptionistTools.requestAppointment succeeds for a genuinely valid payload", async () => {
    const tools = createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE);

    const result = await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Basic filling",
      preferredDate: "Tuesday",
      preferredTime: "14:00",
    });

    expect(result.success).toBe(true);
  });
});
