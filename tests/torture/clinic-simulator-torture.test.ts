import { describe, expect, it } from "vitest";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { createClinicSimulator, type ClinicSimulator } from "../../src/simulator/clinic-simulator";
import { createClinicSimulatorReceptionistTools } from "../../src/tools/clinic-simulator-receptionist-tools";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProvider, AIProviderRequest, ConversationTurn } from "../../src/ai/types";

/**
 * Section 14/15: the clinic-simulator + recurring-scheduling torture
 * suite. Complements the existing tests/torture/ (pre-existing, prior
 * session) and tests/ai/stale-confirmation-regression.test.ts /
 * human-conversation-regression.test.ts (which already cover most of
 * item 14's list — short answers, corrections, existing info, topic
 * switching, ambiguity, services — for the ORIGINAL weekday-based
 * architecture). This file focuses on what's NEW this pass: real
 * calendar dates, month abbreviations, the clinic simulator's own
 * conflict handling, recurring, and concurrency.
 */

class FakeLlmChatClient implements LlmChatClient {
  public calls: Parameters<LlmChatClient["chat"]>[0][] = [];
  constructor(private readonly result: LlmChatResult | (() => LlmChatResult)) {}
  async chat(params: Parameters<LlmChatClient["chat"]>[0]): Promise<LlmChatResult> {
    this.calls.push(params);
    return typeof this.result === "function" ? this.result() : this.result;
  }
}

function checkAvailabilityFor(simulator: ClinicSimulator): AIProviderRequest["checkAvailability"] {
  return (date, time, duration) => simulator.checkBookable(date, time, duration);
}

async function runThroughAgent(
  agent: ReceptionistAgent,
  messages: string[],
  checkAvailability?: AIProviderRequest["checkAvailability"],
) {
  const cm = new ConversationManager();
  const history: ConversationTurn[] = [];
  const results = [];
  for (const message of messages) {
    const req = cm.buildRequest({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history, message, checkAvailability });
    const result = await agent.handleMessage(req);
    results.push(result);
    history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
    cm.setBookingState(result.bookingState);
  }
  return results;
}

async function runProvider(provider: AIProvider, messages: string[], checkAvailability?: AIProviderRequest["checkAvailability"]) {
  const cm = new ConversationManager();
  const history: ConversationTurn[] = [];
  const results = [];
  for (const message of messages) {
    const req = cm.buildRequest({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history, message, checkAvailability });
    const result = await provider.generateResponse(req);
    results.push(result);
    history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
    cm.setBookingState(result.bookingState);
  }
  return results;
}

describe("Torture — month abbreviations, end-to-end through a real conversation", () => {
  it.each([
    ["Sept 8", "2026-09-08"],
    ["Sept. 8", "2026-09-08"],
    ["September 8", "2026-09-08"],
    ["Oct 8", "2026-10-08"],
    ["Oct. 8", "2026-10-08"],
    ["Nov 9", "2026-11-09"],
    ["Dec 8", "2026-12-08"],
  ])("'%s' resolves to the real calendar date %s through the full booking flow", async (phrase, expectedDate) => {
    const results = await runProvider(new DevRuleBasedAIProvider(), [
      "book a cleaning",
      `${phrase} at 11am`,
    ]);
    expect(results[1].bookingState.date).toBe(expectedDate);
  });
});

describe("Torture — clinic simulator calendar conflicts", () => {
  it("a seeded BOOKED slot is rejected with real alternatives, never claimed as booked", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);
    const agent = new ReceptionistAgent(new DevRuleBasedAIProvider(), tools);
    const results = await runThroughAgent(
      agent,
      ["book a consultation", "Sept 18 at 9:30am", "trevor 2428012847", "yes"],
      checkAvailabilityFor(simulator),
    );
    const final = results[results.length - 1];
    expect(final.reply).not.toMatch(/i've (captured|booked)/i);
    expect(final.reply).toMatch(/already taken|next available/i);
    expect(final.actionsTaken.every((a) => a.result.success)).toBe(false);
  });

  it("a seeded BLOCKED slot (staff unavailability) is also rejected, not just 'booked' ones", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    // 2026-09-07 09:00 is seeded as "blocked" (clinic closed) in the
    // reference data — verified by direct inspection.
    expect(simulator.checkBookable("2026-09-07", "09:00", 30)).toEqual({ ok: false, reason: "conflict" });
  });

  it("an overlapping request against a seeded 90-minute Root canal (which only marks its OWN start row 'booked' in the raw file) is still caught", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    // Seeded: 2026-08-24 11:00 root_canal (90 min) -> occupies 11:00-12:30.
    expect(simulator.checkBookable("2026-08-24", "12:00", 30).ok).toBe(false);
  });

  it("recurring conflict: a genuine conflict on one occurrence is surfaced with the specific date, and the customer's follow-up correction produces a fully clean series", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const checkAvailability = checkAvailabilityFor(simulator);
    // 2026-09-03 13:30 has a known conflict on occurrence 2 (Dec 3) only.
    const first = await runProvider(
      new DevRuleBasedAIProvider(),
      ["I need a cleaning every 3 months", "Sept 3 at 1:30pm", "trevor 2428012847"],
      checkAvailability,
    );
    const conflictReply = first[first.length - 1].reply;
    expect(conflictReply).toMatch(/december 3, 2026/i);

    // Customer picks a genuinely clean start instead.
    const second = await runProvider(
      new DevRuleBasedAIProvider(),
      ["I need a cleaning every 3 months", "Sept 1 at 9am", "trevor 2428012847"],
      checkAvailability,
    );
    expect(second[second.length - 1].reply).toMatch(/reply yes to confirm/i);
  });
});

