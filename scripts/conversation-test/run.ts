import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { runScenario } from "../eval/runner";
import { evaluateScenario, deriveActualOutcome } from "../eval/evaluator";
import type { EvalScenario, EvalTranscript } from "../eval/types";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ScriptedLlmChatClient } from "../../tests/torture/helpers";
import type { LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import { allScenarios } from "./variants";
import { heldOutIds } from "./held-out";
import { renderReports } from "./report";
import { runChecks, type Finding } from "./checks";
import type { ConvScenario } from "./types";

export type Status = "pass" | "fail" | "incomplete" | "not-run";
export interface ResultRecord {
  scenario: ConvScenario;
  provider: "dev-rule-based fallback (free)" | "scripted LLM fixture (free, authored)";
  status: Status;
  actualOutcome?: string;
  failures: string[];
  transcript?: EvalTranscript;
  error?: string;
}

function toEval(s: ConvScenario): EvalScenario {
  return {
    id: s.id,
    category: "natural_language",
    description: s.mechanism,
    turns: s.turns,
    expected: {
      outcome: s.expect.outcome,
      finalState: s.expect.finalState,
      actions: s.expect.actions,
      prohibitedActions: s.expect.prohibitedActions,
    },
  };
}

function judge(
  s: ConvScenario,
  transcript: EvalTranscript,
): { failures: string[]; actual: string } {
  const failures: string[] = [];
  const ev = evaluateScenario(toEval(s), transcript);
  for (const d of ev.dimensions) {
    if (d.applicable && !d.passed) d.details.forEach((x) => failures.push(`[${d.dimension}] ${x}`));
  }
  runChecks(s, transcript).forEach((f: Finding) =>
    failures.push(`[${f.check}${f.turn !== undefined ? ` @turn ${f.turn}` : ""}] ${f.detail}`),
  );
  return { failures, actual: deriveActualOutcome(transcript) };
}

export async function runFallback(s: ConvScenario): Promise<ResultRecord> {
  const base = { scenario: s, provider: "dev-rule-based fallback (free)" as const };
  try {
    const transcript = await runScenario(toEval(s), { provider: new DevRuleBasedAIProvider() });
    if (transcript.turns.length < s.turns.length) {
      return {
        ...base,
        status: "incomplete",
        failures: ["transcript shorter than scenario"],
        transcript,
      };
    }
    const { failures, actual } = judge(s, transcript);
    return {
      ...base,
      status: failures.length ? "fail" : "pass",
      failures,
      actualOutcome: actual,
      transcript,
    };
  } catch (e) {
    return { ...base, status: "incomplete", failures: [], error: String((e as Error).stack ?? e) };
  }
}

/**
 * Scripted-LLM cases exercise LLMProvider's own plumbing (state derivation,
 * confirmation gate, hours authority) with an authored, scripted "model".
 * The scripted replies are test fixtures, NOT model output and NOT source
 * assistant replies. They do not measure language understanding.
 */
function scriptFor(s: ConvScenario): LlmChatResult[] {
  const last = s.turns.length - 1;
  const payload = s.expect.actions?.[0]?.payload ?? {};
  return s.turns.map((_, i) => {
    if (i === 0)
      return {
        content: null,
        toolCalls: [
          {
            id: "t0",
            name: "update_booking_progress",
            argumentsJson: JSON.stringify({ intent: "book_appointment" }),
          },
        ],
      };
    if (i === last)
      return {
        content: "Done.",
        toolCalls: [
          { id: `t${i}`, name: "request_appointment", argumentsJson: JSON.stringify(payload) },
        ],
      };
    return { content: "Thanks — go on.", toolCalls: [] };
  });
}

export const SCRIPTED_IDS = [
  "TM-929b59a3",
  "TM-a8533b60",
  "TM-60cceb98",
  "TM-078a0f20",
  "TM-5cb6cabb",
  "TM-0b5b803f",
];

export async function runScripted(s: ConvScenario): Promise<ResultRecord> {
  const base = { scenario: s, provider: "scripted LLM fixture (free, authored)" as const };
  try {
    const provider = new LLMProvider(new ScriptedLlmChatClient(scriptFor(s)));
    const transcript = await runScenario(toEval(s), { provider });
    const { failures, actual } = judge(s, transcript);
    return {
      ...base,
      status: failures.length ? "fail" : "pass",
      failures,
      actualOutcome: actual,
      transcript,
    };
  } catch (e) {
    return { ...base, status: "incomplete", failures: [], error: String((e as Error).stack ?? e) };
  }
}

export async function main() {
  const quiet = console.log;
  const origLog = console.log;
  console.log = () => {}; // silence simulated-tool chatter
  const results: ResultRecord[] = [];
  for (const s of allScenarios) results.push(await runFallback(s));
  for (const s of allScenarios.filter((x) => SCRIPTED_IDS.includes(x.id)))
    results.push(await runScripted(s));
  console.log = origLog;
  void quiet;

  const commit = execSync("git rev-parse HEAD").toString().trim();
  const dirty = execSync("git status --porcelain").toString().trim().length > 0;
  const meta = { commit, dirty, generatedAt: new Date().toISOString(), heldOutIds };
  mkdirSync("reports/conversation-test", { recursive: true });
  writeFileSync(
    "reports/conversation-test/results.json",
    JSON.stringify({ meta, results }, null, 1),
  );
  renderReports(meta, results);
  const c = (st: Status) => results.filter((r) => r.status === st).length;
  console.log(
    `executed=${results.length} pass=${c("pass")} fail=${c("fail")} incomplete=${c("incomplete")} held-out not-run=${heldOutIds.length}`,
  );
}

if (process.argv[1]?.endsWith("run.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
