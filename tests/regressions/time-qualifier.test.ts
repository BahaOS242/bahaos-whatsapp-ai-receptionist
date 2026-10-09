import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devConversation, llmConversation, type TortureConversation } from "../torture/helpers";
import { hasTimeQualifier, parseBareHour, parseTime } from "../../src/ai/date-time";

/**
 * Regression corpus for the "silently wrong hour" class: a QUALIFIED time ("quarter to 3pm", "not 3pm", "3pm or 4pm",
 * "from 2pm to 4pm") used to store the first "N pm" it saw. The application now asks for ONE exact time instead.
 *
 * LANES: pure parser; deterministic FALLBACK provider (DevRuleBasedAIProvider); SCRIPTED LLM client (LLMProvider with a
 * fake model that never books, so every asserted field and every booking comes from application code). SIMULATED tools.
 * None of this says anything about Anthropic's language understanding. Clock frozen at 2026-10-09T16:00Z (Fri noon, Nassau).
 */
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T16:00:00Z") }); });
afterEach(() => { vi.useRealTimers(); });

const QUALIFIED = [
  "quarter to 3pm",
  "a quarter to 3 pm",
  "quarter past 3pm",
  "half past 3pm",
  "10 to 3 pm",
  "not 3pm",
  "3pm or 4pm",
  "3 or 4pm",
  "from 2pm to 4pm",
  "between 2pm and 4pm",
  "before 3pm",
  "after 3pm",
  "around 3pm",
  "3pm-ish",
];
const NORMAL: Array<[string, string]> = [
  ["Tuesday 3 pm", "15:00"],
  ["2:30pm", "14:30"],
  ["Tuesday at 2:30pm", "14:30"],
  ["noon is 12pm", "12:00"],
  ["I can do 9am", "09:00"],
  ["actually make it 3pm not 2pm", "15:00"], // the time BEFORE "not" is the stated one
];

const ok = { content: "Got it.", toolCalls: [] as never[] };
const llm = () => llmConversation(Array.from({ length: 16 }, () => ok)).conversation;
const bookings = (c: TortureConversation) =>
  c.turns.flatMap((t) => t.actionsTaken).filter((a) => a.action.type === "request_appointment");

describe("parser: a qualified time is never resolved to one hour", () => {
  it.each(QUALIFIED)("%j -> no time, no bare hour", (text) => {
    const msg = `Tuesday ${text}`;
    expect(hasTimeQualifier(msg)).toBe(true);
    expect(parseTime(msg)).toBeUndefined();
    expect(parseBareHour(msg)).toBeUndefined();
  });
  it.each(NORMAL)("normal %j still parses to %s", (text, expected) => {
    expect(hasTimeQualifier(text)).toBe(false);
    expect(parseTime(text)).toBe(expected);
  });
  it("ordinary sentences are not qualifiers", () => {
    for (const t of ["It's Alisha not Alicia", "my number is 242 801 2847", "I want a cleaning every 6 months", "October 14 at 10am", "tmrw 3pm"]) {
      expect(hasTimeQualifier(t)).toBe(false);
    }
  });
});

type Lane = { name: string; make: () => TortureConversation; opening: string[]; afterService: string[]; details: string[] };
const lanes: Lane[] = [
  { name: "FALLBACK provider", make: () => devConversation(), opening: ["I want a cleaning", "yes"], afterService: ["Tuesday 2pm"], details: ["Trevor 2428012847"] },
  { name: "SCRIPTED LLM", make: () => llm(), opening: ["I want a cleaning"], afterService: ["Tuesday 2pm"], details: ["Trevor 2428012847"] },
];

