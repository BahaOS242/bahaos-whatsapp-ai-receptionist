import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devConversation, type TortureConversation } from "../torture/helpers";

/**
 * Regression corpus for TEST_FINDINGS.md (PR #1): identity corruption by a
 * time correction.
 *
 * LANE: deterministic FALLBACK provider (DevRuleBasedAIProvider) + SIMULATED
 * tools. Not a live-LLM evaluation, not durable persistence. Business clock
 * frozen at 2026-10-09T16:00:00Z (noon in Nassau, a Friday).
 */
const NOW = new Date("2026-10-09T16:00:00Z");
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: NOW }); });
afterEach(() => { vi.useRealTimers(); });

const requests = (c: TortureConversation) =>
  c.turns.flatMap((t) => t.actionsTaken).filter((a) => a.action.type === "request_appointment");

describe("a time correction is never a customer name", () => {
  it("reported transcript: actually 3pm -> Trevor + phone -> yes", async () => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "Tuesday 2pm"]);
    const correction = await c.say("actually 3pm");
    expect(correction.bookingState.time).toBe("15:00");
    expect(correction.bookingState.name).toBeUndefined();
    expect(requests(c)).toHaveLength(0);
    await c.say("Trevor 2428012847");
    expect(c.last.bookingState.name).toBe("Trevor");
    expect(c.last.bookingState.phone).toBe("+12428012847");
    expect(requests(c)).toHaveLength(0); // nothing booked before explicit confirmation
    await c.say("yes");
    expect(requests(c)).toHaveLength(1);
    expect(requests(c)[0].action.payload).toMatchObject({ name: "Trevor", preferredTime: "15:00", service: "Routine cleaning" });
  });

  it("variant: 'nah make it 3pm instead' then 'Alicia 2425550100'", async () => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "Tuesday 2pm"]);
    const t = await c.say("nah make it 3pm instead");
    expect(t.bookingState.time).toBe("15:00");
    expect(t.bookingState.name).toBeUndefined();
    await c.say("Alicia 2425550100");
    expect(c.last.bookingState.name).toBe("Alicia");
    await c.say("yes");
    expect(requests(c)).toHaveLength(1);
    expect(requests(c)[0].action.payload).toMatchObject({ name: "Alicia", preferredTime: "15:00" });
  });

  it.each(["actually 3pm", "no, 3pm instead", "sorry make it 3pm", "change it to 3pm please", "hmm let's do 3pm"])("correction wording %j yields no name", async (fix) => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "Tuesday 2pm"]);
    const t = await c.say(fix);
    expect(t.bookingState.time).toBe("15:00");
    expect(t.bookingState.name).toBeUndefined();
  });

  it("phone supplied before the name, after a correction", async () => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "Tuesday 2pm", "actually 3pm", "2428012847"]);
    expect(c.last.bookingState.name).toBeUndefined();
    await c.say("Trevor");
    expect(c.last.bookingState.name).toBe("Trevor");
    await c.say("yes");
    expect(requests(c)).toHaveLength(1);
    expect(requests(c)[0].action.payload).toMatchObject({ name: "Trevor", preferredTime: "15:00" });
  });

  it("an already-known name survives a time correction", async () => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "Trevor 2428012847 Tuesday 2pm"]);
    expect(c.last.bookingState.name).toBe("Trevor");
    await c.say("actually 3pm");
    expect(c.last.bookingState.name).toBe("Trevor");
    expect(c.last.bookingState.time).toBe("15:00");
  });

  it("an explicit name replacement is honoured: 'My name is Alisha, not Alicia'", async () => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "Tuesday 2pm", "Alicia 2425550100"]);
    expect(c.last.bookingState.name).toBe("Alicia");
    await c.say("My name is Alisha, not Alicia");
    expect(c.last.bookingState.name).toBe("Alisha");
    await c.say("yes");
    expect(requests(c)).toHaveLength(1);
    expect(requests(c)[0].action.payload).toMatchObject({ name: "Alisha" });
  });

  it("a material correction after the summary invalidates the earlier confirmation (no booking until re-confirmed)", async () => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "Tuesday 2pm", "Trevor 2428012847"]);
    await c.say("actually 3pm");
    expect(requests(c)).toHaveLength(0);
    expect(c.last.bookingState.name).toBe("Trevor");
    expect(c.last.bookingState.time).toBe("15:00");
    await c.say("yes");
    expect(requests(c)).toHaveLength(1);
    expect(requests(c)[0].action.payload).toMatchObject({ name: "Trevor", preferredTime: "15:00" });
  });
});

