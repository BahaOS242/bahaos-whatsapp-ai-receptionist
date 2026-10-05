import { describe, expect, it } from "vitest";
import { devConversation } from "./helpers";
import type { BookingState } from "../../src/ai/types";

/**
 * CATEGORY K — Bahamian English / slang / texting (10 scenarios: 51–60,
 * plus 2 mixed subcases kept for ROOT CAUSE #5 coverage — see below)
 *
 * This category is a coverage multiplier on the other root causes, not a
 * new mechanism of its own — most of what used to fail here failed via
 * the SAME regexes already fixed elsewhere (escalation phrase coverage,
 * emergency phrase coverage, bare-name fallback), just triggered by local
 * phrasing instead of standard English:
 *
 * FIXED (ROOT CAUSE #3): #57/#58 — ESCALATE_RE now covers "lemme talk to
 * somebody" / "send me by somebody".
 * FIXED (ROOT CAUSE #4): #59 — EMERGENCY_RE now covers "tooth killing me".
 * FIXED (ROOT CAUSE #7): #53 — price questions now answer using
 * conversation context (answerPriceInquiry).
 * FIXED (ROOT CAUSE #8): #55 — resolveDateWord now recognizes "tmrw".
 * FIXED (ROOT CAUSE #5): the two mixed subcases below — the
 * confirmation handler now passes the real message through, and a
 * "no + correction" is no longer read as a flat decline.
 *
 * #60 (compound conditional) is intentionally NOT fixed — see its own
 * test for why.
 */
describe("CATEGORY K — Bahamian English / slang / texting", () => {
  const CLEANING_OFFERED: BookingState = {
    intent: "book_appointment",
    service: "Routine cleaning",
    pendingAction: "confirm_service",
  };
  const CLEANING_IN_FLOW: BookingState = {
    intent: "book_appointment",
    service: "Routine cleaning",
  };

  it('51. "yinna open tomorrow?" is answered as an hours inquiry', async () => {
    const convo = devConversation();
    const result = await convo.say("yinna open tomorrow?");

    expect(result.reply).toMatch(/9:00 AM|Monday.Friday/i);
    expect(result.bookingState.intent).toBeUndefined();
  });

  it('52. "I wanna book me a cleaning" is understood as booking intent + cleaning', async () => {
    const convo = devConversation();
    const result = await convo.say("I wanna book me a cleaning");

    expect(result.bookingState.intent).toBe("book_appointment");
    expect(result.bookingState.service).toBe("Routine cleaning");
  });

  it('53. FIXED: "how much that one?" while a service is on offer now answers using the conversation\'s own context', async () => {
    const convo = devConversation(
      {},
      {
        intent: "book_appointment",
        service: "Root canal",
        pendingAction: "confirm_service",
      },
    );
    const result = await convo.say("how much that one?");

    // Answers using the Root canal already under discussion (B$950).
    expect(result.reply).toMatch(/B\$950/);
  });

  it('54. "book me" alone is understood as booking intent', async () => {
    const convo = devConversation();
    const result = await convo.say("book me");

    expect(result.bookingState.intent).toBe("book_appointment");
  });

  it('55. FIXED: "tmrw 9" is now understood as tomorrow + hour 9 (missing am/pm)', async () => {
    const convo = devConversation({}, CLEANING_IN_FLOW);
    const result = await convo.say("tmrw 9");

    // Date resolves to tomorrow; time stays pending on am/pm (the bare
    // hour "9" is remembered — see partial-input.test.ts #8/#9).
    expect(result.bookingState.date).toBeDefined();
    expect(result.bookingState.time).toBeUndefined();
    expect(result.bookingState.pendingBareTime).toBe("9:0");
  });

  it('56. "mon 2pm" IS understood as Monday + 14:00 — one Bahamian-shorthand case that already works', async () => {
    const convo = devConversation({}, CLEANING_IN_FLOW);
    const result = await convo.say("mon 2pm");

    expect(result.bookingState.date).toBe("Monday");
    expect(result.bookingState.time).toBe("14:00");
  });

  it('57. FIXED: "lemme talk to somebody" now escalates', async () => {
    const convo = devConversation();
    const result = await convo.say("lemme talk to somebody");

    expect(result.escalated).toBe(true);
  });

  it('58. FIXED: "send me by somebody" now escalates', async () => {
    const convo = devConversation();
    const result = await convo.say("send me by somebody");

    expect(result.escalated).toBe(true);
  });

  it('59. FIXED: "my tooth killing me bad bad" is now recognized as a dental emergency', async () => {
    const convo = devConversation();
    const result = await convo.say("my tooth killing me bad bad");

    expect(result.escalated).toBe(true);
  });

  it('60. INTENTIONALLY UNSUPPORTED: "yinna open Sat? If not book me Monday" — a compound conditional across two clauses, which the deterministic provider deliberately does NOT try to parse. It fails safely: asks for clarification instead of guessing, and touches no state.', async () => {
    const convo = devConversation();
    const result = await convo.say("yinna open Sat? If not book me Monday");

    // Per the task's explicit direction: do not grow the regex surface to
    // parse compound/conditional language (that's LLMProvider's job in
    // production). Fail safely — ask for clarification — rather than
    // silently mis-booking. This is the one torture-suite scenario that
    // is EXPECTED to remain "not fully handled," by design.
    expect(result.reply).toMatch(/two separate messages|clarify|make sure I get that/i);
    expect(result.reply).not.toMatch(/Saturday/); // never answers using a guess
    expect(result.bookingState).toEqual({}); // and never silently books anything
  });

  // Two mixed subcases are kept as the suite's ONLY evidence for ROOT
  // CAUSE #5 (the service-confirmation handler discards the rest of the
  // message) — every other mixed subcase tried during the original
  // 77-scenario run (e.g. "im tryna book", "wha time", "u open?", "cud i
  // get 2pm", "yinna got anything tmrw?", "my tooth hurting bad ... ASAP")
  // was cut here as redundant: each reproduced a root cause (#2, #3, #4,
  // #8) already proven, standalone, by another scenario in this file or
  // elsewhere in the suite — see the reduction note in README.md.
  describe("mixed Bahamian/texting subcases", () => {
    it('"yeah man, 2pm good" — FIXED (ROOT CAUSE #5): confirms the booking AND applies the "2pm" said in the same breath', async () => {
      const convo = devConversation();
      await convo.say("Routine cleaning");
      const result = await convo.say("yeah man, 2pm good");

      expect(result.bookingState.pendingAction).toBeUndefined();
      expect(result.bookingState.service).toBe("Routine cleaning");
      // "2pm" carries through since it was said in the same confirming
      // message — the confirmation handler now passes the real message
      // through instead of discarding it.
      expect(result.bookingState.time).toBe("14:00");
    });

    it('"nah, lemme change that to 3" in response to a service offer — FIXED (ROOT CAUSE #5): recognized as wanting a different time, not a flat decline', async () => {
      const convo = devConversation({}, CLEANING_OFFERED);
      const result = await convo.say("nah, lemme change that to 3");

      expect(result.bookingState.intent).toBe("book_appointment");
      expect(result.reply).not.toMatch(/no problem/i);
    });
  });
});
