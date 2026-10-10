import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";
import type { BookingState } from "../../src/ai/types";

/**
 * CATEGORY B — Incomplete date/time (5 scenarios: 6–10)
 *
 * A real customer very often gives the hour and the am/pm qualifier as
 * two separate messages ("tomorrow at 9" ... "pm"). date-time.ts requires
 * both in the SAME message to resolve a full time (deliberately, to avoid
 * guessing) — these scenarios test what happens to the bare hour in the
 * gap between those two messages.
 *
 * FIXED (ROOT CAUSE #2): "pm"/"am" used to be swallowed by the bare-name
 * fallback (the underlying mechanism shared with most of this suite's
 * other failures — see garbage-input.test.ts / emotional.test.ts /
 * abandonment.test.ts) and the "9" was simply discarded. Both are fixed
 * together: date-time.ts's parseBareHour/parseBareMeridiem/combineBareTime
 * let dev-rule-based-provider.ts remember the bare hour
 * (BookingState.pendingBareTime) and complete it from a later lone
 * "am"/"pm" reply, which is checked BEFORE the name-extraction path could
 * ever see it.
 */
describe("CATEGORY B — incomplete date/time", () => {
  const ALREADY_PICKED_SERVICE: BookingState = {
    intent: "book_appointment",
    service: "Routine cleaning",
  };

  it('6. bare "tomorrow" with no active flow does not hallucinate a booking', async () => {
    const convo = devConversation();
    const result = await convo.say("tomorrow");

    // No intent should exist yet — a bare date word alone must never be
    // enough to silently start a booking.
    expect(result.bookingState.intent).toBeUndefined();
    expect(result.bookingState.date).toBeUndefined();
    expect(result.actionsTaken).toEqual([]);
  });

  it('7. "tomorrow at 9" preserves the date and asks specifically for the time', async () => {
    const convo = devConversation({}, ALREADY_PICKED_SERVICE);
    const result = await convo.say("tomorrow at 9");

    expect(result.bookingState.date).toBeDefined();
    expect(result.bookingState.time).toBeUndefined();
    expect(result.reply).toMatch(/time/i);
    expect(result.bookingState.name).toBeUndefined();
  });

  it('8. "Tuesday at 9" -> "pm" resolves the bare hour to 21:00 — and, since 9 PM is after this business\'s 5 PM close, business-hours validation correctly rejects it immediately (proving the merge produced the right time in the first place: the rejection explains "9:00 PM", not some other hour). "pm" must NEVER become a name.', async () => {
    // A fixed weekday (not "tomorrow") makes this deterministic regardless
    // of which day the suite runs on — see business-hours-flow.test.ts for
    // why that matters once hours validation runs on the resolved date.
    const convo = devConversation({}, ALREADY_PICKED_SERVICE);
    await convo.say("Tuesday at 9");
    const result = await convo.say("pm");

    // The hard safety requirement from the task spec.
    expect(result.bookingState.name).not.toBe("Pm");
    expect(result.bookingState.name).toBeUndefined();
    // Rejected as after-hours, not silently booked or left unresolved —
    // and the rejection message proves "9" + "pm" merged to 21:00 (9 PM)
    // specifically, not discarded or misread.
    expect(result.actionsTaken).toEqual([]);
    expect(result.reply).toMatch(/9:00 PM/);
    expect(result.reply).toMatch(/outside our hours/i);
    // RETENTION (intentional change): only the out-of-hours time is dropped; the valid day is kept.
    expect(result.bookingState.date).toBe("Tuesday");
    expect(result.bookingState.time).toBeUndefined();
  });

  it('9. "Tuesday at 10" -> "am" resolves the bare hour to 10:00 — within business hours, so the flow proceeds normally to ask for name/phone. "am" must NEVER become a name.', async () => {
    const convo = devConversation({}, ALREADY_PICKED_SERVICE);
    await convo.say("Tuesday at 10");
    const result = await convo.say("am");

    expect(result.bookingState.name).not.toBe("Am");
    expect(result.bookingState.name).toBeUndefined();
    expect(result.bookingState.date).toBe("Tuesday");
    expect(result.bookingState.time).toBe("10:00");
    expect(result.reply).toMatch(/name and phone/i);
  });

  it('10. "Monday around 2" preserves the resolved date without inventing a time', async () => {
    const convo = devConversation({}, ALREADY_PICKED_SERVICE);
    const result = await convo.say("Monday around 2");

    expect(result.bookingState.date).toBe("Monday");
    // "2" has no am/pm — must stay unresolved rather than being guessed.
    expect(result.bookingState.time).toBeUndefined();
    expect(result.bookingState.name).toBeUndefined();
    expect(result.reply).toMatch(/time/i);
  });
});
