import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devConversation, llmConversation, type TortureConversation } from "../torture/helpers";
import { extractNameContrast } from "../../src/ai/correction-language";

/**
 * R21 / R22 (live run 2, REPLACEMENT-27): explicit corrections of a NAME ("It's Alisha, not Alicia") and of the
 * PHONE ("wrong number, it's …") must replace the old details BEFORE booking, and must require a fresh confirmation.
 * Lanes: FALLBACK provider and SCRIPTED-LLM pre-extraction (LLMProvider with a fake model that never books itself, so
 * every asserted change is application logic); both with SIMULATED tools. Clock frozen 2026-10-09T16:00:00Z.
 */
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T16:00:00Z") }); });
afterEach(() => { vi.useRealTimers(); });

const ok = { content: "Got it.", toolCalls: [] as never[] };
const lanes: Array<[string, () => TortureConversation]> = [
  ["fallback", () => devConversation()],
  ["scripted-LLM", () => llmConversation(Array.from({ length: 14 }, () => ok)).conversation],
];
const books = (c: TortureConversation) => c.turns.flatMap((t) => t.actionsTaken).filter((a) => a.action.type === "request_appointment");
const DETAILS = ["I want a cleaning", "yes", "Tuesday 2pm"];

describe.each(lanes)("%s lane — name contrast", (_lane, mk) => {
  it.each(["It's Alisha, not Alicia", "Alisha not Alicia", "sorry, I'm Alisha, not Alicia", "it is Alisha not Alicia", "No, Alisha, not Alicia",
    "yes, Alisha not Alicia", "Yes Alisha not Alicia", "yes, it's Alisha, not Alicia", "ok, Alisha not Alicia", "yeah it is Alisha not Alicia",
    "It\u2019s Alisha, not Alicia", "It\u2019s Alisha not Alicia", "I\u2019m Alisha, not Alicia", "yes, it\u2019s Alisha, not Alicia", "It\u02bcs Alisha, not Alicia", "It`s Alisha, not Alicia"])("%j replaces the stored name", async (fix) => {
    const c = mk();
    await c.sayAll([...DETAILS, "Alicia 2425550100"]);
    expect(c.last.bookingState.name).toBe("Alicia");
    const t = await c.say(fix);
    expect(t.bookingState.name).toBe("Alisha");
    expect(t.bookingState.phone).toBe("+12425550100"); // untouched
    expect(t.bookingState.time).toBe("14:00");
    expect(books(c)).toHaveLength(0); // the correction turn itself never books
  });

  it("negative controls: a contrast against something that is NOT the stored name changes nothing", async () => {
    const c = mk();
    await c.sayAll([...DETAILS, "Alicia 2425550100"]);
    for (const msg of ["Alicia, not Alisha", "Tuesday not Wednesday", "not Alicia"]) {
      const t = await c.say(msg);
      expect(t.bookingState.name, msg).toBe("Alicia");
    }
    expect(books(c)).toHaveLength(0);
  });
});

describe.each(lanes)("%s lane — phone correction", (_lane, mk) => {
  it.each(["wrong number, it's 2428019999", "that's the wrong phone number, 2428019999", "not the right number — 242 801 9999", "wrong number: 2428019999", "wrong number, it\u2019s 2428019999", "that\u2019s the wrong number, 2428019999"])("%j replaces the stored phone", async (fix) => {
    const c = mk();
    await c.sayAll([...DETAILS, "Trevor 2428012847"]);
    expect(c.last.bookingState.phone).toBe("+12428012847");
    const t = await c.say(fix);
    expect(t.bookingState.phone).toBe("+12428019999");
    expect(t.bookingState.name).toBe("Trevor"); // a phone correction is never an identity change
    expect(t.bookingState.time).toBe("14:00");
    expect(books(c)).toHaveLength(0);
  });
});

