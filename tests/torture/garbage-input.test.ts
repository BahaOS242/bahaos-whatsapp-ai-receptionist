import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";
import type { BookingState } from "../../src/ai/types";

/**
 * CATEGORY I — Garbage / irrelevant input (5 scenarios: 41–45)
 *
 * Each scenario checks the SAME input twice: once with no active flow,
 * and once mid-flow with a name still outstanding.
 *
 * FIXED (ROOT CAUSE #2): the bare-name fallback used to accept any
 * non-numeric short phrase as a name whenever name was missing ANYWHERE
 * in the flow. It's now gated on isNameCurrentlyAsked (name must
 * specifically be the next thing being asked — see
 * dev-rule-based-provider.ts), so none of these 4 garbage inputs are
 * captured as a name mid-flow any more. The random number was already
 * protected before this fix, since digits are excluded outright.
 */
describe("CATEGORY I — garbage / irrelevant input", () => {
  const IN_FLOW: BookingState = { intent: "book_appointment", service: "Routine cleaning" };

  it('41. FIXED: "lol" invents nothing standalone, and is no longer captured as the customer\'s name mid-flow', async () => {
    const standalone = await devConversation().say("lol");
    expect(standalone.bookingState.intent).toBeUndefined();
    expect(standalone.bookingState.name).toBeUndefined();
    expect(standalone.actionsTaken).toEqual([]);

    const midFlow = await devConversation({}, IN_FLOW).say("lol");
    expect(midFlow.bookingState.name).not.toBe("Lol");
    expect(midFlow.bookingState.name).toBeUndefined();
  });

  it('42. FIXED: "fire ball" invents nothing standalone (not misread as a service), and is no longer captured as the customer\'s name mid-flow', async () => {
    const standalone = await devConversation().say("fire ball");
    expect(standalone.bookingState.intent).toBeUndefined();
    expect(standalone.bookingState.service).toBeUndefined();

    const midFlow = await devConversation({}, IN_FLOW).say("fire ball");
    expect(midFlow.bookingState.name).not.toBe("Fire Ball");
    expect(midFlow.bookingState.name).toBeUndefined();
  });

  it('43. FIXED: "my dog died" invents nothing standalone (not misread via "my ..." phrasing), and is no longer captured whole as the customer\'s name mid-flow', async () => {
    const standalone = await devConversation().say("my dog died");
    expect(standalone.bookingState.intent).toBeUndefined();
    expect(standalone.bookingState.name).toBeUndefined();

    const midFlow = await devConversation({}, IN_FLOW).say("my dog died");
    expect(midFlow.bookingState.name).not.toBe("My Dog Died");
    expect(midFlow.bookingState.name).toBeUndefined();
  });

  it("44. a random number is never misread as a phone number, a date, or (mid-flow) a name — digits are correctly excluded throughout", async () => {
    const standalone = await devConversation().say("48291");
    expect(standalone.bookingState.intent).toBeUndefined();
    expect(standalone.bookingState.phone).toBeUndefined();
    expect(standalone.bookingState.date).toBeUndefined();

    const midFlow = await devConversation({}, IN_FLOW).say("48291");
    expect(midFlow.bookingState.name).toBeUndefined();
    expect(midFlow.bookingState.phone).toBeUndefined();
  });

  it("45. FIXED: keyboard-mash nonsense invents nothing standalone, and is no longer captured as the customer's name mid-flow", async () => {
    const standalone = await devConversation().say("asdkfj qwoeiru");
    expect(standalone.bookingState.intent).toBeUndefined();
    expect(standalone.bookingState.name).toBeUndefined();

    const midFlow = await devConversation({}, IN_FLOW).say("asdkfj qwoeiru");
    expect(midFlow.bookingState.name).not.toBe("Asdkfj Qwoeiru");
    expect(midFlow.bookingState.name).toBeUndefined();
  });
});
