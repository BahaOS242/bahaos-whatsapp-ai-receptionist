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
 *
 * Required flow order (enforced in dev-rule-based-provider.ts's
 * finishFlowTurn): intent -> service -> date -> time -> business-hours
 * validation -> availability -> name -> phone -> booking action. Hours
 * validation happens the moment date+time are BOTH known — before name or
 * phone are ever asked, not just as a last check once every field
 * (including name/phone) has already been collected. Several tests below
 * deliberately give date/time in NATURAL order (before name/phone) to
 * prove that ordering directly, alongside the pre-existing tests that
 * give name/phone first (which prove preservation, a separate concern).
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
  const turns: Awaited<ReturnType<ReceptionistAgent["handleMessage"]>>[] = [];

  for (const message of messages) {
    const request = conversationManager.buildRequest({
      business: BAHAMAS_DENTAL_SERVICE,
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

const BOOK_FILLING_UP_TO_TIME = [
  "I'd like to book an appointment",
  "filling", // Basic filling, 45 minutes
];

describe("Business hours — time parsing (integration confirmation)", () => {
  it("6 AM and 6 PM are parsed as distinct, unambiguous times, and both are correctly rejected (this business opens at 9 AM and closes at 5 PM — neither is bookable)", async () => {
    const { last: morning } = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 6am"]);
    expect(morning.actionsTaken).toEqual([]);
    expect(morning.reply).toMatch(/6:00 AM/);
    expect(morning.reply).toMatch(/outside our hours/i);

    const { last: evening } = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 6pm"]);
    expect(evening.actionsTaken).toEqual([]);
    expect(evening.reply).toMatch(/6:00 PM/);
    expect(evening.reply).toMatch(/outside our hours/i);

    // Different explanations prove 6am and 6pm were parsed as genuinely
    // different times, not conflated into the same rejection.
    expect(morning.reply).not.toBe(evening.reply);
  });

  it("a bare ambiguous '6' is never accepted as a time", async () => {
    const { last: result } = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 6"]);
    expect(result.bookingState.time).toBeUndefined();
    expect(result.reply).toMatch(/am\/pm/i);
  });
});

describe("Business hours — valid appointment inside hours", () => {
  it("books successfully for a normal mid-day slot", async () => {
    const { last: result } = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Tuesday 2pm",
      "Trevor 12428012847",
      "yes",
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
    const { last: result } = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Tuesday 9am",
      "Trevor 12428012847",
      "yes",
    ]);
    expect(result.actionsTaken[0].action.type).toBe("request_appointment");
    expect(result.actionsTaken[0].result.success).toBe(true);
  });

  it("rejects exactly closing time (17:00) as a start for a 45-minute service — IMMEDIATELY, before name/phone are ever asked", async () => {
    const { turns } = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 5pm"]);
    const afterTime = turns[turns.length - 1];

    // The rejection happens on the SAME turn the invalid time was given —
    // no name/phone question is asked first.
    expect(afterTime.actionsTaken).toEqual([]);
    expect(afterTime.reply).toMatch(/outside our hours/i);
    expect(afterTime.reply).not.toMatch(/name|phone/i);
    expect(afterTime.bookingState.service).toBe("Basic filling");
    expect(afterTime.bookingState.date).toBeUndefined();
    expect(afterTime.bookingState.time).toBeUndefined();
  });
});

describe("Business hours — rejected BEFORE name/phone are ever asked (natural message order)", () => {
  it("REQUIREMENT: an after-hours time is rejected before name collection — the very next reply asks for a new time, not a name", async () => {
    const { turns } = await runConversation([...BOOK_FILLING_UP_TO_TIME, "Tuesday 6pm"]);
    const afterInvalidTime = turns[turns.length - 1];

    expect(afterInvalidTime.reply).toMatch(/outside our hours/i);
    expect(afterInvalidTime.reply).not.toMatch(/could i get your name/i);
    expect(afterInvalidTime.actionsTaken).toEqual([]);
    // service survives; name/phone were never reached, so still unset.
    expect(afterInvalidTime.bookingState.service).toBe("Basic filling");
    expect(afterInvalidTime.bookingState.name).toBeUndefined();
    expect(afterInvalidTime.bookingState.phone).toBeUndefined();
  });

  it("REQUIREMENT: an after-hours time is rejected before phone collection — even when name was already volunteered out of order, the rejection still asks for a new time, not a phone number", async () => {
    const { turns } = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "my name is Trevor",
      "Tuesday 6pm",
    ]);
    const afterInvalidTime = turns[turns.length - 1];

    expect(afterInvalidTime.reply).toMatch(/outside our hours/i);
    expect(afterInvalidTime.reply).not.toMatch(/phone number/i);
    expect(afterInvalidTime.actionsTaken).toEqual([]);
    // name survives (given before the invalid time); phone was never
    // reached.
    expect(afterInvalidTime.bookingState.name).toBe("Trevor");
    expect(afterInvalidTime.bookingState.phone).toBeUndefined();
    expect(afterInvalidTime.bookingState.date).toBeUndefined();
  });

  it("after a natural-order rejection, the flow continues normally and asks for name/phone once a valid time is given", async () => {
    const { last: result } = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Tuesday 6pm", // rejected — after hours, no name/phone asked yet
      "Tuesday 3pm", // corrected — within hours
    ]);

    expect(result.reply).toMatch(/name and phone/i);
    expect(result.bookingState.date).toBe("Tuesday");
    expect(result.bookingState.time).toBe("15:00");
  });
});

