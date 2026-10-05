import { describe, expect, it } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProvider, AIProviderRequest, ConversationTurn } from "../../src/ai/types";
import type {
  LanguageObservationRecorder,
  LanguageObservationRecorderInput,
} from "../../src/ai/language-observation-recorder";

/**
 * Phase 1 Context & Human Conversation Pass — item 7: messy, multi-turn
 * conversations, not just isolated messages. Complements
 * tests/ai/stale-confirmation-regression.test.ts (which already covers
 * the correction-after-decline family in depth) and
 * tests/torture/ (pre-existing out-of-order/robustness coverage) rather
 * than duplicating them — this file's focus is specifically the NEW
 * ground covered this pass: fragmented answers, interruptions with
 * return, repeated information, ambiguous short answers, and the
 * unknown-phrase learning foundation actually recording something.
 */

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

/** Drives a full multi-turn conversation through any AIProvider the same
 * way a real caller (dev-chat.ts, a future webhook) would: booking state
 * and history both carried forward turn over turn via ConversationManager. */
async function runConversation(provider: AIProvider, messages: string[]) {
  const conversationManager = new ConversationManager();
  const history: ConversationTurn[] = [];
  const results: Awaited<ReturnType<AIProvider["generateResponse"]>>[] = [];

  for (const message of messages) {
    const req = conversationManager.buildRequest({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history,
      message,
    });
    const result = await provider.generateResponse(req);
    results.push(result);
    history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
    conversationManager.setBookingState(result.bookingState);
  }
  return results;
}

describe("Human-like conversations — DevRuleBasedAIProvider", () => {
  it("fragmented answers: service, date, bare hour, meridiem, name, phone all arrive as SEPARATE short messages", async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), [
      "book a cleaning",
      "tuesday",
      "3", // bare hour, no am/pm yet
      "pm", // completes it
      "trevor",
      "2428012847",
      "yes",
    ]);
    const final = results[results.length - 1];
    expect(final.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "15:00",
        },
      },
    ]);
  });

  it("interruption + return: an FAQ mid-booking is answered, then the SAME booking resumes with nothing lost", async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), [
      "book a cleaning",
      "tuesday 2pm",
      "what are your hours?",
      "trevor 2428012847",
      "yes",
    ]);
    const faqTurn = results[2];
    expect(faqTurn.reply).toMatch(/9:00.*5:00|open/i);
    // The booking wasn't lost — service/date/time all survived the interruption.
    expect(faqTurn.bookingState.service).toBe("Routine cleaning");
    expect(faqTurn.bookingState.date).toBe("Tuesday");
    expect(faqTurn.bookingState.time).toBe("14:00");

    const final = results[results.length - 1];
    expect(final.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("topic switching: a price question BEFORE any booking intent is answered, then a fresh booking starts cleanly", async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), [
      "how much is a filling?",
      "ok book me a filling",
      "wednesday 11am",
      "trevor 2428012847",
      "yes",
    ]);
    expect(results[0].reply).toMatch(/\$?175|B\$175/);
    const final = results[results.length - 1];
    expect(final.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Basic filling",
          preferredDate: "Wednesday",
          preferredTime: "11:00",
        },
      },
    ]);
  });

  it("REGRESSION (found live): a question naming two services is never silently resolved to whichever comes first — a later, unambiguous choice is what actually sticks", async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), [
      "should I get a cleaning or a filling?",
      "let's go with the filling",
      "wednesday 11am",
      "trevor 2428012847",
      "yes",
    ]);
    // The FAQ-style question itself never locked in a service — nothing
    // to lose here, so the following genuine choice is free to land.
    expect(results[0].bookingState.service).toBeUndefined();
    const final = results[results.length - 1];
    expect(final.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Basic filling",
          preferredDate: "Wednesday",
          preferredTime: "11:00",
        },
      },
    ]);
  });

  it("repeated information: restating the same date/time twice never duplicates or breaks the flow", async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), [
      "book a cleaning",
      "tuesday 2pm",
      "tuesday 2pm", // customer repeats themselves
      "trevor 2428012847",
      "yes",
    ]);
    const final = results[results.length - 1];
    expect(final.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it("customer changing their mind mid-flow (before any confirmation): an explicit correction switches the service entirely", async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), [
      "book a filling",
      "actually, a cleaning instead",
      "tuesday 2pm",
      "trevor 2428012847",
      "yes",
    ]);
    const final = results[results.length - 1];
    expect(final.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);
  });

  it('"same time" is preserved through a date-only correction after a decline (no explicit phrase-matching needed — an unset field simply is never overwritten)', async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), [
      "book a cleaning",
      "tuesday 2pm",
      "trevor 2428012847",
      "no",
      "actually make it wednesday, same time",
      "yes",
    ]);
    const final = results[results.length - 1];
    expect(final.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Routine cleaning",
          preferredDate: "Wednesday",
          preferredTime: "14:00", // preserved — "same time" never needed parsing
        },
      },
    ]);
  });

  it('"yes" immediately after a correction confirms the LATEST state, never a stale one, at the EARLY confirm_service step too (not just the final hard gate)', async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), [
      "root canal", // -> early "would you like to book it?" (confirm_service) step
      "actually, a cleaning",
      "yes",
    ]);
    const afterCorrection = results[1];
    // The bug: this used to stay "Root canal" — the correction was
    // silently discarded because handleServiceConfirmation's fallback
    // branch (neither an explicit "yes" nor "no") never checked for
    // correction content at all, only re-asked the same stale question.
    expect(afterCorrection.bookingState.service).toBe("Routine cleaning");
    expect(afterCorrection.reply).toMatch(/what day/i); // now proceeding through the normal flow, asking for date/time next

    // The trailing "yes" (not a real yes/no question anymore — the
    // early confirm_service pendingAction was correctly cleared by the
    // correction) makes no further progress and asks again, but the
    // CORRECTED service is never lost or reverted.
    const afterYes = results[2];
    expect(afterYes.actions).toEqual([]);
    expect(afterYes.bookingState.service).toBe("Routine cleaning");
  });

  it("unknown, non-English-dialect-style phrasing never invents a booking, never crashes, and asks for clarification instead of guessing", async () => {
    const results = await runConversation(new DevRuleBasedAIProvider(), ["wah gwaan mi seh unnu tings dem cyaan reach so"]);
    const only = results[0];
    expect(only.actions).toEqual([]);
    expect(only.bookingState.intent).toBeUndefined();
    expect(only.reply.length).toBeGreaterThan(0);
  });
});

