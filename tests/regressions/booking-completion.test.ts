import { describe, expect, it } from "vitest";
import { devConversation, llmConversation, type TortureConversation } from "../torture/helpers";
import { pinClockToReferenceCalendar } from "../helpers/pin-clock";
import { extractStatedFields } from "../../src/ai/message-field-extraction";
import { repairTypos } from "../../src/ai/lexicon-repair";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";

/**
 * Booking-completion regressions: each pins a way cooperative customers used to STALL (found by triaging the 189
 * safe-incomplete conversations of run 3). Safety is asserted alongside completion: exact stored details, a separate
 * approval, exactly one booking. LANES: dev-rule-based fallback (+ shared extraction used by the LLM path),
 * simulated tools, clock frozen at 2026-08-20T15:00Z (Thursday 11:00 Nassau).
 */
pinClockToReferenceCalendar();
const bookings = (c: TortureConversation) =>
  c.turns
    .flatMap((t) => t.actionsTaken)
    .filter((a) => a.action.type === "request_appointment" && a.result.success);
const state = { intent: "book_appointment" as const };

describe("typo tolerance for the key booking words", () => {
  it.each([
    ["claening", "cleaning"],
    ["Wendesday", "Wednesday"],
    ["apointment", "appointment"],
    ["consultaton", "consultation"],
    ["fillign", "filling"],
    ["Tuesdya", "Tuesday"],
    ["tomorow", "tomorrow"],
  ])("%s -> %s", (typo, word) => expect(repairTypos(`I need ${typo}`)).toBe(`I need ${word}`));
  it.each(["billing", "ceiling", "clearing", "feeling", "Mandy", "Marcy", "Trevor"])(
    "leaves real word/name %j alone",
    (w) => {
      expect(repairTypos(w)).toBe(w);
    },
  );
  it("a typo'd request books end to end with exact details", async () => {
    const c = devConversation();
    await c.sayAll([
      "I need an apointment for a claening",
      "Wendesday 10am",
      "Anne Marie Rolle 242-555-0100",
      "yes",
    ]);
    expect(bookings(c)).toHaveLength(1);
    expect(bookings(c)[0].action.payload).toMatchObject({
      service: "Routine cleaning",
      preferredDate: "Wednesday",
      preferredTime: "10:00",
      name: "Anne Marie Rolle",
    });
  });
  it("shared (LLM-path) extraction repairs service and day typos too", () => {
    expect(
      extractStatedFields(BAHAMAS_DENTAL_SERVICE, "a fillign on Thrusday 3pm", state),
    ).toMatchObject({ service: "Basic filling", date: "Thursday", time: "15:00" });
  });
});

describe("valid details survive and are not asked for again", () => {
  it("an out-of-hours time drops only the time; the day is kept and only the time is re-asked", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes"]);
    const t = await c.say("Thursday 6pm");
    expect(t.bookingState).toMatchObject({ date: "Thursday", service: "Routine cleaning" });
    expect(t.bookingState.time).toBeUndefined();
    expect(t.reply).toMatch(/what time/i);
    const u = await c.say("Can I come in at 4pm then?");
    expect(u.bookingState).toMatchObject({ date: "Thursday", time: "16:00" });
  });
  it("a closed day drops only the day; the time is kept", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes"]);
    const t = await c.say("Saturday 10am");
    expect(t.bookingState.date).toBeUndefined();
    expect(t.bookingState.time).toBe("10:00");
  });
  it("a full name volunteered while the day is being asked is kept", async () => {
    const c = devConversation();
    await c.sayAll(["I'd like to schedule a cleaning", "yes", "Brent Cole"]);
    expect(c.last.bookingState.name).toBe("Brent Cole");
    await c.sayAll(["242-555-0112", "Tuesday 11am"]);
    expect(c.last.bookingState).toMatchObject({
      name: "Brent Cole",
      phone: "+12425550112",
      date: "Tuesday",
      time: "11:00",
      pendingAction: "confirm_booking",
    });
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
  });
  it("'any time on Mondays' is a day", () => {
    expect(
      extractStatedFields(BAHAMAS_DENTAL_SERVICE, "I can do any time on Mondays actually", state)
        .date,
    ).toBe("Monday");
  });
  it("'a filling, not a cleaning' selects the filling", () => {
    expect(
      extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Sorry, I meant a filling, not a cleaning", state)
        .service,
    ).toBe("Basic filling");
  });
});