describe("fallback lane — corrections require a FRESH confirmation, and the booking carries the corrected values", () => {
  it("R21: summary shown for Alicia → correction → asked to confirm again → yes → ONE booking as Alisha", async () => {
    const c = devConversation();
    await c.sayAll([...DETAILS, "Alicia 2425550100"]);
    expect(c.last.bookingState.pendingAction).toBe("confirm_booking"); // the first summary awaits approval
    const t = await c.say("It's Alisha, not Alicia");
    expect(books(c)).toHaveLength(0); // the earlier summary's approval window does NOT book the corrected details
    expect(t.bookingState.pendingAction).toBe("confirm_booking"); // a NEW confirmation is armed for the corrected data
    expect(t.reply).toMatch(/Reply YES/i); // the customer is asked to approve again (the existing summary lists service/date/time; it does not echo name/phone)
    await c.say("yes");
    expect(books(c)).toHaveLength(1);
    expect(books(c)[0].action.payload).toMatchObject({ name: "Alisha", phone: "+12425550100", preferredTime: "14:00" });
  });

  it("R22: summary shown with the old phone → correction → asked again → yes → ONE booking with the NEW phone", async () => {
    const c = devConversation();
    await c.sayAll([...DETAILS, "Trevor 2428012847"]);
    expect(c.last.bookingState.pendingAction).toBe("confirm_booking");
    const t = await c.say("wrong number, it's 2428019999");
    expect(books(c)).toHaveLength(0);
    expect(t.bookingState.pendingAction).toBe("confirm_booking");
    expect(t.reply).toMatch(/Reply YES/i);
    await c.say("yes");
    expect(books(c)).toHaveLength(1);
    expect(books(c)[0].action.payload).toMatchObject({ name: "Trevor", phone: "+12428019999" });
  });

  it.each([
    ["yes, Alisha not Alicia", "name"], ["yes, it's Alisha, not Alicia", "name"], ["Yes Alisha not Alicia", "name"],
    ["yes, It\u2019s Alisha, not Alicia", "name"], ["It\u2019s Alisha, not Alicia", "name"], ["ok yes, Alisha not Alicia", "name"],
  ])("BUNDLED confirmation %j: ZERO booking attempts on the correction turn, then exactly ONE booking with the corrected details after a SEPARATE yes", async (bundled) => {
    const c = devConversation();
    await c.sayAll([...DETAILS, "Alicia 2425550100"]);
    expect(c.last.bookingState.pendingAction).toBe("confirm_booking");
    const attemptsBefore = books(c).length;
    const t = await c.say(bundled);
    // 1) the bundled "yes" is NOT an approval of the corrected data
    expect(t.actionsTaken.filter((a) => a.action.type === "request_appointment")).toHaveLength(0);
    expect(books(c)).toHaveLength(attemptsBefore);
    // 2) exact stored name (never "Yes Alisha" / "It's Alisha"), a new confirmation is armed
    expect(t.bookingState.name).toBe("Alisha");
    expect(t.bookingState.pendingAction).toBe("confirm_booking");
    // 3) a separate confirmation books exactly once, with the exact corrected payload
    await c.say("yes");
    expect(books(c)).toHaveLength(1);
    expect(books(c)[0].action.payload).toMatchObject({ name: "Alisha", phone: "+12425550100", preferredTime: "14:00", service: "Routine cleaning" });
    expect((books(c)[0].action.payload as { name: string }).name).toBe("Alisha"); // exact, not merely "contains"
    await c.say("yes"); // a repeated yes cannot add a second booking
    expect(books(c)).toHaveLength(1);
  });

  it.each(["It\u2019s Alisha, not Alicia", "yes, Alisha not Alicia"])("%j then a separate yes: the booking payload name is EXACTLY Alisha (the two reproduced Codex cases)", async (fix) => {
    const c = devConversation();
    await c.sayAll([...DETAILS, "Alicia 2425550100", fix, "yes"]);
    expect(books(c)).toHaveLength(1);
    expect((books(c)[0].action.payload as { name: string }).name).toBe("Alisha");
  });

  it("an unrelated 'no' after the correction still declines cleanly (no booking)", async () => {
    const c = devConversation();
    await c.sayAll([...DETAILS, "Alicia 2425550100", "It's Alisha, not Alicia", "no"]);
    expect(books(c)).toHaveLength(0);
  });
});

