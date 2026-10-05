import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";

/**
 * CATEGORY A — Natural confirmations (5 scenarios: 1–5)
 *
 * A customer mentions a service, gets offered a price/duration + a yes/no
 * question, and answers casually. This is the exact class of bug fixed in
 * the previous milestone (PendingAction) — these scenarios re-verify it
 * under torture-suite-grade assertions that inspect BookingState, not
 * just reply text, so a regression that "sounds right" but corrupts state
 * would still be caught.
 */
describe("CATEGORY A — natural confirmations", () => {
  it('1. "I\'d like a cleaning" -> "yes" transitions into booking, not fallback', async () => {
    const convo = devConversation();
    const offer = await convo.say("I'd like a cleaning");
    expect(offer.bookingState.pendingAction).toBe("confirm_service");
    expect(offer.bookingState.service).toBe("Routine cleaning");

    const confirmed = await convo.say("yes");
    expect(confirmed.reply).not.toMatch(/not totally sure I caught that/i);
    expect(confirmed.bookingState.pendingAction).toBeUndefined();
    expect(confirmed.bookingState.intent).toBe("book_appointment");
    expect(confirmed.bookingState.service).toBe("Routine cleaning");
    // The word "yes" must never end up captured as the customer's name.
    expect(confirmed.bookingState.name).toBeUndefined();
    expect(confirmed.actionsTaken).toEqual([]);
    expect(confirmed.escalated).toBe(false);
  });

  it('2. "I\'d like a cleaning" -> "yeah" behaves identically to "yes"', async () => {
    const convo = devConversation();
    await convo.say("I'd like a cleaning");
    const confirmed = await convo.say("yeah");

    expect(confirmed.reply).not.toMatch(/not totally sure I caught that/i);
    expect(confirmed.bookingState.pendingAction).toBeUndefined();
    expect(confirmed.bookingState.service).toBe("Routine cleaning");
    expect(confirmed.bookingState.name).toBeUndefined();
  });

  it('3. "I\'d like a cleaning" -> "yes please" behaves identically to "yes"', async () => {
    const convo = devConversation();
    await convo.say("I'd like a cleaning");
    const confirmed = await convo.say("yes please");

    expect(confirmed.reply).not.toMatch(/not totally sure I caught that/i);
    expect(confirmed.bookingState.pendingAction).toBeUndefined();
    expect(confirmed.bookingState.service).toBe("Routine cleaning");
    expect(confirmed.bookingState.name).toBeUndefined();
  });

  it('4. "Root canal" -> "sure" confirms — works for services other than cleaning', async () => {
    const convo = devConversation();
    const offer = await convo.say("Root canal");
    expect(offer.bookingState.service).toBe("Root canal");
    expect(offer.bookingState.pendingAction).toBe("confirm_service");

    const confirmed = await convo.say("sure");
    expect(confirmed.reply).not.toMatch(/not totally sure I caught that/i);
    expect(confirmed.bookingState.service).toBe("Root canal");
    expect(confirmed.bookingState.pendingAction).toBeUndefined();
    expect(confirmed.bookingState.name).toBeUndefined();
  });

  it('5. FIXED: "Filling" -> "sounds good" now confirms — AFFIRMATIVE_RE was expanded to a narrow set of natural confirming phrases', async () => {
    const convo = devConversation();
    const offer = await convo.say("Filling");
    expect(offer.bookingState.service).toBe("Basic filling");

    const confirmed = await convo.say("sounds good");
    expect(confirmed.bookingState.pendingAction).toBeUndefined();
    expect(confirmed.bookingState.service).toBe("Basic filling");
    expect(confirmed.reply).not.toMatch(/would you like to book/i);
  });

  it('remaining, still-open boundary: "meh, I guess" and other truly ambiguous replies correctly re-ask rather than guessing either way', async () => {
    const convo = devConversation();
    await convo.say("Filling");
    const confirmed = await convo.say("meh, I guess");

    expect(confirmed.bookingState.pendingAction).toBe("confirm_service");
    expect(confirmed.reply).toMatch(/would you like to book/i);
  });

  it('REGRESSION: "that works" and "perfect" also confirm, matching "sounds good"', async () => {
    for (const phrase of ["that works", "perfect"]) {
      const convo = devConversation();
      await convo.say("Root canal");
      const confirmed = await convo.say(phrase);

      expect(confirmed.bookingState.pendingAction, `"${phrase}"`).toBeUndefined();
      expect(confirmed.bookingState.service, `"${phrase}"`).toBe("Root canal");
    }
  });

  it('REGRESSION: a negated sentence containing "work"/"sound" is never misread as a confirmation', async () => {
    const convo = devConversation();
    await convo.say("Root canal");
    const confirmed = await convo.say("that doesn't work for me, and it doesn't sound good either");

    // Still pending — the negated phrasing must not accidentally match
    // the "that works" / "sounds good" affirmative patterns.
    expect(confirmed.bookingState.pendingAction).toBe("confirm_service");
  });
});
