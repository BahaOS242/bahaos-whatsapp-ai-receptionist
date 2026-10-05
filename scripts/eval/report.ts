import type {
  EvalCategory,
  EvalDimension,
  FailureRecord,
  ScenarioEvaluation,
  Scorecard,
} from "./types";

/** Aggregates a list of per-scenario evaluations into a Scorecard —
 * pure, deterministic, no I/O. */
export function buildScorecard(evaluations: ScenarioEvaluation[]): Scorecard {
  const byCategory: Scorecard["byCategory"] = {};
  const byDimension: Scorecard["byDimension"] = {};
  const failures: FailureRecord[] = [];

  for (const evaluation of evaluations) {
    const category: EvalCategory = evaluation.scenario.category;
    const categoryStats = (byCategory[category] ??= { total: 0, passed: 0 });
    categoryStats.total++;
    if (evaluation.overallPassed) categoryStats.passed++;

    for (const dim of evaluation.dimensions) {
      const dimStats = (byDimension[dim.dimension] ??= { applicable: 0, passed: 0 });
      if (dim.applicable) {
        dimStats.applicable++;
        if (dim.passed) dimStats.passed++;
      }
    }

    if (!evaluation.overallPassed) {
      failures.push({
        scenarioId: evaluation.scenario.id,
        category,
        description: evaluation.scenario.description,
        failedDimensions: evaluation.dimensions
          .filter((d) => d.applicable && !d.passed)
          .map((d) => ({ dimension: d.dimension as EvalDimension, details: d.details })),
      });
    }
  }

  return {
    totalScenarios: evaluations.length,
    passedScenarios: evaluations.filter((e) => e.overallPassed).length,
    failedScenarios: evaluations.filter((e) => !e.overallPassed).length,
    byCategory,
    byDimension,
    failures,
  };
}

function pct(passed: number, total: number): string {
  if (total === 0) return "n/a";
  return `${((passed / total) * 100).toFixed(1)}%`;
}

/** Renders a Scorecard as a human-readable Markdown report. */
export function formatReport(scorecard: Scorecard): string {
  const lines: string[] = [];

  lines.push("# Conversation Evaluation Report");
  lines.push("");
  lines.push(`- Total scenarios: ${scorecard.totalScenarios}`);
  lines.push(`- Passed: ${scorecard.passedScenarios}`);
  lines.push(`- Failed: ${scorecard.failedScenarios}`);
  lines.push(`- Pass rate: ${pct(scorecard.passedScenarios, scorecard.totalScenarios)}`);
  lines.push("");

  lines.push("## By category");
  lines.push("");
  for (const [category, stats] of Object.entries(scorecard.byCategory)) {
    if (!stats) continue;
    lines.push(`- ${category}: ${stats.passed}/${stats.total} (${pct(stats.passed, stats.total)})`);
  }
  lines.push("");

  lines.push("## By dimension");
  lines.push("");
  for (const [dimension, stats] of Object.entries(scorecard.byDimension)) {
    if (!stats) continue;
    lines.push(
      `- ${dimension}: ${stats.passed}/${stats.applicable} (${pct(stats.passed, stats.applicable)}, applicable scenarios only)`,
    );
  }
  lines.push("");

  if (scorecard.failures.length > 0) {
    lines.push("## Failures");
    lines.push("");
    for (const failure of scorecard.failures) {
      lines.push(`### ${failure.scenarioId} — ${failure.description} [${failure.category}]`);
      for (const fd of failure.failedDimensions) {
        lines.push(`- **${fd.dimension}**`);
        for (const detail of fd.details) lines.push(`  - ${detail}`);
      }
      lines.push("");
    }
  } else {
    lines.push("## Failures");
    lines.push("");
    lines.push("None.");
  }

  return lines.join("\n");
}
