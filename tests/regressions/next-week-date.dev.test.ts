import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devConversation, type TortureConversation } from "../torture/helpers";

/**
 * Regression corpus for TEST_FINDINGS.md (PR #1): the discarded "next week" qualifier.
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

describe("'next week <weekday>' keeps its qualifier", () => {
  it("full conversation: next week Friday at 2pm -> 2026-10-16 14:00", async () => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "next week Friday at 2pm", "Trevor 2428012847"]);
    expect(c.last.bookingState.date).toBe("2026-10-16");
    expect(c.last.bookingState.time).toBe("14:00");
    expect(c.last.bookingState.name).toBe("Trevor");
    expect(requests(c)).toHaveLength(0);
    await c.say("yes");
    expect(requests(c)).toHaveLength(1);
    expect(requests(c)[0].action.payload).toMatchObject({ name: "Trevor", preferredDate: "2026-10-16", preferredTime: "14:00" });
  });

  it("the text before the time never becomes a name", async () => {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "next week Friday at 2pm"]);
    expect(c.last.bookingState.name).toBeUndefined();
  });
});