describe("Human-like conversations — unknown-phrase learning foundation actually records something", () => {
  it("a genuinely unrecognized message is recorded via the LanguageObservationRecorder, with phrase/reason/context/outcome, and NEVER changes the turn's own behavior", async () => {
    const recorded: LanguageObservationRecorderInput[] = [];
    const fakeRecorder: LanguageObservationRecorder = {
      async record(input) {
        recorded.push(input);
      },
    };
    const agent = new ReceptionistAgent(
      new DevRuleBasedAIProvider(),
      createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE),
      fakeRecorder,
    );

    const result = await agent.handleMessage(request("wah gwaan mi seh unnu tings dem cyaan reach so"));

    expect(recorded).toHaveLength(1);
    expect(recorded[0].phrase).toBe("wah gwaan mi seh unnu tings dem cyaan reach so");
    expect(recorded[0].reason.length).toBeGreaterThan(0);
    expect(recorded[0].context).toContain("intent=none");
    expect(recorded[0].outcome).toBe("asked_for_clarification");
    // Recording never authorized or changed anything about this turn.
    expect(result.actionsTaken).toEqual([]);
    expect(result.bookingState.intent).toBeUndefined();
  });

  it("a recording failure never breaks the conversation itself", async () => {
    const throwingRecorder: LanguageObservationRecorder = {
      async record() {
        throw new Error("simulated DB failure");
      },
    };
    const agent = new ReceptionistAgent(
      new DevRuleBasedAIProvider(),
      createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE),
      throwingRecorder,
    );

    const result = await agent.handleMessage(request("wah gwaan mi seh unnu tings dem cyaan reach so"));
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it("an ordinary, understood message never triggers a recording at all", async () => {
    const recorded: LanguageObservationRecorderInput[] = [];
    const fakeRecorder: LanguageObservationRecorder = {
      async record(input) {
        recorded.push(input);
      },
    };
    const agent = new ReceptionistAgent(
      new DevRuleBasedAIProvider(),
      createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE),
      fakeRecorder,
    );

    await agent.handleMessage(request("what are your hours?"));
    await agent.handleMessage(request("book a cleaning"));
    expect(recorded).toEqual([]);
  });
});

