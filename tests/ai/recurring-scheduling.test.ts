import { describe, expect, it } from "vitest";
import { pinClockToReferenceCalendar } from "../helpers/pin-clock";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { createClinicSimulator, type ClinicSimulator } from "../../src/simulator/clinic-simulator";
import { createClinicSimulatorReceptionistTools } from "../../src/tools/clinic-simulator-receptionist-tools";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { detectRecurrenceIntervalMonths, generateOccurrenceDates } from "../../src/ai/recurrence";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProvider, AIProviderRequest, ConversationTurn } from "../../src/ai/types";

// These tests' expectations are tied to the reference calendar (see tests/helpers/pin-clock.ts).
pinClockToReferenceCalendar();

/**
 * Sections 5-9: recurring appointment scheduling. Fixtures below are
 * VERIFIED against the real reference calendar (test-data/clinic-calendar/),
 * not assumed — a clean 3-occurrence sequence, and one with a known
 * conflict specifically on the SECOND occurrence (available, unavailable,
 * available — the mission's own example shape), found by direct
 * inspection rather than guessed.
 */

const CLEAN_START = "2026-09-01";
const CLEAN_TIME = "09:00"; // start/+3mo/+6mo all genuinely free
const SECOND_OCCURRENCE_CONFLICT_START = "2026-09-03";
const SECOND_OCCURRENCE_CONFLICT_TIME = "13:30"; // occurrence 2 (Dec 3) conflicts; 1 and 3 don't

class FakeLlmChatClient implements LlmChatClient {
  public calls: Parameters<LlmChatClient["chat"]>[0][] = [];
  constructor(private readonly result: LlmChatResult | (() => LlmChatResult)) {}
  async chat(params: Parameters<LlmChatClient["chat"]>[0]): Promise<LlmChatResult> {
    this.calls.push(params);
    return typeof this.result === "function" ? this.result() : this.result;
  }
}

function request(message: string, overrides: Partial<AIProviderRequest> = {}): AIProviderRequest {
  return {
    business: BAHAMAS_DENTAL_SERVICE,
    customer: {},
    history: [],
    message,
    bookingState: {},
    ...overrides,
  };
}

function checkAvailabilityFor(simulator: ClinicSimulator): AIProviderRequest["checkAvailability"] {
  return (date, time, duration) => simulator.checkBookable(date, time, duration);
}

/** A trivial "everything's fine" stub — used only to keep the Section 9
 * early-escalation bypass from intercepting tests that are specifically
 * about OTHER recurring behavior (intent recognition, corrections, the
 * bare-month prompt), not escalation itself. Real occurrence-checking
 * tests use checkAvailabilityFor(a real ClinicSimulator) instead. */
const ALWAYS_AVAILABLE: AIProviderRequest["checkAvailability"] = () => ({ ok: true });

async function runConversation(provider: AIProvider, messages: string[], checkAvailability?: AIProviderRequest["checkAvailability"]) {
  const conversationManager = new ConversationManager();
  const history: ConversationTurn[] = [];
  const results: Awaited<ReturnType<AIProvider["generateResponse"]>>[] = [];
  for (const message of messages) {
    const req = conversationManager.buildRequest({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history,
      message,
      checkAvailability,
    });
    const result = await provider.generateResponse(req);
    results.push(result);
    history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
    conversationManager.setBookingState(result.bookingState);
  }
  return results;
}

describe("recurrence.ts — interval detection and occurrence generation", () => {
  it.each([
    ["every 6 months", 6],
    ["every 3 months", 3],
    ["every 12 months", 12],
    ["every three months", 3],
    ["every six months", 6],
    ["every year", 12],
  ])("recognizes %s as %d months", (phrase, months) => {
    expect(detectRecurrenceIntervalMonths(phrase)).toBe(months);
  });

  it("does not recognize an unlisted interval (e.g. 'every month')", () => {
    expect(detectRecurrenceIntervalMonths("every month")).toBeUndefined();
  });

  it("generates occurrences matching the mission's own example", () => {
    expect(generateOccurrenceDates("2026-09-10", 6, 3)).toEqual([
      "2026-09-10",
      "2027-03-10",
      "2027-09-10",
    ]);
  });
});

