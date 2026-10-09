import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devConversation, llmConversation, type TortureConversation } from "../torture/helpers";

/**
 * Codex review of PR #2, finding 1: "My name is Alisha not Alicia" stored/booked "Alisha Not".
 * The name boundary must not depend on comma punctuation. Lanes: FALLBACK provider and
 * SCRIPTED-LLM pre-extraction, both with SIMULATED tools; clock frozen 2026-10-09T16:00:00Z.
 */
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T16:00:00Z") }); });
afterEach(() => { vi.useRealTimers(); });
const requests = (c: TortureConversation) => c.turns.flatMap((t) => t.actionsTaken).filter((a) => a.action.type === "request_appointment");
const ok = { content: "Got it.", toolCalls: [] as never[] };

describe.each([
  ["My name is Alisha not Alicia", "Alisha"],
  ["My name is Alisha, not Alicia", "Alisha"],
  ["my name is alisha not alicia", "Alisha"],
  ["My name is Alisha no Alicia", "Alisha"],
  ["My name is Alisha and not Alicia", "Alisha"],
  ["My name is Alisha instead of Alicia", "Alisha"],
  ["My name is Sarah and I want a cleaning", "Sarah"],
  ["My name is Mary Jane", "Mary Jane"],
  ["my name is actually Trevon", "Trevon"],
  ["My name is actually Alisha not Alicia", "Alisha"],
])("introduction %j", (message, expected) => {
  it("fallback: stored name is exact, and the booked payload carries it", async () => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "Tuesday 2pm", "Alicia 2425550100"]);
    await c.say(message);
    expect(c.last.bookingState.name).toBe(expected);
    await c.say("yes");
    expect(requests(c)).toHaveLength(1);
    expect(requests(c)[0].action.payload).toMatchObject({ name: expected });
  });
  it("scripted LLM pre-extraction: stored name is exact", async () => {
    const { conversation: c } = llmConversation(Array.from({ length: 10 }, () => ok));
    await c.sayAll(["I want a cleaning", "Tuesday 2pm", "Alicia 2425550100"]);
    await c.say(message);
    expect(c.last.bookingState.name).toBe(expected);
  });
});

it("first introduction (no prior name) is also exact", async () => {
  const c = devConversation();
  await c.sayAll(["I want a cleaning", "yes", "Tuesday 2pm", "My name is Alisha not Alicia", "2425550100"]);
  expect(c.last.bookingState.name).toBe("Alisha");
  await c.say("yes");
  expect(requests(c)[0].action.payload).toMatchObject({ name: "Alisha", phone: "+12425550100" });
});