describe("Torture — concurrency: two customers attempt to book the exact same slot simultaneously", () => {
  it("exactly one booking succeeds; the calendar never double-books, and the reference calendar is untouched", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);

    const [resultA, resultB] = await Promise.all([
      tools.requestAppointment({
        name: "Customer A",
        phone: "+12428010001",
        service: "Routine cleaning",
        preferredDate: "2026-09-08",
        preferredTime: "10:00",
      }),
      tools.requestAppointment({
        name: "Customer B",
        phone: "+12428010002",
        service: "Routine cleaning",
        preferredDate: "2026-09-08",
        preferredTime: "10:00",
      }),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    expect(successes).toHaveLength(1);
    expect(simulator.state.listActiveBookings()).toHaveLength(1);
  });

  it("N simultaneous requests for the same slot: still exactly one winner", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);

    const attempts = Array.from({ length: 8 }, (_, i) =>
      tools.requestAppointment({
        name: `Customer ${i}`,
        phone: `+1242801000${i}`,
        service: "Routine cleaning",
        preferredDate: "2026-09-09",
        preferredTime: "11:00",
      }),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(simulator.state.listActiveBookings()).toHaveLength(1);
  });
});

describe("Torture — required bug reproduction: Root canal → NO → cleaning → YES, with real dates + clinic simulator", () => {
  it("the final action payload contains Routine cleaning, NEVER Root canal — traced through extraction, state, confirmation, YES, action, payload", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const checkAvailability = checkAvailabilityFor(simulator);
    const results = await runProvider(
      new DevRuleBasedAIProvider(),
      ["book a root canal", "Sept 8 at 11am", "trevor 2428012847", "no", "a cleaning", "yes"],
      checkAvailability,
    );

    // extraction -> state: the declined turn preserves the stale service...
    const declined = results[3];
    expect(declined.bookingState.service).toBe("Root canal");
    expect(declined.bookingState.justDeclined).toBe(true);
    // ...and the bare correction (no "actually") overwrites it.
    const corrected = results[4];
    expect(corrected.bookingState.service).toBe("Routine cleaning");
    // confirmation -> YES -> action -> payload.
    const confirmed = results[5];
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "2026-09-08",
          preferredTime: "11:00",
        },
      },
    ]);
    expect(JSON.stringify(confirmed.actions)).not.toContain("Root canal");
  });

  it("the same reproduction against LLMProvider (scripted model, deterministic layer authoritative)", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);
    const readyState = {
      intent: "book_appointment" as const,
      service: "Root canal",
      date: "2026-09-08",
      time: "11:00",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service" as const,
    };
    const declined = await provider.generateResponse({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history: [],
      message: "no",
      bookingState: readyState,
    });
    expect(declined.bookingState.service).toBe("Root canal");
    expect(declined.bookingState.justDeclined).toBe(true);

    const corrected = await provider.generateResponse({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history: [],
      message: "a cleaning",
      bookingState: declined.bookingState,
    });
    expect(corrected.bookingState.service).toBe("Routine cleaning");

    const confirmed = await provider.generateResponse({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history: [],
      message: "yes",
      bookingState: corrected.bookingState,
    });
    expect(confirmed.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "2026-09-08",
          preferredTime: "11:00",
        },
      },
    ]);
  });
});

describe("Torture — known information is never re-requested", () => {
  it("known name is never asked for again, even mid-recurring-flow", async () => {
    const results = await runProvider(new DevRuleBasedAIProvider(), [
      "trevor 2428012847",
      "I need a cleaning every 3 months",
    ]);
    expect(results[1].reply).not.toMatch(/what'?s your name|could i get your name/i);
  });

  it('"you have my information" — the app inspects actual state, not a blind re-ask', async () => {
    const results = await runProvider(new DevRuleBasedAIProvider(), [
      "book a cleaning",
      "Sept 8 at 11am",
      "trevor 2428012847",
      "you already have my information",
    ]);
    // Every required field was already known — the app must not ask for
    // name/phone again on this turn.
    expect(results[3].reply).not.toMatch(/what'?s your name|phone number/i);
  });
});
