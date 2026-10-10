import { describe, expect, it } from "vitest";
import { allScenarios } from "../../scripts/eval/scenarios/index";
import { runCorpus } from "../../scripts/eval/runner";
import { evaluateScenario } from "../../scripts/eval/evaluator";
import { buildScorecard, formatReport } from "../../scripts/eval/report";

/**
 * Runs the REAL Phase 1 scenario corpus against the REAL
 * DevRuleBasedAIProvider stack — not toy fixtures — and checks:
 *   1. the harness's own structural correctness (every scenario produces
 *      a well-formed evaluation, the scorecard totals reconcile);
 *   2. today's KNOWN baseline, established and reported in this
 *      milestone. This is a diagnostic baseline, not a behavior pin —
 *      per this milestone's explicit instruction, none of the 3 known
 *      failures below are fixed here. When a later milestone fixes one,
 *      update this baseline (and celebrate) rather than treating a drop
 *      in failures as something to "fix" back.
 *
 * This is intentionally NOT a hard requirement that every scenario pass
 * — that would defeat the purpose of a measurement system. It IS a hard
 * requirement that the numbers stay reproducible run to run.
 */
describe("Evaluation corpus — structural correctness", () => {
  it("every scenario has a unique ID", () => {
    const ids = allScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("runs the full corpus and produces one evaluation per scenario, with a reconciling scorecard", async () => {
    const transcripts = await runCorpus(allScenarios);
    expect(transcripts).toHaveLength(allScenarios.length);

    const evaluations = allScenarios.map((scenario, i) =>
      evaluateScenario(scenario, transcripts[i]),
    );
    const scorecard = buildScorecard(evaluations);

    expect(scorecard.totalScenarios).toBe(allScenarios.length);
    expect(scorecard.passedScenarios + scorecard.failedScenarios).toBe(scorecard.totalScenarios);
    expect(scorecard.failures).toHaveLength(scorecard.failedScenarios);

    const categoryTotal = Object.values(scorecard.byCategory).reduce(
      (sum, stats) => sum + (stats?.total ?? 0),
      0,
    );
    expect(categoryTotal).toBe(scorecard.totalScenarios);
  });

  it("the formatted report is well-formed Markdown for the real corpus", async () => {
    const transcripts = await runCorpus(allScenarios);
    const evaluations = allScenarios.map((scenario, i) =>
      evaluateScenario(scenario, transcripts[i]),
    );
    const report = formatReport(buildScorecard(evaluations));

    expect(report).toContain("# Conversation Evaluation Report");
    expect(report).toContain(`Total scenarios: ${allScenarios.length}`);
  });
});

describe("Evaluation corpus — known Phase 1 baseline (reproducibility, not a behavior pin)", () => {
  it("reproduces the exact same pass/fail outcome for every scenario on every run", async () => {
    const runOnce = async () => {
      const transcripts = await runCorpus(allScenarios);
      return allScenarios.map(
        (scenario, i) => evaluateScenario(scenario, transcripts[i]).overallPassed,
      );
    };

    const first = await runOnce();
    const second = await runOnce();

    expect(second).toEqual(first);
  });

  it("today's known baseline: all 38 scenarios pass (NL-01 fixed by typo tolerance)", async () => {
    const transcripts = await runCorpus(allScenarios);
    const evaluations = allScenarios.map((scenario, i) =>
      evaluateScenario(scenario, transcripts[i]),
    );
    const scorecard = buildScorecard(evaluations);

    const failingIds = scorecard.failures.map((f) => f.scenarioId).sort();

    // (historical note) RECOVER-02 / RECOVER-03: a date/time correction message's leftover
    // text gets wrongly captured as the customer's name when name
    // happens to be the currently-asked field ("actually make it
    // Wednesday instead" -> name becomes "Actually Make It Instead").
    // NL-01: no fuzzy/typo tolerance in service-name or weekday matching.
    // RECOVER-02 / RECOVER-03 were FIXED by the identity-provenance change (a date/time
    // correction is never an identity answer; see tests/regressions/). They previously
    // failed for exactly the reason described above, so the pin moves from 35/38 to 37/38.
    // NL-01 was FIXED by src/ai/lexicon-repair.ts (typo tolerance for the key booking words), so the pin moves
    // from 37/38 to 38/38.
    expect(failingIds).toEqual([]);
    expect(scorecard.totalScenarios).toBe(38);
    expect(scorecard.passedScenarios).toBe(38);
  });
});
