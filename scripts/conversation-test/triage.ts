import { readFileSync, writeFileSync } from "node:fs";

/**
 * Groups SAFE-INCOMPLETE runs by the first point at which the receptionist stalled. Reads the executed results only
 * (reports/conversation-test/results.json); never re-runs or re-grades anything.
 *
 * Signatures (first match in transcript order wins):
 *  unrecognized-input  — generic "not totally sure I caught that" reply
 *  unnecessary-handoff — escalated to staff while no emergency/human request was in the customer's text
 *  question-unanswered — customer asked a question ("?" or FAQ cue) and the reply was only the booking prompt
 *  repeated-prompt     — identical (or same-question) reply twice in a row
 *  stale-state         — a stored detail was lost/ignored (detail-loss finding)
 *  stalled-after-details — all details known but no confirmation/booking reached
 *  script-gap          — scripted turn never answered a clarification the app asked (probable fixture mismatch)
 */
const UNCLEAR = /not totally sure I caught that/i;
const HANDOFF = /connect you with a member of our team|already with our team/i;
const EMERGENCY =
  /\b(pain|swollen|swelling|bleeding|emergency|urgent|hurts?|fever|911|human|person|someone|staff|agent|manager)\b/i;
const QUESTION =
  /\?|\b(how (?:much|long)|what (?:is|are|does|time|day)|when|where|do you|are you|is there|can you tell|which)\b/i;
const BOOKING_PROMPT =
  /(what day|which day|what time|and what time|could i get your name|best phone number|which service|reply yes|exact time|did you mean)/i;

interface Turn {
  input: string;
  reply: string;
  bookingState: Record<string, unknown>;
  handoffActive: boolean;
  injected?: string[];
  scriptIndex?: number;
}
interface Rec {
  scenario: { id: string; sourceId: string; variant: string };
  provider: string;
  mode: string;
  category: string;
  probableScriptMismatch?: boolean;
  findings: { check: string }[];
  transcript?: { turns: Turn[] };
}

export function signature(r: Rec): { sig: string; at: number; msg: string } {
  const turns = r.transcript?.turns ?? [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (UNCLEAR.test(t.reply)) return { sig: "unrecognized-input", at: i, msg: t.input };
    if (
      HANDOFF.test(t.reply) &&
      !EMERGENCY.test(t.input) &&
      i > 0 &&
      !turns.slice(0, i + 1).some((x) => EMERGENCY.test(x.input))
    )
      return { sig: "unnecessary-handoff", at: i, msg: t.input };
    if (
      QUESTION.test(t.input) &&
      !t.injected &&
      BOOKING_PROMPT.test(t.reply) &&
      !/\$|B\$|minutes|open|Shirley|Monday/i.test(t.reply)
    )
      return { sig: "question-unanswered", at: i, msg: t.input };
    if (i > 0 && t.reply === turns[i - 1].reply && !turns[i - 1].handoffActive)
      return { sig: "repeated-prompt", at: i, msg: t.input };
  }
  if (r.findings.some((f) => f.check === "detail-loss"))
    return { sig: "stale-state", at: -1, msg: "" };
  const last = turns[turns.length - 1];
  const st = last?.bookingState ?? {};
  const have = ["service", "date", "time", "name", "phone"].every((k) => st[k] !== undefined);
  if (have) return { sig: "stalled-after-details", at: turns.length - 1, msg: last?.input ?? "" };
  return { sig: "stalled-missing-detail", at: turns.length - 1, msg: last?.input ?? "" };
}

if (process.argv[1]?.endsWith("triage.ts")) {
  const data = JSON.parse(
    readFileSync(process.argv[2] ?? "reports/conversation-test/results.json", "utf8"),
  ) as {
    meta: { commit: string };
    results: Rec[];
  };
  const inc = data.results.filter((r) => r.category === "safe-incomplete");
  const groups = new Map<
    string,
    { n: number; sources: Set<string>; examples: Map<string, number>; script: number }
  >();
  for (const r of inc) {
    const s = signature(r);
    const g = groups.get(s.sig) ?? { n: 0, sources: new Set(), examples: new Map(), script: 0 };
    g.n++;
    g.sources.add(r.scenario.sourceId);
    if (s.msg) g.examples.set(s.msg, (g.examples.get(s.msg) ?? 0) + 1);
    if (r.probableScriptMismatch) g.script++;
    groups.set(s.sig, g);
  }
  const lines = [
    `# Safe-incomplete triage (commit ${data.meta.commit})`,
    "",
    `${inc.length} safe-incomplete runs.`,
    "",
    "| Root-cause signature | Runs | Source groups | Probable fixture mismatch |",
    "|---|---:|---:|---:|",
  ];
  for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].n - a[1].n))
    lines.push(`| ${k} | ${g.n} | ${g.sources.size} | ${g.script} |`);
  lines.push("");
  for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].n - a[1].n)) {
    lines.push(
      `## ${k}`,
      ...[...g.examples.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([m, n]) => `- (${n}) ${m}`),
      "",
    );
  }
  writeFileSync(process.argv[3] ?? "reports/conversation-test/triage.md", lines.join("\n"));
  console.log(lines.slice(0, 14).join("\n"));
}
