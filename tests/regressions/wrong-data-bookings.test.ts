import { describe, expect, it } from "vitest";
import { devConversation, llmConversation, type TortureConversation } from "../torture/helpers";
import { pinClockToReferenceCalendar } from "../helpers/pin-clock";
import { extractStatedFields } from "../../src/ai/message-field-extraction";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";

/**
 * Regressions for the wrong-data bookings found by the Taskmaster-derived
 * conversation evaluation (run 2, commit e39bffe): patient names taken from
 * ordinary sentences, and dates/times taken from a REJECTED or incidental
 * mention instead of the customer's actual proposal.
 *
 * LANES: dev-rule-based fallback and scripted-LLM (adversarial fake model that
 * adds nothing; the application's own extraction drives). Simulated tools.
 * Clock frozen at 2026-08-20T15:00Z (Thursday 11:00 Nassau).
 */
pinClockToReferenceCalendar();

const ok = { content: "Got it.", toolCalls: [] as never[] };
const bookings = (c: TortureConversation) =>
  c.turns
    .flatMap((t) => t.actionsTaken)
    .filter((a) => a.action.type === "request_appointment" && a.result.success);

const DEV_PREFIX = ["I need a cleaning", "yes", "Thursday 4pm"]; // name is next
const LLM_PREFIX = ["I want a cleaning", "Thursday 4pm"];

async function atNameAsked(lane: "dev" | "llm", message: string) {
  const c = lane === "dev" ? devConversation() : llmConversation([ok]).conversation;
  await c.sayAll(lane === "dev" ? DEV_PREFIX : LLM_PREFIX);
  const t = await c.say(message);
  return { c, t };
}

const NOT_NAMES = [
  "Yes",
  "yes",
  "Please",
  "For my",
  "Ok",
  "Okay, that's fine.",
  "That is perfect",
  "Thanks",
  "Sounds good",
  "How long will it take?",
  "I haven't been before.",
  "Could we order two miso soups too?",
  "How's 4:30pm?",
  "That's too early. Any other time on Friday?",
  "Try Friday",
  "I'd like 10am then",
  "What about parking?",
  "I don't know",
  "Name is not important",
];

const REAL_NAMES: [string, string][] = [
  ["Trevor", "Trevor"],
  ["Anne Marie", "Anne Marie"],
  ["Mary-Jane O'Brien-Smith", "Mary-Jane O'Brien-Smith"],
  ["D'Angelo Ross", "D'Angelo Ross"],
  ["my name is Lola Abbott", "Lola Abbott"],
  ["Name is Lola Abbott", "Lola Abbott"],
  ["I'm Michael Gibson", "Michael Gibson"],
  ["It's for my wife, Janet Smith", "Janet Smith"],
  ["put it under Bob Smythe", "Bob Smythe"],
];

describe.each(["dev", "llm"] as const)("names need provenance (%s lane)", (lane) => {
  it.each(NOT_NAMES)("does not store %j as the patient name", async (message) => {
    const { t, c } = await atNameAsked(lane, message);
    expect(t.bookingState.name).toBeUndefined();
    expect(bookings(c)).toHaveLength(0);
  });

  it.each(REAL_NAMES)("keeps the legitimate name from %j", async (message, expected) => {
    const { t } = await atNameAsked(lane, message);
    expect(t.bookingState.name).toBe(expected);
  });

  it("name + phone together still works, and a later 'yes' books exactly the stored details once", async () => {
    const { c } = await atNameAsked(lane, "Alicia Moss 242-555-0111");
    expect(c.last.bookingState).toMatchObject({
      name: "Alicia Moss",
      phone: "+12425550111",
      pendingAction: expect.any(String),
    });
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
    expect(bookings(c)[0].action.payload).toMatchObject({
      name: "Alicia Moss",
      phone: "+12425550111",
      service: "Routine cleaning",
    });
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
  });
});

