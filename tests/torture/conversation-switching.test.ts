import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";

/**
 * CATEGORY J — Conversation switching / chaos (5 scenarios: 46–50)
 *
 * FIXED (ROOT CAUSE #7): FAQ intents (hours/location/services/insurance/
 * new_patient/price) detected mid-flow are now answered directly,
 * preserving bookingState and resuming the flow afterward — see the
 * FAQ_INTENTS dispatch and answerPriceInquiry in
 * dev-rule-based-provider.ts. A price question that mentions a different
 * service's name ("how much is a filling?") now answers about THAT
 * service without touching what's actually being booked, since it never
 * reaches the field-merge logic at all (that's also ROOT CAUSE #1's
 * fix — see corrections.test.ts).
 *
 * FIXED (ROOT CAUSE #9): escalating mid-booking (#49) now durably blocks
 * automation on the next message.
 *
 * FIXED (ROOT CAUSE #6): abandoning (#50) now genuinely clears the flow.
 */
describe("CATEGORY J — conversation switching / chaos", () => {
  it("46. FIXED: asking clinic hours mid-booking is now answered, and the flow resumes afterward", async () => {
    const convo = devConversation();
    await convo.say("I want a cleaning");
    await convo.say("yes");
    const asked = await convo.say("what are your hours?");

    expect(asked.reply).toMatch(/9:00 AM|hours/i);
    // bookingState (service, etc.) is untouched by answering the FAQ.
    expect(asked.bookingState.service).toBe("Routine cleaning");

    // Booking resumes normally afterward.
    const resumed = await convo.say("Tuesday 2pm");
    expect(resumed.bookingState.date).toBe("Tuesday");
  });

  it('47. FIXED: "how much is a filling?" while booking a cleaning now answers about filling WITHOUT switching the booked service', async () => {
    const convo = devConversation();
    await convo.say("I want a cleaning");
    await convo.say("yes");
    const asked = await convo.say("how much is a filling?");

    expect(asked.reply).toMatch(/B\$175|45 minutes/i);
    expect(asked.bookingState.service).toBe("Routine cleaning");
  });

  it('48. deliberately changing the service mid-booking ("actually root canal") DOES work — the intended use of the same mechanism that makes #47 a bug', async () => {
    const convo = devConversation();
    await convo.say("I want a cleaning");
    await convo.say("yes");
    const result = await convo.say("actually root canal");

    expect(result.bookingState.service).toBe("Root canal");
  });

  it("49. FIXED: asking for a human mid-booking escalates, and a follow-up message no longer resumes automated booking (see escalation.test.ts)", async () => {
    const convo = devConversation();
    await convo.say("I want a cleaning");
    await convo.say("yes");
    const escalateTurn = await convo.say("I want to talk to someone");
    expect(escalateTurn.escalated).toBe(true);

    const attempted = await convo.say("Tuesday 2pm");
    expect(attempted.bookingState.intent).toBeUndefined();
    expect(attempted.actionsTaken).toEqual([]);
  });

  it('50. FIXED: abandoning ("never mind") clears the flow, so "starting a new booking" afterward is a genuinely new, independent booking', async () => {
    const convo = devConversation();
    await convo.say("I want a cleaning");
    await convo.say("yes");
    const abandoned = await convo.say("never mind");
    // Per abandonment.test.ts #26: this now exits cleanly.
    expect(abandoned.bookingState.intent).toBeUndefined();

    const newBooking = await convo.say("I want a filling");
    // A fresh, independent offer — not a leftover mid-flow correction.
    expect(newBooking.bookingState.service).toBe("Basic filling");
    expect(newBooking.bookingState.pendingAction).toBe("confirm_service");
  });
});
