import { getEnv } from "../../src/config/env";
import { DETERMINISTIC_SCENARIOS } from "../../tests/ai/fixtures/deterministic-scenarios";
import { runScenarioLive } from "./run-scenario";
import type { ProviderName, ScenarioRun } from "./run-scenario";
import { classifyRun } from "./classify";
import type { GradedRun } from "./report";
import { formatModelBreakdown, formatProviderSummary, formatScenarioDetail } from "./report";

/**
 * CLI entry point for the live Anthropic-vs-OpenRouter comparison.
 *
 *   npm run eval:llm -- --provider=anthropic
 *   npm run eval:llm -- --provider=openrouter
 *   npm run eval:llm -- --provider=anthropic --smoke   (single scenario 1 only)
 *   npm run eval:llm -- --provider=anthropic --scenario=7   (single named scenario only)
 *   npm run eval:llm -- --provider=anthropic --scenario=1,7,8,9,10   (named subset)
 *   npm run eval:llm:compare                            (both providers, all 10)
 *
 * Never modifies production behavior — this only ever supplies its own
 * LlmChatClient (observing-clients.ts) to the real, untouched LLMProvider
 * + ReceptionistAgent + ConversationManager stack, exactly the same
 * extension point the test suite's ScriptedLlmChatClient uses.
 */

function parseArgs(
  argv: string[],
): { providers: ProviderName[]; smoke: boolean; scenarioIds: number[] | undefined } {
  const providerArg = argv.find((a) => a.startsWith("--provider="))?.split("=")[1];
  const smoke = argv.includes("--smoke");
  const compare = argv.includes("--compare");
  const scenarioArg = argv.find((a) => a.startsWith("--scenario="))?.split("=")[1];
  let scenarioIds: number[] | undefined;
  if (scenarioArg) {
    scenarioIds = scenarioArg.split(",").map((part) => Number.parseInt(part.trim(), 10));
    if (scenarioIds.some((id) => Number.isNaN(id))) {
      throw new Error(`--scenario must be a number or comma-separated numbers, got "${scenarioArg}"`);
    }
  }

  if (compare) return { providers: ["anthropic", "openrouter"], smoke, scenarioIds };
  if (providerArg === "anthropic" || providerArg === "openrouter") {
    return { providers: [providerArg], smoke, scenarioIds };
  }
  throw new Error(
    'Pass --provider=anthropic, --provider=openrouter, or --compare. Optionally add --smoke or --scenario=<id>[,<id>...].',
  );
}

async function runProvider(
  provider: ProviderName,
  smoke: boolean,
  scenarioIds: number[] | undefined,
): Promise<GradedRun[]> {
  const env = getEnv();
  let scenarios = DETERMINISTIC_SCENARIOS;
  if (smoke) {
    scenarios = DETERMINISTIC_SCENARIOS.slice(0, 1);
  } else if (scenarioIds !== undefined) {
    scenarios = DETERMINISTIC_SCENARIOS.filter((s) => scenarioIds.includes(s.id));
    const missing = scenarioIds.filter((id) => !scenarios.some((s) => s.id === id));
    if (missing.length > 0) {
      throw new Error(`No scenario(s) with id ${missing.join(", ")} in the deterministic corpus.`);
    }
  }
  const graded: GradedRun[] = [];

  for (const scenario of scenarios) {
    process.stderr.write(`[${provider}] running scenario ${scenario.id}: ${scenario.title}...\n`);
    let run: ScenarioRun;
    try {
      run = await runScenarioLive(scenario, provider, env);
    } catch (error) {
      process.stderr.write(
        `[${provider}] scenario ${scenario.id} threw outside the agent (unexpected): ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
      throw error;
    }
    const classification = classifyRun(scenario, run);
    graded.push({ run, classification });
    console.log(formatScenarioDetail({ run, classification }));
    console.log("");
  }

  return graded;
}

async function main() {
  const { providers, smoke, scenarioIds } = parseArgs(process.argv.slice(2));
  const results = new Map<ProviderName, GradedRun[]>();

  for (const provider of providers) {
    results.set(provider, await runProvider(provider, smoke, scenarioIds));
  }

  if (smoke) {
    console.log("Smoke test complete — no summary table (single scenario only).");
    return;
  }

  console.log("=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  for (const provider of providers) {
    console.log("");
    console.log(formatProviderSummary(provider, results.get(provider)!));
  }

  for (const provider of providers) {
    console.log("");
    console.log(`[${provider}]`);
    console.log(formatModelBreakdown(results.get(provider)!));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
