import { afterEach, describe, expect, it } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { CASES, restoreClock, runCase } from "../../scripts/live-eval/harness";
import { REPLACEMENT_27, REPLACEMENT_27_LABEL } from "../../scripts/live-eval/replacement27";

afterEach(() => restoreClock());

describe("REPLACEMENT-27 is clearly a replacement and well formed", () => {
  it("27 unique cases, ids R01..R27, label says it is NOT the original and the 14/27 is not rerun", () => {
    expect(REPLACEMENT_27).toHaveLength(27);
    expect(new Set(REPLACEMENT_27.map((c) => c.id)).size).toBe(27);
    REPLACEMENT_27.forEach((c, i) => expect(c.id.startsWith(`R${String(i + 1).padStart(2, "0")} `)).toBe(true));
    expect(REPLACEMENT_27_LABEL).toMatch(/REPLACEMENT-27/);
    expect(REPLACEMENT_27_LABEL).toMatch(/not the original/);
    expect(REPLACEMENT_27_LABEL).toMatch(/14\/27/);
    expect(REPLACEMENT_27_LABEL).toMatch(/not rerun/);
  });
  it("covers the proposed category mix (5+3+3+4+2+2+4+4)", () => {
    const n = (re: RegExp) => REPLACEMENT_27.filter((c) => re.test(c.id)).length;
    expect(n(/^R0[1-5] /)).toBe(5);
    expect(n(/^R0[6-8] /)).toBe(3);
    expect(n(/^R(09|10|11) /)).toBe(3);
    expect(n(/^R1[2-5] /)).toBe(4);
    expect(n(/^R1[67] /)).toBe(2);
    expect(n(/^R(18|19) /)).toBe(2);
    expect(n(/^R2[0-3] /)).toBe(4);
    expect(n(/^R2[4-7] /)).toBe(4);
  });
  it("every case has a booking expectation and an explicit approval list (the safety guard applies to all)", () => {
    for (const c of REPLACEMENT_27) {
      expect(c.expectBookings).toBeDefined();
      expect(Array.isArray(c.approvals)).toBe(true);
      if (c.expectBookings === 0) expect(c.approvals).toEqual([]);
    }
  });
});

// A free, deterministic smoke of BOTH sets on the FALLBACK provider: proves the oracles run end to end.
// It asserts SAFETY only (no booking before approval, no wrong payload). Missing bookings are findings
// (e.g. NL-01 typos), reported by the live run, not asserted here.
describe("both sets run end to end on the fallback provider (no network) with no safety violations", () => {
  const agent = () => new ReceptionistAgent(new DevRuleBasedAIProvider(), createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE));
  // KNOWN fallback-provider gap (an open FINDING, not a regression): "It's Alisha, not Alicia" with no "my name is"
  // does not replace the earlier name, so the fallback would book "Alicia". The test pins that it IS still a hard
  // failure so it flips loudly when someone fixes it. The live-model run reports its own result for this case.
  const KNOWN_FALLBACK_GAPS = new Set(["R21 'It's Alisha, not Alicia'"]);
  for (const c of [...CASES, ...REPLACEMENT_27]) {
    it(c.id, async () => {
      const r = await runCase(c, 1, agent(), () => null);
      if (KNOWN_FALLBACK_GAPS.has(c.id)) expect(r.hard.length, "known gap appears fixed — remove it from KNOWN_FALLBACK_GAPS").toBeGreaterThan(0);
      else expect(r.hard, JSON.stringify(r.steps.map((s) => [s.in, s.state]))).toEqual([]);
    });
  }
});