describe("Recurring scheduling — DevRuleBasedAIProvider, clinic simulator active", () => {
  it("recognizes recurring intent explicitly, distinct from a plain booking", async () => {
    const results = await runConversation(
      new DevRuleBasedAIProvider(),
      ["I need a cleaning every 3 months"],
      ALWAYS_AVAILABLE,
    );
    expect(results[0].bookingState.intent).toBe("book_recurring_appointment");
    expect(results[0].bookingState.recurrenceIntervalMonths).toBe(3);
  });

  it("happy path: confirmation shows service/first date/time/interval/occurrences, and YES creates the full series (through the real ReceptionistAgent + tools, not just the provider)", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const checkAvailability = checkAvailabilityFor(simulator);
    const tools = createClinicSimulatorReceptionistTools(simulator);
    const agent = new ReceptionistAgent(new DevRuleBasedAIProvider(), tools);
    const cm = new ConversationManager();
    const history: ConversationTurn[] = [];
    const agentResults = [];
    for (const message of ["I need a cleaning every 3 months", "Sept 1 at 9am", "trevor 2428012847", "yes"]) {
      const req = cm.buildRequest({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history, message, checkAvailability });
      const result = await agent.handleMessage(req);
      agentResults.push(result);
      history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
      cm.setBookingState(result.bookingState);
    }

    const confirmation = agentResults[agentResults.length - 2];
    expect(confirmation.reply).toMatch(/routine cleaning/i);
    expect(confirmation.reply).toMatch(/september 1/i);
    expect(confirmation.reply).toMatch(/9:00 am/i);
    expect(confirmation.reply).toMatch(/every 3 months/i);
    expect(confirmation.reply).toMatch(/december 1, 2026/i);
    expect(confirmation.reply).toMatch(/march 1, 2027/i);
    expect(confirmation.reply).toMatch(/reply yes to confirm/i);
    expect(confirmation.actionsTaken).toEqual([]); // not yet confirmed

    const confirmed = agentResults[agentResults.length - 1];
    expect(confirmed.actionsTaken).toEqual([
      {
        action: {
          type: "request_recurring_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            startDate: CLEAN_START,
            startTime: CLEAN_TIME,
            recurrenceIntervalMonths: 3,
            occurrenceDates: [CLEAN_START, "2026-12-01", "2027-03-01"],
          },
        },
        result: { success: true, persisted: true },
      },
    ]);
    // Real bookings actually exist in the simulator now.
    expect(simulator.state.listActiveBookings()).toHaveLength(3);
  });

  it("REGRESSION (Section 6, mission's own example shape): a conflict on the SECOND occurrence is surfaced, not silently skipped — nothing is booked until resolved", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const checkAvailability = checkAvailabilityFor(simulator);
    const results = await runConversation(
      new DevRuleBasedAIProvider(),
      ["I need a cleaning every 3 months", "Sept 3 at 1:30pm", "trevor 2428012847"],
      checkAvailability,
    );
    const conflictTurn = results[results.length - 1];
    expect(conflictTurn.reply).toMatch(/december 3, 2026/i);
    expect(conflictTurn.reply).not.toMatch(/reply yes to confirm/i);
    expect(conflictTurn.actions).toEqual([]);
    expect(simulator.state.listActiveBookings()).toEqual([]); // nothing booked
  });

  it("Section 9: without a clinic simulator (no checkAvailability), recurring intent is recognized but honestly escalated — never faked", async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), [
      "I need a cleaning every 3 months",
    ]);
    const only = results[0];
    expect(only.reply).toMatch(/every 3 months/i);
    expect(only.reply).toMatch(/front desk|team/i);
    expect(only.actions).toEqual([{ type: "escalate", payload: expect.objectContaining({ reason: expect.any(String) }) }]);
    // Never claims a recurring booking exists.
    expect(only.reply).not.toMatch(/i've (booked|scheduled|set up)/i);
  });

  it("Section 7: recurring corrections — interval, then start date, then time, each independently correctable", async () => {
    const results = await runConversation(
      new DevRuleBasedAIProvider(),
      [
        "I want a cleaning every 6 months",
        "actually every 3 months",
        "actually start in October",
        "October 5",
        "make it 3 PM",
      ],
      ALWAYS_AVAILABLE,
    );
    const final = results[results.length - 1];
    expect(final.bookingState).toMatchObject({
      intent: "book_recurring_appointment",
      service: "Routine cleaning",
      recurrenceIntervalMonths: 3,
      date: "2026-10-05",
      time: "15:00",
    });
  });

  it('Section 13: a bare month with no day ("start in October") is acknowledged, not silently ignored', async () => {
    const results = await runConversation(
      new DevRuleBasedAIProvider(),
      ["I want a cleaning every 3 months", "start in October"],
      ALWAYS_AVAILABLE,
    );
    expect(results[1].reply).toMatch(/october/i);
    expect(results[1].reply).toMatch(/which day/i);
    expect(results[1].bookingState.date).toBeUndefined();
  });
});

