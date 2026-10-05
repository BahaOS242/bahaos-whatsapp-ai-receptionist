import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";

/**
 * CATEGORY G — Existing appointment management (5 scenarios: 31–35)
 *
 * Booking, cancellation, and reschedule are modeled as three distinct
 * BookingIntent values with their own REQUIRED_FIELDS — switching between
 * them is handled by resolveFlowState's "task switch" branch, which is
 * one of the more solid parts of this provider. These scenarios largely
 * PASS, unlike most other categories, and are included specifically so a
 * future architectural change can't silently regress the one flow-control
 * mechanism that currently works.
 */
describe("CATEGORY G — existing appointment management", () => {
  it("31. a bare cancellation request starts the cancel_appointment flow, not booking", async () => {
    const convo = devConversation();
    const result = await convo.say("I need to cancel my appointment");

    expect(result.bookingState.intent).toBe("cancel_appointment");
    expect(result.reply).toMatch(/name and phone/i);
  });

  it("32. a cancellation request naming a date still resolves to cancel_appointment, not booking", async () => {
    const convo = devConversation();
    const result = await convo.say("Cancel my appointment for Tuesday");

    expect(result.bookingState.intent).toBe("cancel_appointment");
  });

  it("33. starting a NEW booking, then asking to cancel an EXISTING appointment, switches intent cleanly", async () => {
    const convo = devConversation();
    await convo.say("I want a cleaning");
    await convo.say("yes");
    const result = await convo.say("actually I need to cancel my existing appointment");

    expect(result.bookingState.intent).toBe("cancel_appointment");
    // The in-progress NEW booking's service must not leak into the
    // cancellation request.
    expect(result.bookingState.service).toBeUndefined();
    expect(result.reply).toMatch(/name and phone/i);
  });

  it("34. a reschedule request starts the reschedule_appointment flow, not booking or cancellation", async () => {
    const convo = devConversation();
    const result = await convo.say("I need to reschedule my appointment");

    expect(result.bookingState.intent).toBe("reschedule_appointment");
    expect(result.reply).toMatch(/new day and time/i);
  });

  it("35. a reschedule flow captures the new date/time and completes as a request_reschedule action, not request_appointment", async () => {
    const convo = devConversation();
    await convo.say("I need to reschedule my appointment");
    await convo.say("Wednesday 3pm");
    const confirming = await convo.say("Trevor 2428012847");
    expect(confirming.actionsTaken).toEqual([]);
    expect(confirming.bookingState.pendingAction).toBe("confirm_booking");
    const result = await convo.say("yes");

    expect(result.actionsTaken).toEqual([
      {
        action: {
          type: "request_reschedule",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            newPreferredDate: "Wednesday",
            newPreferredTime: "15:00",
          },
        },
        result: { success: true },
      },
    ]);
    expect(result.bookingState).toEqual({});
  });
});
