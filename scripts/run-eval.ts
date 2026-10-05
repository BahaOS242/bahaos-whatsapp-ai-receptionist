/**
 * Conversation Evaluation Engine — Phase 1 CLI entry point.
 *
 * Runs the full scenario corpus against the real receptionist stack
 * (DevRuleBasedAIProvider by default), evaluates every transcript with
 * the deterministic evaluator, and prints a Markdown report. Never
 * modifies production behavior — pure measurement.
 *
 * Run with `npm run eval`.
 */
import { allScenarios } from "./eval/scenarios/index";
import { runCorpus } from "./eval/runner";
import { evaluateScenario } from "./eval/evaluator";
import { buildScorecard, formatReport } from "./eval/report";

async function main() {
  const transcripts = await runCorpus(allScenarios);
  const evaluations = allScenarios.map((scenario, i) => evaluateScenario(scenario, transcripts[i]));
  const scorecard = buildScorecard(evaluations);

  console.log(formatReport(scorecard));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
