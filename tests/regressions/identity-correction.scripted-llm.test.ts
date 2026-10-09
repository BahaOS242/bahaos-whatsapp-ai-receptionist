import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { llmConversation } from "../torture/helpers";

/**
 * LANE: SCRIPTED LLM client (LLMProvider with a fake model) + SIMULATED tools.
 * This exercises the application's deterministic PRE-EXTRACTION and state
 * derivation that run before the model (message-field-extraction.ts). It says
 * NOTHING about Anthropic's language understanding — the fake model just
 * answers "Got it." with no tool calls, so every asserted field comes from
 * application code. Clock frozen at 2026-10-09T16:00:00Z (Fri noon, Nassau).
 */
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T16:00:00Z") }); });
afterEach(() => { vi.useRealTimers(); });

const ok = { content: "Got it.", toolCalls: [] as never[] };
const say = () => llmConversation(Array.from({ length: 12 }, () => ok));

describe("shared LLM pre-extraction: a time correction is never a customer name", () => {
  it.each(["actually 3pm", "no, 3pm instead", "make it 3pm", "change it to 3pm please"])("%j", async (fix) => {
    const { conversation: c } = say();
    await c.sayAll(["I want a cleaning", "Tuesday 2pm"]);
    expect(c.last.bookingState.time).toBe("14:00");
    const t = await c.say(fix);
    expect(t.bookingState.time).toBe("15:00");
    expect(t.bookingState.name).toBeUndefined();
    expect(c.turns.flatMap((x) => x.actionsTaken).filter((a) => a.action.type === "request_appointment")).toHaveLength(0);
  });

  it("then a real name + phone is captured as identity", async () => {
    const { conversation: c } = say();
    await c.sayAll(["I want a cleaning", "Tuesday 2pm", "actually 3pm", "Trevor 2428012847"]);
    expect(c.last.bookingState.name).toBe("Trevor");
    expect(c.last.bookingState.phone).toBe("+12428012847");
    expect(c.last.bookingState.time).toBe("15:00");
  });

  it("explicit 'My name is Alisha, not Alicia' replaces an earlier name", async () => {
    const { conversation: c } = say();
    await c.sayAll(["I want a cleaning", "Tuesday 2pm", "Alicia 2425550100"]);
    expect(c.last.bookingState.name).toBe("Alicia");
    await c.say("My name is Alisha, not Alicia");
    expect(c.last.bookingState.name).toBe("Alisha");
  });
});

