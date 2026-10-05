import { describe, expect, it } from "vitest";
import { devConversation, llmConversation } from "./helpers";

/**
 * CATEGORY E — Human escalation (5 scenarios: 21–25, plus a dedicated
 * "escalation has transition priority" check that spans both providers)
 *
 * FIXED (ROOT CAUSE #3): ESCALATE_RE in dev-rule-based-provider.ts now
 * covers the common ways people ask for a person, not just the original
 * single "talk to a human" phrasing.
 *
 * FIXED (ROOT CAUSE #9): ReceptionistAgent now enforces a persisted
 * handoff state (see receptionist-agent.ts / conversation-manager.ts) —
 * once any escalate action succeeds, bookingState is cleared and every
 * subsequent turn is short-circuited before the provider is even called,
 * regardless of which provider is in use.
 */
describe("CATEGORY E — human escalation", () => {
  it("21. explicit human request during greeting escalates", async () => {
    const convo = devConversation();
    await convo.say("hi");
    const result = await convo.say("I want to talk to someone");

    expect(result.escalated).toBe(true);
    expect(result.actionsTaken).toEqual([
      {
        action: {
          type: "escalate",
          payload: { reason: "customer explicitly asked for a person" },
        },
        result: { success: true },
      },
    ]);
  });

  it("22. explicit human request during service selection escalates", async () => {
    const convo = devConversation();
    await convo.say("I'd like to book an appointment");
    const result = await convo.say("I want to talk to someone");

    expect(result.escalated).toBe(true);
  });

  it("23. explicit human request during date/time collection escalates", async () => {
    const convo = devConversation();
    await convo.say("I want a cleaning");
    await convo.say("yes");
    const result = await convo.say("I want to talk to someone");

    expect(result.escalated).toBe(true);
  });

  it('24. FIXED: "get me a real person" during name/phone collection now escalates — and so do the task\'s other required example phrases ("human please", "send me to staff") tried standalone', async () => {
    const convo = devConversation();
    await convo.say("I want a cleaning");
    await convo.say("yes");
    await convo.say("Tuesday 2pm");
    const result = await convo.say("get me a real person");

    expect(result.escalated).toBe(true);

    // Two more of the task's own required example phrases, standalone.
    for (const phrase of ["human please", "send me to staff"]) {
      const other = devConversation();
      const otherResult = await other.say(phrase);
      expect(otherResult.escalated, `"${phrase}" should escalate`).toBe(true);
    }
  });

  it('25. FIXED: a frustrated customer ("this is annoying, get me a person") now escalates', async () => {
    const convo = devConversation();
    const result = await convo.say("this is annoying, get me a person");

    expect(result.escalated).toBe(true);
  });

  it("FIXED: escalation now stops the automated booking flow from continuing on the next message (DevRuleBasedAIProvider)", async () => {
    const convo = devConversation();
    await convo.say("I want a cleaning");
    await convo.say("yes");
    const escalateTurn = await convo.say("I want to talk to someone");
    expect(escalateTurn.escalated).toBe(true);

    // A real customer's very next messages must not continue answering
    // the booking flow as if the escalation never happened.
    const nextTurn = await convo.say("Tuesday 2pm");
    const finalTurn = await convo.say("Trevor 2428012847");

    expect(nextTurn.bookingState.intent).toBeUndefined();
    expect(finalTurn.actionsTaken.some((a) => a.action.type === "request_appointment")).toBe(false);
  });

  it("FIXED: the same handoff enforcement now applies identically to LLMProvider — ReceptionistAgent blocks automation regardless of what the model itself does with bookingState", async () => {
    // A well-behaved model calls escalate on "I want to talk to someone"
    // and, per the system prompt, does not fabricate a booking action —
    // this script represents ideal model behavior. The point of this test
    // is that the block is enforced by ReceptionistAgent, NOT by
    // LLMProvider's own COMPLETING_ACTION_TYPES bookkeeping (escalate was
    // never in that set, and still isn't) — so even a provider that does
    // nothing special for escalate still can't reopen automation.
    const { conversation, client } = llmConversation([
      {
        content: "Sure, Routine cleaning is B$125. What day and time works?",
        toolCalls: [
          {
            id: "call_1",
            name: "update_booking_progress",
            argumentsJson: JSON.stringify({
              intent: "book_appointment",
              service: "Routine cleaning",
            }),
          },
        ],
      },
      {
        content: "I've flagged this for our team — someone will follow up shortly.",
        toolCalls: [
          {
            id: "call_2",
            name: "escalate",
            argumentsJson: JSON.stringify({ reason: "customer asked for a person" }),
          },
        ],
      },
    ]);

    await conversation.say("I want a cleaning");
    const escalateTurn = await conversation.say("I want to talk to someone");

    expect(escalateTurn.escalated).toBe(true);
    expect(escalateTurn.handoffActive).toBe(true);
    // ReceptionistAgent clears bookingState on any successful escalation,
    // regardless of what LLMProvider's own state derivation would have
    // produced (which — unchanged, still — doesn't special-case escalate).
    expect(escalateTurn.bookingState).toEqual({});

    const callsBeforeNextTurn = client.calls.length;
    const nextTurn = await conversation.say("Tuesday 2pm");

    // The block is enforced BEFORE the provider is even called — proving
    // this isn't dependent on the model behaving itself.
    expect(client.calls.length).toBe(callsBeforeNextTurn);
    expect(nextTurn.actionsTaken).toEqual([]);
    expect(nextTurn.bookingState.intent).toBeUndefined();
  });
});
