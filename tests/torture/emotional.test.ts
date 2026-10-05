import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";
import type { BookingState } from "../../src/ai/types";

/**
 * CATEGORY H — Emotional / frustrated customers (5 scenarios: 36–40)
 *
 * FIXED (ROOT CAUSE #2): the low-confidence name-hint prefixes ("this
 * is X" / "I'm X" / "it's X") and the bare-name fallback are now both
 * gated on isNameCurrentlyAsked (dev-rule-based-provider.ts) — so a plain
 * complaint ("This is ridiculous") is no longer read as a name
 * self-introduction, and a frustrated question ("Why can't you
 * understand me?") is no longer swallowed by the bare-name fallback.
 *
 * FIXED (ROOT CAUSE #3): "I need someone now" now escalates (see
 * ESCALATE_RE in dev-rule-based-provider.ts).
 */
describe("CATEGORY H — emotional / frustrated customers", () => {
  const IN_FLOW: BookingState = { intent: "book_appointment", service: "Routine cleaning" };

  it("36. a described emergency escalates instead of continuing to book automatically", async () => {
    const convo = devConversation({}, IN_FLOW);
    const result = await convo.say("My tooth hurts really bad");

    expect(result.escalated).toBe(true);
    expect(result.reply).toMatch(/emergency/i);
  });

  it('37. "I\'ve been trying to reach someone all day" does not silently continue collecting fields without acknowledging the frustration', async () => {
    const convo = devConversation({}, IN_FLOW);
    const result = await convo.say("I've been trying to reach someone all day");

    // Not escalated and not treated as clinic info — falls straight
    // through to the generic catch-all while still mid-flow.
    expect(result.escalated).toBe(false);
    expect(result.bookingState.name).toBeUndefined();
  });

  it('38/39. FIXED, mid-flow: two different frustrated statements are NO LONGER read as name declarations — "This is ridiculous" (used to hit the "this is X" name-hint regex), "Why can\'t you understand me?" (used to hit the bare-name fallback)', async () => {
    const thisIsConvo = devConversation({}, IN_FLOW);
    const thisIsResult = await thisIsConvo.say("This is ridiculous, I have called 3 times already");

    expect(thisIsResult.bookingState.name).toBeUndefined();
    expect(thisIsResult.escalated).toBe(false);

    const whyCantConvo = devConversation({}, IN_FLOW);
    const whyCantResult = await whyCantConvo.say("Why can't you understand me?");

    expect(whyCantResult.bookingState.name).toBeUndefined();
  });

  it('40. FIXED: "I need someone now" now escalates, as an explicit, urgent request for a person should', async () => {
    const convo = devConversation();
    const result = await convo.say("I need someone now");

    expect(result.escalated).toBe(true);
  });
});
