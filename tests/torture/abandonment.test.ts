import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";
import type { BookingState } from "../../src/ai/types";

/**
 * CATEGORY F — Abandonment / new-booking exit (5 scenarios: 26–30)
 *
 * FIXED (ROOT CAUSE #6): DevRuleBasedAIProvider now has an explicit
 * "abandon" intent (ABANDON_RE in dev-rule-based-provider.ts), checked
 * before the flow-turn routing and before the name-extraction paths that
 * used to swallow these phrases (ROOT CAUSE #2) — so an abandonment
 * phrase both exits the flow cleanly AND is never at risk of being
 * captured as the customer's name.
 */
describe("CATEGORY F — abandonment / new booking exit", () => {
  const IN_FLOW: BookingState = { intent: "book_appointment", service: "Routine cleaning" };

  it('26. FIXED: "never mind" exits the flow cleanly, is never captured as a name, and is never confused with cancelling an EXISTING appointment', async () => {
    const convo = devConversation({}, IN_FLOW);
    const result = await convo.say("never mind");

    expect(result.bookingState).toEqual({});
    expect(result.bookingState.name).not.toBe("Never Mind");
    expect(result.actionsTaken.some((a) => a.action.type === "request_cancellation")).toBe(false);
  });

  it('27. FIXED: "I\'m done" exits the flow cleanly — "done" is never captured as a name', async () => {
    const convo = devConversation({}, IN_FLOW);
    const result = await convo.say("I'm done");

    expect(result.bookingState).toEqual({});
    expect(result.bookingState.name).not.toBe("Done");
  });

  it('28. FIXED: "I\'m out" exits the flow cleanly — "out" is never captured as a name', async () => {
    const convo = devConversation({}, IN_FLOW);
    const result = await convo.say("I'm out");

    expect(result.bookingState).toEqual({});
    expect(result.bookingState.name).not.toBe("Out");
  });

  it('29. FIXED: "forget it" exits the flow cleanly — the phrase is never captured as a name', async () => {
    const convo = devConversation({}, IN_FLOW);
    const result = await convo.say("forget it");

    expect(result.bookingState).toEqual({});
    expect(result.bookingState.name).not.toBe("Forget It");
  });

  it('30. FIXED: "I don\'t want to book anymore" now exits the flow instead of being silently ignored', async () => {
    const convo = devConversation({}, IN_FLOW);
    const result = await convo.say("I don't want to book anymore");

    expect(result.bookingState).toEqual({});
  });
});