describe("side questions are answered honestly, and the booking resumes with every detail intact", () => {
  async function atConfirmation() {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes", "Tuesday 10am", "Gina Hart, 242-555-0121"]);
    expect(c.last.bookingState.pendingAction).toBe("confirm_booking");
    return c;
  }
  it.each([
    ["How long will it take?", /about 60 minutes/],
    ["Can you give me directions?", /Shirley St.*can't give turn-by-turn/],
    ["Do you accept checks?", /don't have that information.*front desk/],
    ["Is there parking nearby?", /don't have that information.*front desk/],
    ["Do you offer a shuttle?", /don't have that information/],
    ["Are there other times available?", /can't see live openings.*Monday/],
  ])("%j", async (q, expected) => {
    const c = await atConfirmation();
    const t = await c.say(q);
    expect(t.reply).toMatch(expected);
    expect(t.reply).toMatch(/Reply YES/); // the exact summary is shown again
    expect(t.bookingState).toMatchObject({
      pendingAction: "confirm_booking",
      name: "Gina Hart",
      phone: "+12425550121",
      date: "Tuesday",
      time: "10:00",
    });
    expect(bookings(c)).toHaveLength(0);
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
    expect(bookings(c)[0].action.payload).toMatchObject({
      name: "Gina Hart",
      preferredTime: "10:00",
    });
  });
  it("name + phone + a shuttle question in ONE message: details kept, question answered, flow continues", async () => {
    const c = devConversation();
    await c.sayAll(["Hello, I want an appointment for a cleaning", "yes", "Tuesday morning, 9am"]);
    const t = await c.say(
      "Igor Horne, 242-555-0127. Also my record is under my personal number. Do you offer a shuttle?",
    );
    expect(t.bookingState).toMatchObject({
      name: "Igor Horne",
      phone: "+12425550127",
      pendingAction: "confirm_booking",
    });
    expect(t.reply).toMatch(/don't have that information/);
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
  });
  it.each(["Do you do teeth whitening?", "I also need my tires rotated"])(
    "unsupported request %j gets an honest limit",
    async (q) => {
      const c = devConversation();
      const t = await c.say(q);
      expect(t.reply).toMatch(/isn't one of the services I can book/);
      expect(bookings(c)).toHaveLength(0);
    },
  );
  it("a booking request that also asks about hours is a booking with a side answer", async () => {
    const c = devConversation();
    const t = await c.say("Hi, can I get a filling this week? Any time before you close.");
    expect(t.reply).toMatch(/Monday.*Friday/);
    expect(t.bookingState).toMatchObject({ intent: "book_appointment", service: "Basic filling" });
  });
  it("a non-emergency symptom is offered an assessment, not a diagnosis, and a yes continues the booking", async () => {
    const c = devConversation();
    const t = await c.say("Hey, something's wrong with my tooth, can I come in sometime soon?");
    expect(t.reply).toMatch(/can't diagnose/i);
    expect(t.reply).toMatch(/consultation/i);
    expect(t.bookingState).toMatchObject({
      intent: "book_appointment",
      service: "Dental consultation / basic exam",
      pendingAction: "confirm_service",
    });
    expect(t.reply).not.toMatch(/you (have|need) (a )?(cavity|root canal|infection|filling)/i);
    const y = await c.say("yes");
    expect(y.reply).toMatch(/what day/i);
  });
  it("'which one is best' is not answered with a treatment recommendation", async () => {
    const c = devConversation();
    const t = await c.say("Which one is really good?");
    expect(t.reply).toMatch(/can't recommend a treatment/i);
  });
});

describe("a second request for the same slot is never silently double-booked", () => {
  it("the same patient asking again for the booked day and time is rejected as unavailable, not created twice", async () => {
    const c = devConversation();
    await c.sayAll([
      "I'd like to book a cleaning for Friday at 10am",
      "Dina Gray 242-555-0142",
      "yes",
    ]);
    expect(bookings(c)).toHaveLength(1);
    await c.sayAll(["I want a filling", "yes", "Friday 10am", "yes"]);
    expect(bookings(c)).toHaveLength(1);
  });
});
