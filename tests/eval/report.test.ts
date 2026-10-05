import { describe, expect, it } from "vitest";
import { buildScorecard, formatReport } from "../../scripts/eval/report";
import type { ScenarioEvaluation } from "../../scripts/eval/types";

function evaluation(overrides: Partial<ScenarioEvaluation> = {}): ScenarioEvaluation {
  return {
    scenario: {
      id: "S1",
      category: "booking",
      description: "desc",
      turns: [],
      expected: { outcome: "unresolved" },
    },
    transcript: {
      scenarioId: "S1",
      turns: [],
      finalState: {},
      allActions: [],
      finalHandoffActive: false,
    },
    dimensions: [
      { dimension: "intent", applicable: true, passed: true, details: [] },
      { dimension: "resolution", applicable: true, passed: true, details: [] },
    ],
    actualOutcome: "unresolved",
    overallPassed: true,
    ...overrides,
  };
}

describe("buildScorecard", () => {
  it("counts totals, category breakdown, and dimension breakdown correctly", () => {
    const evaluations = [
      evaluation({ scenario: { ...evaluation().scenario, id: "A", category: "booking" } }),
      evaluation({
        scenario: { ...evaluation().scenario, id: "B", category: "faq" },
        overallPassed: false,
        dimensions: [
          { dimension: "intent", applicable: true, passed: false, details: ["boom"] },
          { dimension: "resolution", applicable: true, passed: true, details: [] },
        ],
      }),
    ];

    const scorecard = buildScorecard(evaluations);

    expect(scorecard.totalScenarios).toBe(2);
    expect(scorecard.passedScenarios).toBe(1);
    expect(scorecard.failedScenarios).toBe(1);
    expect(scorecard.byCategory.booking).toEqual({ total: 1, passed: 1 });
    expect(scorecard.byCategory.faq).toEqual({ total: 1, passed: 0 });
    expect(scorecard.byDimension.intent).toEqual({ applicable: 2, passed: 1 });
    expect(scorecard.failures).toHaveLength(1);
    expect(scorecard.failures[0]).toMatchObject({ scenarioId: "B", category: "faq" });
    expect(scorecard.failures[0].failedDimensions).toEqual([
      { dimension: "intent", details: ["boom"] },
    ]);
  });

  it("excludes inapplicable dimensions from the dimension breakdown entirely", () => {
    const evaluations = [
      evaluation({
        dimensions: [{ dimension: "escalation", applicable: false, passed: true, details: [] }],
      }),
    ];
    const scorecard = buildScorecard(evaluations);
    expect(scorecard.byDimension.escalation).toEqual({ applicable: 0, passed: 0 });
  });
});

describe("formatReport", () => {
  it("renders a well-formed Markdown report including a failure's details", () => {
    const scorecard = buildScorecard([
      evaluation({
        overallPassed: false,
        scenario: { ...evaluation().scenario, id: "X1", description: "does the thing" },
        dimensions: [
          {
            dimension: "business_rules",
            applicable: true,
            passed: false,
            details: ["out-of-hours booking succeeded"],
          },
        ],
      }),
    ]);

    const report = formatReport(scorecard);

    expect(report).toContain("# Conversation Evaluation Report");
    expect(report).toContain("Total scenarios: 1");
    expect(report).toContain("Failed: 1");
    expect(report).toContain("X1 — does the thing");
    expect(report).toContain("out-of-hours booking succeeded");
  });

  it('renders "None." under Failures when nothing failed', () => {
    const scorecard = buildScorecard([evaluation()]);
    const report = formatReport(scorecard);
    expect(report).toMatch(/## Failures\n\nNone\./);
  });
});
