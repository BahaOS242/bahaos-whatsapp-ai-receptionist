import { describe, expect, it } from "vitest";
import { devConversation, type TortureConversation } from "../torture/helpers";
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

describe("clarification recovery: no identical re-asks, examples, then human help", () => {
  it("an unrelated 'yes' while the day is being asked gets an example, then a human offer, then a handoff — never the same sentence", async () => {
    const c = devConversation();
    await c.sayAll(["I'd like to schedule a cleaning"]);
    const first = c.last.reply;
    const a = await c.say("yes");
    const b = await c.say("ok");
    const d = await c.say("yes");
    const replies = [first, a.reply, b.reply, d.reply];
    expect(new Set(replies.map((r) => r.toLowerCase())).size).toBe(4);
    expect(a.reply).toMatch(/For example/);
    expect(b.reply).toMatch(/talk to someone/i);
    expect(d.reply).toMatch(/passing your request to a team member/);
    expect(d.actionsTaken.some((x) => x.action.type === "escalate")).toBe(true);
  });
  it("making progress is never treated as a stall: name and phone given while the day is still missing are acknowledged and kept", async () => {
    const c = devConversation();
    await c.sayAll(["I'd like to schedule a cleaning", "Brent Cole 242-555-0112"]);
    expect(c.last.reply).toMatch(/Got it, thanks/);
    expect(c.last.bookingState).toMatchObject({ name: "Brent Cole", phone: "+12425550112" });
    expect(c.last.actionsTaken).toEqual([]);
  });
  it("two services in one message get a specific question, not the generic list", async () => {
    const c = devConversation();
    const t = await c.say("Hello I need an appointment, a filling and a cleaning if possible");
    expect(t.reply).toMatch(
      /one service per appointment.*Routine cleaning or Basic filling|one service per appointment.*Basic filling or Routine cleaning/,
    );
  });
  it("a repeated yes after the request was recorded is acknowledged, not re-processed, and creates nothing", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes", "Tuesday 2pm", "Gina Hart 242-555-0121", "yes"]);
    expect(bookings(c)).toHaveLength(1);
    const t = await c.say("yes");
    expect(t.reply).toMatch(/already recorded/);
    expect(bookings(c)).toHaveLength(1);
  });
  it.each([
    "Ok. I will book next time.",
    "No, not right now, I've got to go, bye",
    "I think I'm just going to sit this one out",
  ])("%j ends the booking politely", async (m) => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes"]);
    const t = await c.say(m);
    expect(t.bookingState.intent).toBeUndefined();
    expect(bookings(c)).toHaveLength(0);
  });
});

describe("identity provenance in context", () => {
  it("'check-up' is a service request, never a payment question", async () => {
    const c = devConversation();
    const t = await c.say("Hello, I think I'm due for a check-up, can you set up an appointment?");
    expect(t.reply).not.toMatch(/don't have that information/);
    expect(t.bookingState).toMatchObject({
      intent: "book_appointment",
      service: "Dental consultation / basic exam",
    });
  });
  it.each([
    ["I'm Michael Gibson, 242-555-0137", "Michael Gibson"],
    ["Opal Day 242-555-0146", "Opal Day"],
  ])("%j gives the name %j when a phone number comes with it", async (m, name) => {
    const c = devConversation();
    await c.sayAll(["Hello, I'm calling to book an appointment"]);
    const t = await c.say(m);
    expect(t.bookingState.name).toBe(name);
  });
  it("a name in the sentence after a service request is found ('a consultation for me, Monday 10am. Ruth Sims 242-555-0144')", async () => {
    const c = devConversation();
    await c.sayAll([
      "I want a booking",
      "Ok then a consultation for me, Monday 10am. Ruth Sims 242-555-0144",
    ]);
    expect(c.last.bookingState).toMatchObject({
      name: "Ruth Sims",
      date: "Monday",
      time: "10:00",
      pendingAction: "confirm_booking",
    });
  });
});

describe("mixed messages: details are absorbed AND the question is answered", () => {
  it("'9am works. What will it cost?' stores 9am and states the configured price", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes", "Tuesday 8am"]);
    const t = await c.say("9am works. What will it cost?");
    expect(t.bookingState).toMatchObject({ date: "Tuesday", time: "09:00" });
    expect(t.reply).toMatch(/B\$125/);
    expect(t.reply).toMatch(/name/i); // moves on to the next missing detail
  });
  it("'Can you ask what the exam fee is?' is a price question, not a request for a person", async () => {
    const c = devConversation();
    await c.sayAll(["I think I'm due for a check-up, can you set up an appointment?"]);
    const t = await c.say("Can you ask what the exam fee is?");
    expect(t.reply).toMatch(/B\$75/);
    expect(t.actionsTaken).toEqual([]);
  });
  it("'What about 8am?' proposes a time; it is not an approximate time", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes", "Tuesday"]);
    const t = await c.say("What about 8am?");
    expect(t.reply).toMatch(/outside our hours/i);
    expect(t.reply).not.toMatch(/exactly right/i);
  });
  it("'No, that sounds right' after the summary is neither a decline nor an approval: it asks once, plainly", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes", "Tuesday 2pm", "Gina Hart 242-555-0121"]);
    const t = await c.say("No, that sounds right.");
    expect(bookings(c)).toHaveLength(0);
    expect(t.bookingState.pendingAction).toBe("confirm_booking");
    expect(t.reply).toMatch(/Just to be sure/);
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
  });
  it.each([
    ["I want the cheapest option under B$100", /lowest-priced.*Dental consultation.*B\$75/],
    ["Does the clinic have at least four stars?", /don't have that information/],
    ["Can I get a window chair too?", /don't have that information/],
  ])("%j", async (q, expected) => {
    const c = devConversation();
    const t = await c.say(q);
    expect(t.reply).toMatch(expected);
    expect(t.actionsTaken).toEqual([]);
  });
});

describe("a bare-hour correction at the confirmation step is never silently ignored", () => {
  it("'Actually, can we do 2:30?' (no am/pm) drops the stale approval, asks AM or PM, and books only the confirmed 2:30 PM once", async () => {
    const c = devConversation();
    await c.sayAll(["I need a filling", "yes", "Friday 2pm", "Joy Hall 242-555-0151"]);
    expect(c.last.bookingState.pendingAction).toBe("confirm_booking");
    const t = await c.say("Actually, can we do 2:30?");
    expect(t.bookingState.time).toBeUndefined();
    expect(t.bookingState.pendingAction).toBeUndefined();
    expect(t.reply).toMatch(/2:30 AM or 2:30 PM/);
    const y = await c.say("yes");
    expect(bookings(c)).toHaveLength(0);
    expect(y.reply).not.toMatch(/reply yes/i);
    const p = await c.say("pm");
    expect(p.bookingState).toMatchObject({
      time: "16:30",
      pendingAction: "confirm_booking",
      name: "Joy Hall",
    });
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
    expect(bookings(c)[0].action.payload).toMatchObject({
      preferredTime: "16:30",
      name: "Joy Hall",
    });
  });
  it("the unknown-fact answer is a statement, not a second yes/no question (so the next yes is unambiguous)", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes", "Tuesday 2pm", "Gina Hart 242-555-0121"]);
    const t = await c.say("Do you offer a shuttle?");
    expect(t.reply).not.toMatch(/would you like|if you'd like me|pass your question/i);
    expect(t.reply).toMatch(/talk to someone/);
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
  });
});
