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

describe("shared LLM pre-extraction: 'next week Friday' keeps its qualifier", () => {
  it("resolves to 2026-10-16 and the leftover never becomes a name", async () => {
    const { conversation: c } = say();
    await c.sayAll(["I want a cleaning", "next week Friday at 2pm"]);
    expect(c.last.bookingState.date).toBe("2026-10-16");
    expect(c.last.bookingState.time).toBe("14:00");
    expect(c.last.bookingState.name).toBeUndefined();
  });
});