describe("Recurring scheduling — LLMProvider, clinic simulator active", () => {
  it("recognizes recurring intent deterministically, independent of the model", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);
    const result = await provider.generateResponse(
      request("Book me every six months", { checkAvailability: ALWAYS_AVAILABLE }),
    );
    expect(result.bookingState.intent).toBe("book_recurring_appointment");
    expect(result.bookingState.recurrenceIntervalMonths).toBe(6);
  });

  it("Section 9: without checkAvailability, recognizes recurring intent and escalates honestly WITHOUT ever calling the model", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);
    const result = await provider.generateResponse(
      request("I need a cleaning every 3 months", {
        bookingState: { intent: "book_recurring_appointment", recurrenceIntervalMonths: 3, service: "Routine cleaning" },
      }),
    );
    expect(client.calls).toHaveLength(0);
    expect(result.actions).toEqual([
      { type: "escalate", payload: expect.objectContaining({ reason: expect.any(String) }) },
    ]);
    expect(result.reply).toMatch(/front desk|team/i);
  });

  it("happy path: the deterministic auto-confirm bypass books the full series on an unambiguous YES, never trusting the model's own tool call", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const checkAvailability = checkAvailabilityFor(simulator);
    const client = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const provider = new LLMProvider(client);

    const readyState = {
      intent: "book_recurring_appointment" as const,
      service: "Routine cleaning",
      date: CLEAN_START,
      time: CLEAN_TIME,
      recurrenceIntervalMonths: 3,
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service" as const,
    };
    const result = await provider.generateResponse(
      request("yes", { bookingState: readyState, checkAvailability }),
    );

    expect(client.calls).toHaveLength(0); // never asked the model to decide
    expect(result.actions).toEqual([
      {
        type: "request_recurring_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          startDate: CLEAN_START,
          startTime: CLEAN_TIME,
          recurrenceIntervalMonths: 3,
          occurrenceDates: [CLEAN_START, "2026-12-01", "2027-03-01"],
        },
      },
    ]);
  });

  it("REGRESSION (Section 6): a conflict on occurrence 2 blocks the auto-confirm bypass entirely — falls through rather than booking a partial series", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const checkAvailability = checkAvailabilityFor(simulator);
    const client = new FakeLlmChatClient({
      content: "Let me know if you'd like to adjust anything about the series.",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);

    const readyState = {
      intent: "book_recurring_appointment" as const,
      service: "Routine cleaning",
      date: SECOND_OCCURRENCE_CONFLICT_START,
      time: SECOND_OCCURRENCE_CONFLICT_TIME,
      recurrenceIntervalMonths: 3,
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service" as const,
    };
    const result = await provider.generateResponse(
      request("yes", { bookingState: readyState, checkAvailability }),
    );

    // Falls through to a real model call (no deterministic auto-confirm),
    // and the model didn't propose a completing action either — nothing
    // was booked.
    expect(client.calls).toHaveLength(1);
    expect(result.actions).toEqual([]);
  });

  it("stale-state protection extends to recurring: a stale model-proposed recurring payload is rejected by the hard gate", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "1",
          name: "request_recurring_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Root canal", // STALE — not what's actually pending
            startDate: CLEAN_START,
            startTime: CLEAN_TIME,
            recurrenceIntervalMonths: 3,
            occurrenceDates: [CLEAN_START, "2026-12-01", "2027-03-01"],
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);
    const currentState = {
      intent: "book_recurring_appointment" as const,
      service: "Routine cleaning",
      date: CLEAN_START,
      time: CLEAN_TIME,
      recurrenceIntervalMonths: 3,
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service" as const,
    };
    const result = await provider.generateResponse(
      request("book it for me", { bookingState: currentState, checkAvailability: ALWAYS_AVAILABLE }), // doesn't match AFFIRMATIVE_RE, forces a real model call
    );
    expect(client.calls).toHaveLength(1); // the model WAS consulted
    expect(result.actions).toEqual([]); // the stale payload never reached ReceptionistTools
  });
});
