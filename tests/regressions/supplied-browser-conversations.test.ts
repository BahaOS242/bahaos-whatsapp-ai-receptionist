import { describe, expect, it } from "vitest";
import { devConversation } from "../torture/helpers";
import { pinClockToReferenceCalendar } from "../helpers/pin-clock";

/**
 * The two free browser conversations supplied by the owner in the master
 * reliability prompt (§3), as they were typed. LANE: dev-rule-based fallback +
 * simulated tools, clock frozen at 2026-08-20T15:00Z.
 *
 */
pinClockToReferenceCalendar();
const bookings = (c: ReturnType<typeof devConversation>) =>
  c.turns
    .flatMap((t) => t.actionsTaken)
    .filter((a) => a.action.type === "request_appointment" && a.result.success);

describe("supplied conversation 1: check up -> cleaning -> repeated '3pm or 4pm' -> Tuesday 3pm -> Trevor", () => {
  const script = [
    "I want a check up",
    "I want a cleaning",
    "yes",
    "3pm or 4pm",
    "3pm or 4pm",
    "Tuesday 3pm",
    "Trevor 2428012847",
    "yes",
  ];

  it("recognises 'check up' through the configured alias (no generic 'not sure I caught that')", async () => {
    const c = devConversation();
    const t = await c.say(script[0]);
    expect(t.bookingState.service).toBe("Dental consultation / basic exam");
    expect(t.reply).not.toMatch(/not totally sure I caught that/i);
  });

  it("switches to the cleaning the customer then asked for, and never repeats the same generic reply for the unresolved time", async () => {
    const c = devConversation();
    await c.sayAll(script.slice(0, 5));
    expect(c.turns[1].bookingState.service).toBe("Routine cleaning");
    const [a, b] = [c.turns[3], c.turns[4]];
    expect(a.reply).toMatch(/exact time/i);
    expect(a.reply).toMatch(/day/i); // the missing date is acknowledged too
    expect(b.reply).not.toBe(a.reply);
    expect(b.reply).toMatch(/single time|team member/i);
    expect(c.turns[4].bookingState.time).toBeUndefined();
  });

  it("recovers normally after 'Tuesday 3pm' and books exactly one correct appointment after a separate yes", async () => {
    const c = devConversation();
    await c.sayAll(script.slice(0, 7));
    expect(c.last.bookingState).toMatchObject({
      date: "Tuesday",
      time: "15:00",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_booking",
    });
    expect(bookings(c)).toHaveLength(0);
    await c.say(script[7]);
    expect(bookings(c)).toHaveLength(1);
    expect(bookings(c)[0].action.payload).toMatchObject({
      name: "Trevor",
      phone: "+12428012847",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "15:00",
    });
  });
});

describe("supplied conversation 2: service information", () => {
  it("answers 'where yall located' from the configured address", async () => {
    const c = devConversation();
    const t = await c.say("where yall located");
    expect(t.reply).toMatch(/Shirley St/);
  });
  it("lists the configured services for 'someone who teeth hurting' without diagnosing", async () => {
    const c = devConversation();
    const t = await c.say("what services yall have for someone who teeth hurting");
    expect(t.reply).toMatch(/consultation/i);
    expect(t.reply).not.toMatch(/you (have|need) (a )?(cavity|root canal|infection)/i);
  });
  it("handles the greeting typo 'whatsuo' as a greeting", async () => {
    const c = devConversation();
    const t = await c.say("whatsuo");
    expect(t.reply).toMatch(/how can I help/i);
  });
  it("resolves 'what does each one do' to the configured services, from approved data only, and says detail is not on file", async () => {
    const c = devConversation();
    await c.sayAll(["where yall located", "what services yall have for someone who teeth hurting"]);
    const t = await c.say("what does each one do");
    for (const name of ["consultation", "cleaning", "filling", "root canal"])
      expect(t.reply).toMatch(new RegExp(name, "i"));
    expect(t.reply).toMatch(/don't have detailed descriptions/i);
    expect(t.reply).not.toMatch(/you (have|need) (a )?(cavity|infection)/i);
  });
});