describe("dates and times come from the customer's proposal, not a rejected mention (extraction, both providers' shared path)", () => {
  const state = { intent: "book_appointment" as const, service: "Routine cleaning" };
  const ex = (message: string, current = state) =>
    extractStatedFields(BAHAMAS_DENTAL_SERVICE, message, current);

  it("'Next Thursday is too far, what about Tuesday 11am?' proposes Tuesday 11:00", () => {
    expect(ex("Next Thursday is too far, what about Tuesday 11am?")).toMatchObject({
      date: "Tuesday",
      time: "11:00",
    });
  });
  it("'I have a meeting at 10am. What about earlier? Wednesday 9am?' proposes Wednesday 09:00", () => {
    expect(ex("Oh no, I have a meeting at 10am. What about earlier? Wednesday 9am?")).toMatchObject(
      { date: "Wednesday", time: "09:00" },
    );
  });
  it("'11am won't work ... a 9 a.m. appointment' proposes 09:00 (a.m. with dots is understood)", () => {
    expect(
      ex("11am won't work, I'm having brunch with friends. Can you ask for a 9 a.m. appointment?"),
    ).toMatchObject({ time: "09:00" });
  });
  it("a deadline is not a date: 'before Wednesday' proposes nothing", () => {
    expect(ex("I need it done before Wednesday").date).toBeUndefined();
  });
  it("'my schedule is busy on Thursday' does not propose Thursday", () => {
    expect(ex("my schedule is busy on Thursday").date).toBeUndefined();
  });
});

describe("corrections at the confirmation step replace the right detail and require a fresh approval (dev lane)", () => {
  const toConfirmation = async (c: TortureConversation, time: string) => {
    await c.sayAll(["I need a cleaning", "yes", `Tuesday ${time}`, "Bob Smythe 242-555-0130"]);
    expect(c.last.bookingState.pendingAction).toBe("confirm_booking");
  };

  it("'Wait, I can't do 12:30, can you change it to 1:30?' never keeps 12:30; asks AM/PM; then books 13:30 once", async () => {
    const c = devConversation();
    await toConfirmation(c, "12:30pm");
    const t = await c.say("Wait, I can't do 12:30, can you change it to 1:30?");
    expect(t.bookingState.time).toBeUndefined();
    expect(t.bookingState.pendingAction).toBeUndefined();
    expect(t.reply).toMatch(/1:30/);
    expect(t.reply).toMatch(/am|pm/i);
    expect(t.reply).not.toMatch(/12:30/);
    expect(bookings(c)).toHaveLength(0);
    const y = await c.say("yes");
    expect(bookings(c)).toHaveLength(0); // yes cannot complete anything yet
    expect(y.reply).not.toMatch(/reply yes/i);
    const p = await c.say("pm");
    expect(p.bookingState).toMatchObject({
      time: "13:30",
      pendingAction: "confirm_booking",
      name: "Bob Smythe",
      date: "Tuesday",
    });
    expect(p.reply).toMatch(/1:30 PM/);
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
    expect(bookings(c)[0].action.payload).toMatchObject({
      preferredTime: "13:30",
      preferredDate: "Tuesday",
      name: "Bob Smythe",
    });
  });

  it("'11am won't work ... 9 a.m.' replaces 11:00 with 09:00, invalidates the old approval, and books only after a fresh yes", async () => {
    const c = devConversation();
    await toConfirmation(c, "11am");
    const t = await c.say(
      "11am won't work, I'm having brunch with friends. Can you ask for a 9 a.m. appointment?",
    );
    expect(t.bookingState).toMatchObject({
      time: "09:00",
      date: "Tuesday",
      name: "Bob Smythe",
      pendingAction: "confirm_booking",
    });
    expect(bookings(c)).toHaveLength(0);
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
    expect(bookings(c)[0].action.payload).toMatchObject({ preferredTime: "09:00" });
  });

  it("'Sorry, no, I'm busy on Thursday' clears the rejected day only; 'too early' clears only the time", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes", "Thursday 4pm"]);
    const a = await c.say("Sorry, no. my schedule is busy on Thursday.");
    expect(a.bookingState.date).toBeUndefined();
    expect(a.bookingState.time).toBe("16:00");
    expect(a.bookingState.service).toBe("Routine cleaning");
    const b = await c.say("Friday please");
    expect(b.bookingState).toMatchObject({ date: "Friday", time: "16:00" });
    const d = await c.say("That's too early. Any other time on Friday?");
    expect(d.bookingState.time).toBeUndefined();
    expect(d.bookingState.date).toBe("Friday");
    const e = await c.say("Friday 1pm works");
    expect(e.bookingState).toMatchObject({ date: "Friday", time: "13:00" });
  });

  it("a deadline phrase does not become the date; the real proposal does", async () => {
    const c = devConversation();
    await c.sayAll(["Hi, I'd like a cleaning", "yes", "I need it done before Wednesday"]);
    expect(c.last.bookingState.date).toBeUndefined();
    const t = await c.say("Monday 10am");
    expect(t.bookingState).toMatchObject({ date: "Monday", time: "10:00" });
  });
});