describe("scripted-LLM lane — ZERO booking attempts on the correction turn, then exactly ONE booking with the corrected details after a SEPARATE confirmation", () => {
  const CASES_LLM: Array<[string, string, string, { name: string; phone: string }]> = [
    ["name", "It's Alisha, not Alicia", "Alicia 2425550100", { name: "Alisha", phone: "+12425550100" }],
    ["name (bundled yes)", "yes, Alisha not Alicia", "Alicia 2425550100", { name: "Alisha", phone: "+12425550100" }],
    ["name (bundled yes + it's)", "yes, it's Alisha, not Alicia", "Alicia 2425550100", { name: "Alisha", phone: "+12425550100" }],
    ["name (curly apostrophe)", "It\u2019s Alisha, not Alicia", "Alicia 2425550100", { name: "Alisha", phone: "+12425550100" }],
    ["name (curly + bundled yes)", "yes, It\u2019s Alisha, not Alicia", "Alicia 2425550100", { name: "Alisha", phone: "+12425550100" }],
    ["phone", "wrong number, it's 2428019999", "Trevor 2428012847", { name: "Trevor", phone: "+12428019999" }],
    ["phone (curly apostrophe)", "wrong number, it\u2019s 2428019999", "Trevor 2428012847", { name: "Trevor", phone: "+12428019999" }],
    ["phone (bundled yes)", "yes, wrong number, it's 2428019999", "Trevor 2428012847", { name: "Trevor", phone: "+12428019999" }],
  ];
  it.each(CASES_LLM)("%s: %j", async (_n, fix, ident, want) => {
    const { conversation: c } = llmConversation(Array.from({ length: 14 }, () => ok));
    await c.sayAll([...DETAILS, ident]);
    const t = await c.say(fix);
    expect(t.actionsTaken.filter((a) => a.action.type === "request_appointment")).toHaveLength(0); // the correction turn never books
    expect(books(c)).toHaveLength(0);
    expect(t.bookingState.name).toBe(want.name); // exact stored values
    expect(t.bookingState.phone).toBe(want.phone);
    await c.say("yes"); // a SEPARATE confirmation
    expect(books(c)).toHaveLength(1);
    const payload = books(c)[0].action.payload as { name: string; phone: string; preferredTime: string };
    expect(payload.name).toBe(want.name); // exact, never "Yes Alisha" / "It's Alisha"
    expect(payload.phone).toBe(want.phone);
    expect(payload.preferredTime).toBe("14:00");
    await c.say("yes"); // repeating it cannot add a second booking
    expect(books(c)).toHaveLength(1);
  });
});

describe("extractNameContrast (pure)", () => {
  it.each([
    ["It's Alisha, not Alicia", "Alicia", "Alisha"], ["Alisha not Alicia", "Alicia", "Alisha"], ["sorry, I'm Mary Jane, not Mary", "Mary", "Mary Jane"],
    ["Alicia, not Alisha", "Alicia", null], ["Tuesday not Wednesday", "Alicia", null], ["not Alicia", "Alicia", null], ["Alicia not Alicia", "Alicia", null],
    ["yes, Alisha not Alicia", "Alicia", "Alisha"], ["Yes Alisha not Alicia", "Alicia", "Alisha"], ["ok yes, it's Alisha, not Alicia", "Alicia", "Alisha"],
    ["It\u2019s Alisha, not Alicia", "Alicia", "Alisha"], ["It\u02bcs Alisha, not Alicia", "Alicia", "Alisha"], ["yes, it\u2019s Alisha, not Alicia", "Alicia", "Alisha"],
    ["It\u2019s O'Neil, not O\u2019Neill", "O'Neill", "O'neil"], ["It's Alisha, not O'Neil", "O\u2019Neil", "Alisha"], ["It\u2019s Alisha, not O\u2019Neil", "O'Neil", "Alisha"],
    ["yes, not Alicia", "Alicia", null], ["yes not Alicia", "Alicia", null],
    ["It's Alisha, not Alicia", undefined, null], ["It's Alisha, not Alicia", "", null],
  ])("%j (on file %j) -> %j", (msg, cur, want) => expect(extractNameContrast(msg, cur)).toBe(want));
});
