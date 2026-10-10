import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { evaluateScenario, deriveActualOutcome } from "../eval/evaluator";
import type { EvalScenario } from "../eval/types";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import type { LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import { ScriptedLlmChatClient } from "../../tests/torture/helpers";
import { allScenarios } from "./variants";
import { heldOutIds } from "./held-out";
import { runChecks, type Finding } from "./checks";
import {
  ASKS,
  PROVIDES,
  drive,
  pinClock,
  PINNED_NOW,
  type DriveTranscript,
  type Mode,
} from "./drive";
import { renderReports } from "./report";
import type { ConvScenario } from "./types";

export type Status = "pass" | "fail" | "incomplete" | "not-run";
export type Category =
  "pass" | "completed-quality" | "unsafe" | "safe-incomplete" | "script-mismatch" | "harness-error";
/** COMPLETION is reported separately from SAFETY. */
export type Completion =
  "completed-exact" | "no-booking-as-expected" | "not-completed" | "outcome-mismatch";
export type ProviderName = "dev-rule-based fallback" | "scripted LLM fixture";

export interface ResultRecord {
  scenario: ConvScenario;
  provider: ProviderName;
  mode: Mode;
  status: Status;
  category: Category;
  completion?: Completion;
  actualOutcome?: string;
  findings: Finding[];
  /** Safe-incomplete run whose only defect signal is the receptionist re-asking a
   * clarification the scripted customer never answered (not a confirmed mismatch). */
  probableScriptMismatch?: boolean;
  transcript?: DriveTranscript;
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

function judge(s: ConvScenario, t: DriveTranscript): { findings: Finding[]; actual: string } {
  const findings: Finding[] = [];
  // The shared evaluator is run on the SCRIPTED turns' transcript semantics; its
  // dimension details are all "safe-incomplete" unless my own checks mark unsafe.
  const ev = evaluateScenario(toEval(s), t);
  for (const d of ev.dimensions) {
    if (d.applicable && !d.passed) {
      d.details.forEach((x) =>
        findings.push({ check: `eval:${d.dimension}`, severity: "incomplete", detail: x }),
      );
    }
  }
  findings.push(...runChecks(s, t));
  return { findings, actual: deriveActualOutcome(t) };
}

function scriptFor(s: ConvScenario): LlmChatResult[] {
  const last = s.turns.length - 1;
  const payload = s.expect.actions?.[0]?.payload ?? {};
  return s.turns.map((_, i) => {
    if (i === 0) {
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
    }
    if (i === last) {
      return {
        content: "Done.",
        toolCalls: [
          { id: `t${i}`, name: "request_appointment", argumentsJson: JSON.stringify(payload) },
        ],
      };
    }
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

async function runOne(s: ConvScenario, provider: ProviderName, mode: Mode): Promise<ResultRecord> {
  const base = { scenario: s, provider, mode };
  try {
    const impl =
      provider === "scripted LLM fixture"
        ? new LLMProvider(new ScriptedLlmChatClient(scriptFor(s)))
        : undefined;
    const transcript = await drive(s, mode, impl);
    const { findings, actual } = judge(s, transcript);
    const unsafe = findings.some((f) => f.severity === "unsafe");
    const unanswered = (f: Finding) => {
      if (f.check !== "repeated-reply" || f.turn === undefined) return false;
      const rec = transcript.turns.find((x) => x.scriptIndex === f.turn);
      if (!rec) return false;
      const facts = (s.expect.actions?.[0]?.payload ?? {}) as Record<string, string>;
      const map: Record<string, string | undefined> = {
        name: facts.name,
        phone: facts.phone,
        service: facts.service,
        date: facts.preferredDate,
        time: facts.preferredTime,
      };
      const asked = ASKS.filter(([, re]) => re.test(rec.reply)).map(([fld]) => fld);
      return asked.length > 0 && asked.every((fld) => !PROVIDES[fld](rec.input, map[fld] ?? ""));
    };
    const probable =
      !unsafe &&
      findings.some(unanswered) &&
      !findings.some((f) =>
        ["detail-loss", "reply-must-match", "reply-must-not-match"].includes(f.check),
      );
    const successes = transcript.allActions.filter(
      (a) => a.action.type === "request_appointment" && a.result.success,
    ).length;
    const completion: Completion =
      s.expect.bookings === 1
        ? successes === 1 && !unsafe
          ? "completed-exact"
          : "not-completed"
        : successes === 0 && actual === s.expect.outcome
          ? "no-booking-as-expected"
          : "outcome-mismatch";
    const completedOk = completion === "completed-exact" || completion === "no-booking-as-expected";
    return {
      ...base,
      status: findings.length ? "fail" : "pass",
      completion,
      category: !findings.length
        ? "pass"
        : unsafe
          ? "unsafe"
          : findings.some((f) => f.check === "fixture-order-mismatch")
            ? "script-mismatch"
            : completedOk
              ? "completed-quality"
              : "safe-incomplete",
      findings,
      probableScriptMismatch: probable,
      actualOutcome: actual,
      transcript,
    };
  } catch (e) {
    return {
      ...base,
      status: "incomplete",
      category: "harness-error",
      findings: [],
      error: String((e as Error).stack ?? e),
    };
  }
}

export function gitState() {
  const commit = execSync("git rev-parse HEAD").toString().trim();
  const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  const dirtyFiles = execSync("git status --porcelain")
    .toString()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3))
    .filter(
      (f) =>
        !f.startsWith("reports/conversation-test") && !f.startsWith("CONVERSATION_TEST_REPORT"),
    );
  return { commit, branch, dirtyFiles };
}

export async function main() {
  const git = gitState();
  if (git.dirtyFiles.length && !process.env.ALLOW_DIRTY) {
    throw new Error(
      `Refusing to run on a dirty tree (commit the harness first): ${git.dirtyFiles.join(", ")}`,
    );
  }
  const unpin = pinClock();
  const origLog = console.log;
  console.log = () => {}; // silence simulated-tool chatter
  const origError = console.error;
  console.error = () => {};
  const results: ResultRecord[] = [];
  try {
    for (const mode of ["fixed", "adaptive"] as Mode[]) {
      for (const s of allScenarios) results.push(await runOne(s, "dev-rule-based fallback", mode));
    }
    for (const s of allScenarios.filter((x) => SCRIPTED_IDS.includes(x.id))) {
      results.push(await runOne(s, "scripted LLM fixture", "fixed"));
    }
  } finally {
    console.log = origLog;
    console.error = origError;
    unpin();
  }

  // fixed-script failure that disappears once the customer answers clarifications = script mismatch
  for (const r of results) {
    if (
      r.provider !== "dev-rule-based fallback" ||
      r.mode !== "fixed" ||
      (r.category !== "safe-incomplete" && r.category !== "completed-quality")
    )
      continue;
    const twin = results.find(
      (x) => x.scenario.id === r.scenario.id && x.provider === r.provider && x.mode === "adaptive",
    );
    if (twin?.category === "pass") r.category = "script-mismatch";
  }

  const meta = {
    ...git,
    dirty: git.dirtyFiles.length > 0,
    generatedAt: new Date().toISOString(),
    pinnedNow: PINNED_NOW.toISOString(),
    heldOutIds,
  };
  mkdirSync("reports/conversation-test", { recursive: true });
  writeFileSync(
    "reports/conversation-test/results.json",
    JSON.stringify({ meta, results }, null, 1),
  );
  renderReports(meta, results);
  const n = (c: Category) => results.filter((r) => r.category === c).length;
  console.log(
    `commit=${git.commit} dirty=${meta.dirty} executed=${results.length} pass=${n("pass")} completed-quality=${n("completed-quality")} unsafe=${n("unsafe")} safe-incomplete=${n("safe-incomplete")} script-mismatch=${n("script-mismatch")} harness-error=${n("harness-error")} held-out not-run=${heldOutIds.length}`,
  );
}

if (process.argv[1]?.endsWith("run.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