describe.each(lanes)("$name", (lane) => {
  describe("no time stored yet", () => {
    it.each(QUALIFIED)("%j -> asks for ONE time, stores none, books nothing", async (text) => {
      const c = lane.make();
      await c.sayAll(lane.opening);
      const t = await c.say(`Tuesday ${text}`);
      expect(t.bookingState.time).toBeUndefined();
      expect(t.bookingState.timeClarification).toBe(true);
      expect(t.bookingState.pendingBareTime).toBeUndefined();
      expect(t.reply).toMatch(/what one time/i);
      expect(bookings(c)).toHaveLength(0);
    });
  });

  describe("an existing time is not overwritten or booked while unresolved", () => {
    it.each(QUALIFIED)("%j keeps 14:00, drops the pending confirmation, and 'yes' books nothing", async (text) => {
      const c = lane.make();
      await c.sayAll([...lane.opening, ...lane.afterService, ...lane.details]);
      expect(c.last.bookingState.time).toBe("14:00");
      expect(c.last.bookingState.pendingAction).toBeDefined();
      const t = await c.say(text);
      expect(t.bookingState.time).toBe("14:00");
      expect(t.bookingState.timeClarification).toBe(true);
      expect(t.bookingState.pendingAction).toBeUndefined();
      expect(t.reply).toMatch(/what one time/i);
      await c.say("yes");
      expect(c.last.bookingState.time).toBe("14:00");
      expect(c.last.bookingState.pendingAction).toBeUndefined();
      expect(bookings(c)).toHaveLength(0);
    });
  });

  describe("clarified time needs a separate confirmation", () => {
    it("qualifier -> 'yes' (nothing) -> '3pm' re-confirms (still no booking) -> 'yes' books exactly one 15:00 appointment", async () => {
      const c = lane.make();
      await c.sayAll([...lane.opening, ...lane.afterService, ...lane.details]);
      const dateBefore = c.last.bookingState.date;
      await c.say("3pm or 4pm");
      await c.say("yes");
      expect(bookings(c)).toHaveLength(0);
      const t = await c.say("3pm");
      expect(t.bookingState.time).toBe("15:00");
      expect(t.bookingState.timeClarification).toBeUndefined();
      expect(t.bookingState.pendingAction).toBeDefined();
      expect(bookings(c)).toHaveLength(0); // answering the clarification is NOT a confirmation
      await c.say("yes");
      expect(bookings(c)).toHaveLength(1);
      expect(bookings(c)[0].action.payload).toMatchObject({
        name: "Trevor",
        phone: "+12428012847",
        service: "Routine cleaning",
        preferredDate: dateBefore,
        preferredTime: "15:00",
      });
    });

    it("a 'yes' bundled into the clarifying answer does not book either", async () => {
      const c = lane.make();
      await c.sayAll([...lane.opening, ...lane.afterService, ...lane.details]);
      await c.say("not 3pm");
      const t = await c.say("yes, 4pm");
      expect(t.bookingState.time).toBe("16:00");
      expect(bookings(c)).toHaveLength(0);
      await c.say("yes");
      expect(bookings(c)).toHaveLength(1);
      expect(bookings(c)[0].action.payload).toMatchObject({ preferredTime: "16:00" });
    });
  });

  describe("normal single times keep working", () => {
    it.each([
      ["Tuesday 3 pm", "15:00"],
      ["Tuesday at 2:30pm", "14:30"],
    ])("%j -> %s", async (text, expected) => {
      const c = lane.make();
      await c.sayAll(lane.opening);
      const t = await c.say(text);
      expect(t.bookingState.time).toBe(expected);
      expect(t.bookingState.timeClarification).toBeUndefined();
    });
  });
});

describe("SCRIPTED LLM, adversarial: the model tries to book / re-confirm while the time is unresolved", () => {
  const grab = (c: TortureConversation) => c.turns.flatMap((t) => t.actionsTaken);
  const bookAt3 = {
    content: "All set! I have you down for Tuesday at 2:00 PM. Reply YES to confirm.",
    toolCalls: [{
      id: "evil_1",
      name: "request_appointment",
      argumentsJson: JSON.stringify({ name: "Trevor", phone: "2428012847", service: "Routine cleaning", preferredDate: "Tuesday", preferredTime: "15:00" }),
    }],
  };

  it("replies with the one-time question (never a YES prompt), books nothing, then recovers via exact time + separate yes", async () => {
    const ok = { content: "Got it.", toolCalls: [] as never[] };
    const { conversation: c } = llmConversation([ok, ok, ok, bookAt3, bookAt3, ok, ok, ok]);
    await c.sayAll(["I want a cleaning", "Tuesday 2pm", "Trevor 2428012847"]);
    expect(c.last.bookingState.time).toBe("14:00");
    const dateBefore = c.last.bookingState.date;

    for (const msg of ["3pm or 4pm", "yes"]) {
      const t = await c.say(msg);
      expect(t.reply).toMatch(/what one time/i);
      expect(t.reply).not.toMatch(/\byes\b|confirm|2:00/i);
      expect(t.bookingState.timeClarification).toBe(true);
      expect(t.bookingState.time).toBe("14:00");
      expect(t.bookingState.pendingAction).toBeUndefined();
      expect(grab(c)).toHaveLength(0); // zero booking attempts reached the agent
    }

    const t = await c.say("3pm");
    expect(t.bookingState.time).toBe("15:00");
    expect(t.bookingState.timeClarification).toBeUndefined();
    expect(t.reply).toMatch(/3:00 PM/i);
    expect(bookings(c)).toHaveLength(0);

    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
    expect(bookings(c)[0].action.payload).toMatchObject({ name: "Trevor", preferredDate: dateBefore, preferredTime: "15:00" });
  });
});