describe("Business hours — out-of-hours and closed-day rejection (preservation, name/phone given first)", () => {
  it('"Tuesday 6 PM" is rejected: no request_appointment, service/name/phone preserved', async () => {
    const requestAppointment = vi.fn(async () => ({ success: true }));
    const tools: ReceptionistTools = {
      createLead: vi.fn(async () => ({ success: true })),
      requestAppointment,
      requestReschedule: vi.fn(async () => ({ success: true })),
      requestCancellation: vi.fn(async () => ({ success: true })),
      requestRecurringAppointment: vi.fn(async () => ({ success: true })),
      escalate: vi.fn(async () => ({ success: true })),
    };

    const { last: result } = await runConversation(
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
      requestRecurringAppointment: vi.fn(async () => ({ success: true })),
      escalate: vi.fn(async () => ({ success: true })),
    };

    const { last: result } = await runConversation(
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

  it('"Saturday at 10am" (the other closed day) is rejected the same way — Saturday and Sunday are the ONLY closed days in the actual configured schedule; there is no closed WEEKDAY to test without inventing a fake one', async () => {
    const { last: result } = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Saturday at 10am",
    ]);

    expect(result.actionsTaken).toEqual([]);
    expect(result.reply).toMatch(/closed on saturdays/i);
    expect(result.bookingState.service).toBe("Basic filling");
    expect(result.bookingState.date).toBeUndefined();
  });
});

describe("Business hours — valid request immediately after correcting an invalid time", () => {
  it("succeeds on the next turn once a valid time is given, without repeating earlier fields", async () => {
    const { last: result } = await runConversation([
      ...BOOK_FILLING_UP_TO_TIME,
      "Trevor 12428012847",
      "Tuesday 6pm", // rejected — after hours
      "Tuesday 2pm", // corrected — within hours
      "yes",
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

describe("Business hours — tool-level backstop (provider AND tool independently reject)", () => {
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

  it("the tool ALSO independently rejects a same-day, after-closing payload — not just a closed day — even if a provider somehow proposed it", async () => {
    const tools = createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE);

    // A hypothetical buggy/malicious provider proposing 17:00 for a
    // 90-minute root canal (ends 18:30, well past the 17:00 close) — the
    // tool must reject this on its own, independent of provider logic.
    const result = await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Root canal",
      preferredDate: "Tuesday",
      preferredTime: "17:00",
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
