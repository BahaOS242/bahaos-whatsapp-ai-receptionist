import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";
import type { BookingState } from "../../src/ai/types";

/**
 * CATEGORY C — Out-of-order information (5 scenarios: 11–15)
 *
 * A real customer rarely answers fields in the exact order asked. These
 * scenarios check that every field is captured regardless of order or
 * grouping — including the specific case where a bare name (no "my name
 * is" prefix) shares a message with other fields.
 *
 * FIXED: a bare name alongside date/time/phone (no service mention) is
 * now captured (#12, #13) — see the "weak signal" path in
 * dev-rule-based-provider.ts's handleFlowTurn. A service mention in the
 * SAME message (#14) still blocks it — that combination stays a
 * documented, intentionally-unaddressed gap, since a service mention
 * makes the leftover text too ambiguous to trust as a name.
 */
describe("CATEGORY C — out-of-order information", () => {
  const IN_FLOW: BookingState = { intent: "book_appointment", service: "Routine cleaning" };

  it("11. everything in one message, before any flow is active, captures the service and offers to book", async () => {
    const convo = devConversation();
    const result = await convo.say("Trevor 2428012847 Tuesday 2pm cleaning");

    // The service-mention offer path only reads the service out of the
    // message — the rest (name/phone/date/time) is not extracted here.
    // Documenting the actual boundary: the customer will be asked for
    // each of these again even though they already stated them.
    expect(result.bookingState.service).toBe("Routine cleaning");
    expect(result.bookingState.pendingAction).toBe("confirm_service");
    expect(result.bookingState.name).toBeUndefined();
    expect(result.bookingState.phone).toBeUndefined();
    expect(result.bookingState.date).toBeUndefined();
    expect(result.bookingState.time).toBeUndefined();
  });

  it("12. FIXED: phone number first now also captures the name, alongside date/time — every required field lands in one message, presenting a confirm prompt, and a plain yes then completes it", async () => {
    const convo = devConversation({}, IN_FLOW);
    const confirming = await convo.say("2428012847 Trevor Tuesday 2pm");

    // service (seeded) + phone/date/time/name (all captured from this one
    // message) satisfy every required field at once — Objective 2's hard
    // gate presents a confirm prompt rather than booking immediately.
    expect(confirming.actionsTaken).toEqual([]);
    expect(confirming.bookingState.pendingAction).toBe("confirm_booking");
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
    expect(result.bookingState).toEqual({});
  });

  it('13. FIXED: a bare name ("Trevor", no "my name is" prefix) sharing a message with date/time/phone is now captured — again completing the booking once confirmed', async () => {
    const convo = devConversation({}, IN_FLOW);
    const confirming = await convo.say("Trevor Tuesday 2pm 2428012847");
    expect(confirming.actionsTaken).toEqual([]);
    expect(confirming.bookingState.pendingAction).toBe("confirm_booking");
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
    expect(result.bookingState).toEqual({});
  });

  it("14. KNOWN GAP (unchanged, by design): a bare name is still dropped when a SERVICE is also mentioned in the same message — the combination stays too ambiguous to trust", async () => {
    const convo = devConversation({}, { intent: "book_appointment" });
    const result = await convo.say("Tuesday 2pm Trevor 2428012847 cleaning");

    expect(result.bookingState.service).toBe("Routine cleaning");
    expect(result.bookingState.date).toBe("Tuesday");
    expect(result.bookingState.time).toBe("14:00");
    expect(result.bookingState.phone).toBe("+12428012847");
    expect(result.bookingState.name).toBeUndefined();
  });

  it("15. name + phone given together, with nothing else in the message, IS captured (contrast with #14)", async () => {
    const convo = devConversation({}, IN_FLOW);
    const result = await convo.say("Trevor 2428012847");

    expect(result.bookingState.name).toBe("Trevor");
    expect(result.bookingState.phone).toBe("+12428012847");
    expect(result.reply).toMatch(/day and time/i);
  });

  it("REGRESSION: a lowercase leftover connector word (e.g. 'at' from 'Tuesday at 2pm') is never mistaken for a name", async () => {
    const convo = devConversation({}, IN_FLOW);
    const result = await convo.say("Tuesday at 2pm");

    expect(result.bookingState.date).toBe("Tuesday");
    expect(result.bookingState.time).toBe("14:00");
    expect(result.bookingState.name).toBeUndefined();
    expect(result.reply).toMatch(/name and phone/i);
  });
});
