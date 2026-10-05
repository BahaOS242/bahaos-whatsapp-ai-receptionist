import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";
import type { BookingState } from "../../src/ai/types";

/**
 * CATEGORY D — Corrections (5 scenarios: 16–20)
 *
 * A customer changes their mind mid-flow.
 *
 * FIXED (ROOT CAUSE #1): DevRuleBasedAIProvider used to merge every
 * turn's newly-extracted fields directly on top of the persisted
 * BookingState with a plain object spread — a deliberate correction
 * happened to work, but for the SAME reason any incidental mention of a
 * matching pattern also silently overwrote an already-confirmed field
 * (see conversation-switching.test.ts #47). Overwriting an
 * ALREADY-confirmed field now requires an explicit correction marker
 * (CORRECTION_MARKER_RE in dev-rule-based-provider.ts — "actually",
 * "instead", "wrong number", etc.); these scenarios all use one, so they
 * continue to work exactly as before.
 *
 * REFINED: the marker is only required when the field being overwritten
 * is NOT what's currently being asked about (isFieldCurrentlyAsked) — a
 * direct answer to the question just posed never needs one, even in the
 * same message as an unrelated, marker-free mention that correctly still
 * gets rejected. See the two tests at the end of this file.
 */
describe("CATEGORY D — corrections", () => {
  const midFlow = (overrides: Partial<BookingState>): BookingState => ({
    intent: "book_appointment",
    service: "Routine cleaning",
    date: "Tuesday",
    time: "14:00",
    name: "Trevor",
    ...overrides,
  });

  it("16/17. date and time corrections each replace the old value with no stale leftover", async () => {
    const dateConvo = devConversation({}, midFlow({}));
    const dateResult = await dateConvo.say("actually make it Wednesday instead");

    expect(dateResult.bookingState.date).toBe("Wednesday");
    expect(dateResult.bookingState.date).not.toBe("Tuesday");
    // Everything else survives the correction.
    expect(dateResult.bookingState.time).toBe("14:00");
    expect(dateResult.bookingState.name).toBe("Trevor");

    const timeConvo = devConversation({}, midFlow({}));
    const timeResult = await timeConvo.say("actually 3pm");

    expect(timeResult.bookingState.time).toBe("15:00");
    expect(timeResult.bookingState.time).not.toBe("14:00");
    expect(timeResult.bookingState.date).toBe("Tuesday");
  });

  it("18/19. service and name corrections each replace the old value with no stale leftover", async () => {
    const serviceConvo = devConversation({}, midFlow({}));
    const serviceResult = await serviceConvo.say("actually I want a filling instead");

    expect(serviceResult.bookingState.service).toBe("Basic filling");
    expect(serviceResult.bookingState.service).not.toBe("Routine cleaning");
    expect(serviceResult.bookingState.date).toBe("Tuesday");
    expect(serviceResult.bookingState.time).toBe("14:00");

    const nameConvo = devConversation({}, midFlow({}));
    const nameResult = await nameConvo.say("actually my name is Thomas, not Trevor");

    expect(nameResult.bookingState.name).toBe("Thomas");
    expect(nameResult.bookingState.name).not.toBe("Trevor");
  });

  it("20. phone correction replaces the old value and the corrected number is what actually gets booked", async () => {
    const convo = devConversation({}, midFlow({ phone: "+12428019999" }));
    const confirming = await convo.say("sorry wrong number, it's 2425551234");
    expect(confirming.actionsTaken).toEqual([]);
    expect(confirming.bookingState.phone).toBe("+12425551234");
    expect(confirming.bookingState.pendingAction).toBe("confirm_booking");

    const result = await convo.say("yes");

    expect(result.bookingState).toEqual({});
    expect(result.actionsTaken).toEqual([
      {
        action: {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12425551234",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
        result: { success: true },
      },
    ]);
  });

  it("REFINEMENT: a field currently being asked updates WITHOUT a marker, even in the same message as an unrelated already-confirmed field mentioned without one", async () => {
    const convo = devConversation(
      {},
      { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday", time: "14:00" },
    );
    // name/phone are what's being asked (no marker needed); "filling" is
    // an incidental mention of a DIFFERENT, already-confirmed field, with
    // no correction marker anywhere in the message. Every required field
    // now lands at once, presenting a confirm prompt (Objective 2) — a
    // plain "yes" then completes it, and the completed payload is what
    // proves service was NOT switched.
    const confirming = await convo.say("my name is Trevor, 2428012847, I want a filling");
    expect(confirming.actionsTaken).toEqual([]);
    expect(confirming.bookingState.service).toBe("Routine cleaning");
    const result = await convo.say("yes");

    expect(result.actionsTaken).toEqual([
      {
        action: {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            // Not currently being asked, no marker present -> unchanged.
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
        result: { success: true },
      },
    ]);
  });

  it("REFINEMENT: overwriting an already-confirmed field that is NOT currently being requested still requires an explicit marker", async () => {
    const convo = devConversation(
      {},
      {
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
      },
    );
    // Phone is what's being asked (applies with no marker); "Wednesday"
    // is a bare, marker-free mention of a different day. Phone completes
    // every required field, presenting a confirm prompt (Objective 2) — a
    // plain "yes" then completes it, and the completed payload is what
    // proves date was NOT changed to Wednesday.
    const confirming = await convo.say("2428012847, by the way Wednesday might work better too");
    expect(confirming.actionsTaken).toEqual([]);
    expect(confirming.bookingState.date).toBe("Tuesday");
    const result = await convo.say("yes");

    expect(result.actionsTaken).toEqual([
      {
        action: {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
        result: { success: true },
      },
    ]);
  });
});
