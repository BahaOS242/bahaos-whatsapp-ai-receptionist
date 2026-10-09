/**
 * LIVE Anthropic validation of the corrected name / next-week-date / correction behaviour (PR #2,
 * RELEASE_GATE_CHECKLIST.md §1). SIMULATED tools only. Spends real money — every control lives in
 * scripts/live-eval/ and is covered by offline tests (tests/live-eval) that never touch the network.
 *
 *   npx tsx scripts/eval-live-corrections.ts --cap=<usd, required> [--stop=<usd soft stop, default 80% of cap>]
 *        [--passes=<1..10>] [--set=corrected|replacement|both] [--out=<path>]
 *
 * Requires a CLEAN git working tree and records the exact commit tested.
 *
 * Refuses to run unless the cap and passes are valid, the model is on the approved list and has a named
 * price snapshot. A paid run needs EXPLICIT owner authorisation for that run; this script does not imply it.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { BudgetExceeded, Ledger, parseConfig, UsageUnknown } from "./live-eval/config";
import { REPLACEMENT_27, REPLACEMENT_27_LABEL } from "./live-eval/replacement27";
import { agentFromClient, CappedClient, CASES, runCase, type CaseResult, type MessagesSdk } from "./live-eval/harness";

process.loadEnvFile?.(".env");
const cfg = parseConfig(process.argv.slice(2), process.env);
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
const setArg = process.argv.find((a) => a.startsWith("--set="))?.slice(6) ?? "both";
if (!["corrected", "replacement", "both"].includes(setArg)) throw new Error("--set must be corrected|replacement|both");
const outPath = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "/private/tmp/claude-501/live-eval-results.json";
const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (dirty) throw new Error("refusing to run: working tree is not clean, so the tested commit would be ambiguous:\n" + dirty);
const commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const sets: Array<{ label: string; cases: typeof CASES }> = [
  ...(setArg !== "replacement" ? [{ label: "CORRECTED-15 (name / date / booking-confirmation)", cases: CASES }] : []),
  ...(setArg !== "corrected" ? [{ label: REPLACEMENT_27_LABEL, cases: REPLACEMENT_27 }] : []),
];
const ledger = new Ledger(cfg);
const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 0 }) as unknown as MessagesSdk;
const client = new CappedClient(sdk, ledger);

(async () => {
  const results: Array<CaseResult & { set?: string }> = [];
  let stoppedBy: string | null = null;
  let passCost = 0;
  try {
    for (let pass = 1; pass <= cfg.passes; pass++) {
      const before = ledger.spentUsd;
      if (pass > 1 && ledger.spentUsd + passCost * 1.25 > cfg.stopUsd) { stoppedBy = `pass ${pass} skipped: projected $${(passCost * 1.25).toFixed(3)} would exceed the cap`; break; }
      for (const set of sets) {
        for (const c of set.cases) {
          const r = await runCase(c, pass, agentFromClient(client), () => ledger.haltedReason);
          results.push({ ...r, set: set.label });
          process.stdout.write(`pass ${pass} ${c.id}: ${r.hard.length ? "HARD-FAIL" : r.soft.length ? "soft" : "ok"}  spent=$${ledger.spentUsd.toFixed(4)}\n`);
        }
      }
      passCost = Math.max(passCost, ledger.spentUsd - before);
    }
  } catch (e) {
    if (e instanceof BudgetExceeded || e instanceof UsageUnknown) stoppedBy = `HALTED: ${e.message}`;
    else throw e;
  }
  const hard = results.filter((r) => r.hard.length), soft = results.filter((r) => !r.hard.length && r.soft.length);
  const summary = {
    testedCommit: commit, workingTreeClean: true, sets: sets.map((x) => ({ label: x.label, cases: x.cases.length })),
    note: "SIMULATED booking tools only — no database, no WhatsApp, no real calendar. The historical 14/27 result is NOT rerun and NOT these tests.",
    model: [...client.modelsSeen], requestedModel: cfg.model, priceSnapshot: cfg.price, toolBackend: "simulated (no DB/WhatsApp/calendar)",
    capUSD: cfg.capUsd, softStopUSD: cfg.stopUsd, estimatedSpendUSD: Number(ledger.spentUsd.toFixed(4)), billingNote: "estimate from reported usage x the named price snapshot; NOT an Anthropic billing receipt",
    calls: ledger.calls, inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens, stoppedBy, caseRuns: results.length, hardFailures: hard.length, softShortfalls: soft.length,
  };
  writeFileSync(outPath, JSON.stringify({ summary, results }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  for (const r of hard) console.log("HARD", r.id, "pass", r.pass, r.hard);
  for (const r of soft) console.log("SOFT", r.id, "pass", r.pass, r.soft);
})();