describe("typos of schedule words and abbreviations are not names (both lanes)", () => {
  it.each(["Tuesdya", "Thrusday", "Wendesday", "XL", "cleanign"])(
    "%j is not a patient name",
    async (message) => {
      for (const lane of ["dev", "llm"] as const) {
        const { t } = await atNameAsked(lane, message);
        expect(t.bookingState.name).toBeUndefined();
      }
    },
  );
  it("short and multi-capital real names survive (Al, AJ Smith, McDonald Ray)", async () => {
    for (const [msg, want] of [
      ["Al", "Al"],
      ["AJ Smith", "AJ Smith"],
      ["McDonald Ray", "McDonald Ray"],
    ] as const) {
      const { t } = await atNameAsked("dev", msg);
      expect(t.bookingState.name).toBe(want);
    }
  });
});

describe("service words: 'dental' is the clinic, not the consultation service", () => {
  it("'another dental office across town?' does not switch the service", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes"]);
    const t = await c.say("What about another dental office across town?");
    expect(t.bookingState.service).toBe("Routine cleaning");
  });
});

describe("a proposal replaces the stored slot; a hedged approval never books", () => {
  it("'I'd like 10am then' replaces a stored 09:00 (dev lane) and needs a fresh approval", async () => {
    const c = devConversation();
    await c.sayAll(["I need a cleaning", "yes", "Thursday at 9am"]);
    const t = await c.say("I'd like 10am then");
    expect(t.bookingState).toMatchObject({ time: "10:00" });
  });
  it("'Friday 9:00 is fine' replaces a stored Thursday", () => {
    const f = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Friday 9am is fine", {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Thursday",
      time: "09:00",
    });
    expect(f.date).toBe("Friday");
  });
  it.each([
    "Yes, but I'd like the chair near the window",
    "yes?",
    "ok but only if it's the same dentist",
  ])(
    "%j does not complete the booking (dev lane); a plain yes afterwards books exactly once",
    async (message) => {
      const c = devConversation();
      await c.sayAll(["I need a cleaning", "yes", "Tuesday 2pm", "Bob Smythe 242-555-0130"]);
      expect(c.last.bookingState.pendingAction).toBe("confirm_booking");
      const t = await c.say(message);
      expect(bookings(c)).toHaveLength(0);
      expect(t.bookingState).toMatchObject({ pendingAction: "confirm_booking", time: "14:00" });
      expect(t.reply).toMatch(/exact details|can't promise/i);
      await c.say("yes");
      expect(bookings(c)).toHaveLength(1);
      expect(bookings(c)[0].action.payload).toMatchObject({
        preferredTime: "14:00",
        name: "Bob Smythe",
      });
    },
  );
  it("scripted LLM: a model-proposed booking on 'Yes, but …' is blocked by the gate", async () => {
    const book = {
      content: "Booked!",
      toolCalls: [
        {
          id: "x",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Bob Smythe",
            phone: "+12425550130",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          }),
        },
      ],
    };
    const { conversation: c } = llmConversation([ok, ok, ok, book]);
    await c.sayAll(["I want a cleaning", "Tuesday 2pm", "Bob Smythe 242-555-0130"]);
    expect(c.last.bookingState.pendingAction).toBe("confirm_service");
    await c.say("Yes, but I'd like the chair near the window");
    expect(bookings(c)).toHaveLength(0);
  });
});
