import type { Classification, FailureCategory } from "./classify";
import type { ScenarioRun } from "./run-scenario";

export interface GradedRun {
  run: ScenarioRun;
  classification: Classification;
}

function countBy(runs: GradedRun[], category: FailureCategory): number {
  return runs.filter((r) => r.classification.category === category).length;
}

export function formatProviderSummary(providerLabel: string, runs: GradedRun[]): string {
  const passed = runs.filter((r) => r.classification.pass).length;
  const totalLatency = runs.reduce((sum, r) => sum + r.run.totalLatencyMs, 0);
  const totalCalls = runs.reduce((sum, r) => sum + r.run.turns.filter((t) => t.modelCalled).length, 0);
  const avgLatency = totalCalls > 0 ? totalLatency / totalCalls : 0;

  return [
    providerLabel.toUpperCase(),
    `${runs.length} scenarios`,
    `Pass: ${passed}/${runs.length}`,
    `LLM failures: ${countBy(runs, "llm")}`,
    `Application failures: ${countBy(runs, "application")}`,
    `Safety violations: ${countBy(runs, "safety_violation")}`,
    `API failures: ${countBy(runs, "infrastructure")}`,
    `Avg latency: ${avgLatency.toFixed(0)}ms (${totalCalls} model calls)`,
  ].join("\n");
}

export function formatModelBreakdown(runs: GradedRun[]): string {
  const byModel = new Map<string, { scenarioId: number; pass: boolean }[]>();
  for (const { run, classification } of runs) {
    for (const model of run.modelsUsed) {
      const list = byModel.get(model) ?? [];
      list.push({ scenarioId: run.scenarioId, pass: classification.pass });
      byModel.set(model, list);
    }
    if (run.modelsUsed.length === 0) {
      const list = byModel.get("(no model call — every turn handled by a safety net)") ?? [];
      list.push({ scenarioId: run.scenarioId, pass: classification.pass });
      byModel.set("(no model call — every turn handled by a safety net)", list);
    }
  }

  const lines = ["MODEL BREAKDOWN"];
  for (const [model, entries] of byModel) {
    const scenarioList = entries.map((e) => `${e.scenarioId}${e.pass ? "" : "*"}`).join(", ");
    lines.push(`${model} -> scenarios: ${scenarioList}  (* = scenario failed)`);
  }
  return lines.join("\n");
}

export function formatScenarioDetail(graded: GradedRun): string {
  const { run, classification } = graded;
  const lines: string[] = [];
  lines.push(`--- Scenario ${run.scenarioId}: ${run.title} [${run.provider}] ---`);
  lines.push(`Result: ${classification.pass ? "PASS" : `FAIL (${classification.category})`}`);
  if (run.modelsUsed.length > 0) lines.push(`Models used: ${run.modelsUsed.join(", ")}`);

  for (const turn of run.turns) {
    lines.push(`  You: ${turn.message}`);
    lines.push(`  AI:  ${turn.reply}`);
    for (const executed of turn.actionsTaken) {
      const status = executed.result.success ? "ok" : `FAILED: ${executed.result.error}`;
      lines.push(`    [action] ${executed.action.type} -> ${status}`);
    }
    lines.push(
      `    [nextRequiredField] before=${turn.nextRequiredFieldBefore ?? "undefined"} after=${turn.nextRequiredFieldAfter ?? "undefined"}`,
    );
    lines.push(`    [bookingState after] ${JSON.stringify(turn.bookingStateAfter)}`);
    if (turn.modelCalled) {
      lines.push(`    [model] ${turn.modelUsed ?? "(unknown)"} — ${turn.latencyMs ?? "?"}ms`);
    } else {
      lines.push("    [model] not called (handled by a deterministic safety net)");
    }
    if (turn.apiError) lines.push(`    [API ERROR] ${turn.apiError}`);
  }

  if (classification.notes.length > 0) {
    lines.push(`  Notes (${classification.category}):`);
    for (const note of classification.notes) lines.push(`    - ${note}`);
  }
  if (classification.safetyInterventions.length > 0) {
    lines.push("  Safety interventions (not failures — model proposed, app correctly blocked):");
    for (const note of classification.safetyInterventions) lines.push(`    - ${note}`);
  }

  return lines.join("\n");
}
