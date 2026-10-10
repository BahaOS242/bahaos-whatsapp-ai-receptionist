import { readFileSync, writeFileSync } from "node:fs";
import { repairTypos } from "../../src/ai/lexicon-repair";

/**
 * Groups the safe-incomplete runs of an EARLIER executed run by root cause and shows where each of those same runs
 * (same scenario × provider × mode) stands in the CURRENT run. Pure reading of two results.json files; it never
 * re-runs or re-grades anything. Rules are applied in priority order to the earlier transcript.
 */
interface Turn {
  input: string;
  reply: string;
  bookingState: Record<string, unknown>;
  handoffActive: boolean;
  injected?: string[];
}
interface Rec {
  scenario: { id: string; variant: string; sourceId: string };
  provider: string;
  mode: string;
  category: string;
  completion?: string;
  probableScriptMismatch?: boolean;
  findings: { check: string }[];
  transcript?: { turns: Turn[] };
}

const UNCLEAR = /not totally sure I caught that/i;
const HANDOFF = /connect you with a member of our team|already with our team/i;
const EMERGENCY =
  /\b(pain|swollen|swelling|bleeding|emergency|urgent|hurts?|fever|911|human|person|someone|staff|agent|manager)\b/i;
const SIDE =
  /\?|\b(how (?:much|long)|directions?|parking|shuttle|checks?|cash|fee|cost|price|other times|available)\b/i;
const PROMPT =
  /(what day|which day|what time|and what time|could i get your name|best phone number|which service|exact time)/i;
const ANSWERED =
  /\$|B\$|minutes|Shirley|open Monday|don't have that information|can't recommend|isn't one of the services/i;

export function rootCause(r: Rec): string {
  const turns = r.transcript?.turns ?? [];
  const stateHas = (k: string) => turns.some((t) => t.bookingState[k] !== undefined);
  for (const t of turns) {
    if (!t.injected && repairTypos(t.input) !== t.input && UNCLEAR.test(t.reply))
      return "1. Typo'd key word not recognised (service / weekday / appointment)";
  }
  const typoNoService = turns.some((t) => repairTypos(t.input) !== t.input) && !stateHas("service");
  if (typoNoService) return "1. Typo'd key word not recognised (service / weekday / appointment)";
  for (const t of turns) {
    if (UNCLEAR.test(t.reply))
      return "2. Request not recognised (symptom, visit or vague phrasing)";
  }
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (HANDOFF.test(t.reply) && !EMERGENCY.test(t.input))
      return "3. Unnecessary staff handoff after repeated misunderstanding";
  }
  if (r.findings.some((f) => f.check === "detail-loss"))
    return "4. Valid detail lost (after an out-of-hours/closed-day rejection, or an out-of-order answer)";
  for (let i = 1; i < turns.length; i++) {
    const t = turns[i];
    const prev = turns[i - 1];
    const gave = (k: string) => turns.slice(0, i).some((x) => x.bookingState[k] !== undefined);
    if (/could i get your name|best phone number/i.test(t.reply) && (gave("name") || gave("phone")))
      return "4. Valid detail lost (after an out-of-hours/closed-day rejection, or an out-of-order answer)";
    if (
      /name and phone/i.test(prev.reply) &&
      /\d{3}[-\s]\d{3}/.test(t.input) &&
      !t.bookingState["name"] &&
      !t.bookingState["phone"]
    )
      return "4. Valid detail lost (after an out-of-hours/closed-day rejection, or an out-of-order answer)";
  }
  for (const t of turns) {
    if (!t.injected && SIDE.test(t.input) && PROMPT.test(t.reply) && !ANSWERED.test(t.reply))
      return "5. Question asked mid-booking but not answered (duration, directions, fees, unknown facts, other times)";
  }
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].reply === turns[i - 1].reply && !turns[i - 1].handoffActive)
      return "6. Same prompt/summary repeated verbatim (incl. an unrelated 'yes')";
  }
  if (r.probableScriptMismatch)
    return "7. Probable fixture mismatch (script never answered what was asked)";
  return "8. Other";
}

if (process.argv[1]?.endsWith("triage-compare.ts")) {
  const [, , earlierPath, currentPath, outPath] = process.argv;
  const earlier = JSON.parse(readFileSync(earlierPath, "utf8")) as {
    meta: { commit: string };
    results: Rec[];
  };
  const current = JSON.parse(readFileSync(currentPath, "utf8")) as {
    meta: { commit: string };
    results: Rec[];
  };
  const key = (r: Rec) => `${r.provider}|${r.mode}|${r.scenario.id}`;
  const now = new Map(current.results.map((r) => [key(r), r]));
  const inc = earlier.results.filter((r) => r.category === "safe-incomplete");
  const table = new Map<string, Record<string, number>>();
  const sources = new Map<string, Set<string>>();
  for (const r of inc) {
    const cause = rootCause(r);
    const cur = now.get(key(r))?.category ?? "missing";
    const row = table.get(cause) ?? {};
    row[cur] = (row[cur] ?? 0) + 1;
    table.set(cause, row);
    (sources.get(cause) ?? sources.set(cause, new Set()).get(cause)!).add(r.scenario.sourceId);
  }
  const cats = ["pass", "completed-quality", "script-mismatch", "safe-incomplete", "unsafe"];
  const lines = [
    `# Safe-incomplete conversations grouped by root cause`,
    "",
    `Earlier run: commit \`${earlier.meta.commit}\` — ${inc.length} safe-incomplete runs. Current run: commit \`${current.meta.commit}\`.`,
    "Each earlier run is matched to the SAME scenario × provider × mode in the current run. Root causes are assigned by rule from the earlier transcript (see scripts/conversation-test/triage-compare.ts); genuine application stalls are listed before fixture mismatches.",
    "",
    `| Root cause (earlier run) | Runs | Source groups | ${cats.map((c) => `now: ${c}`).join(" | ")} |`,
    `|---|---:|---:|${cats.map(() => "---:").join("|")}|`,
  ];
  for (const [cause, row] of [...table.entries()].sort()) {
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    lines.push(
      `| ${cause} | ${total} | ${sources.get(cause)?.size ?? 0} | ${cats.map((c) => row[c] ?? 0).join(" | ")} |`,
    );
  }
  const totals = inc.reduce<Record<string, number>>((a, r) => {
    const c = now.get(key(r))?.category ?? "missing";
    a[c] = (a[c] ?? 0) + 1;
    return a;
  }, {});
  lines.push(
    "",
    `Overall, the ${inc.length} earlier safe-incomplete runs now stand at: ${cats.map((c) => `${c} ${totals[c] ?? 0}`).join(", ")}.`,
    "",
  );
  writeFileSync(outPath ?? "reports/conversation-test/triage-compare.md", lines.join("\n"));
  console.log(lines.join("\n"));
}