describe("Human-like conversations — LLMProvider (deterministic extraction layer, scripted model)", () => {
  it("fragmented bare-hour answer (\"3\" then \"pm\") is captured deterministically, same as DevRuleBasedAIProvider — the gap this pass closed", async () => {
    const client = new FakeLlmChatClient({ content: "Got it.", toolCalls: [] });
    const provider = new LLMProvider(client);

    const afterBareHour = await provider.generateResponse(
      request("3", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );
    expect(afterBareHour.bookingState.time).toBeUndefined();
    expect(afterBareHour.bookingState.pendingBareTime).toBeDefined();

    const afterMeridiem = await provider.generateResponse(
      request("pm", { bookingState: afterBareHour.bookingState }),
    );
    expect(afterMeridiem.bookingState.time).toBe("15:00");
    expect(afterMeridiem.bookingState.pendingBareTime).toBeUndefined();
    expect(afterMeridiem.bookingState.pendingAction).toBe("confirm_service");
  });

  it("stale model-payload protection still holds even for an ambiguous reference the model resolved itself (\"the other one\")", async () => {
    // Simulates the model correctly resolving a deictic reference from
    // its own conversation history (e.g. "we have 9am or 11am — the
    // other one" -> 11:00) and proposing the completing action directly.
    // Since no confirmation was pending yet, the hard gate must still
    // require a fresh, explicit confirmation before anything books —
    // proving the deictic-resolution convenience never bypasses
    // Objective 2's non-negotiable gate.
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [
        {
          id: "1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "11:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);
    const result = await provider.generateResponse(
      request("the other one", {
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );

    expect(result.actions).toEqual([]);
    expect(result.reply).toMatch(/reply yes to confirm/i);
  });

  it("the FIRST turn's confirmation is always the application's own composeConfirmationPrompt, never the model's own (possibly wrong) narration — found live", async () => {
    const client = new FakeLlmChatClient({
      content: "Let me confirm: routine cleaning on Tuesday at 2:00 PM. Sound right?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);
    const result = await provider.generateResponse(
      request("trevor, 2428012847", {
        bookingState: { intent: "book_appointment", service: "Basic filling", date: "Tuesday", time: "14:00" },
      }),
    );
    expect(result.reply).not.toMatch(/routine cleaning/i);
    expect(result.reply).toMatch(/basic filling/i);
  });

  it("item 5, pre-intent case: an unrecognized opening message IS flagged for review (the mission's primary example — a dialect phrase before any booking intent exists)", async () => {
    const client = new FakeLlmChatClient({
      content: "Could you tell me a bit more about what you're looking for?",
      toolCalls: [],
    });
    const provider = new LLMProvider(client);
    const result = await provider.generateResponse(request("wah gwaan mi seh unnu tings dem cyaan reach so"));
    expect(result.unclearPhraseObservation).toBeDefined();
    expect(result.unclearPhraseObservation?.phrase).toBe("wah gwaan mi seh unnu tings dem cyaan reach so");
  });

  it("item 5, pre-intent case: a plain greeting is NEVER flagged, even though the deterministic layer recognizes nothing about it either", async () => {
    const client = new FakeLlmChatClient({ content: "Hi there! How can I help?", toolCalls: [] });
    const provider = new LLMProvider(client);
    const result = await provider.generateResponse(request("hi"));
    expect(result.unclearPhraseObservation).toBeUndefined();
  });

  it("item 5, pre-intent case: an emergency is understood, not unclear — never flagged", async () => {
    const client = new FakeLlmChatClient({
      content: "I'm connecting you with our team right away for this.",
      toolCalls: [{ id: "1", name: "escalate", argumentsJson: JSON.stringify({ reason: "possible dental emergency" }) }],
    });
    const provider = new LLMProvider(client);
    const result = await provider.generateResponse(request("I have a bad toothache and my face is swollen"));
    expect(result.unclearPhraseObservation).toBeUndefined();
  });
});
