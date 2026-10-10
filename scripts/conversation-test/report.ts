import { writeFileSync } from "node:fs";
import type { ResultRecord, Status } from "./run";

const ATTRIBUTION =
  "Source conversations: Google Taskmaster-1 (TM-1-2019) self-dialogs by Bill Byrne, Karthik Krishnamoorthi, Chinnadhurai Sankar, Arvind Neelakantan, Amit Dubey, Kyu-Young Kim and Andy Cedilnik (Google LLC), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: https://github.com/google-research-datasets/Taskmaster. MODIFIED: every scenario here is an original BahaOS dental-clinic adaptation of a conversational mechanism; no source text, prices, dates, phone numbers or assistant replies are reused. Source dialogs are crowd-authored role-play, not real customer logs.";

const FREE_TESTS =
  "Free automated tests run first (no network, no paid calls): `npx vitest run` = 904 passed / 18 failed (922). The same 18 failures exist at the unmodified base commit: 2 need DATABASE_URL (tests/health.test.ts) and the other 16 are date-assertion failures that appear to depend on the real clock (e.g. 'Oct 8' now resolves to 2027); the 16 were not individually root-caused. `tsc --noEmit` and eslint are clean for the new files. The master reliability prompt referenced in the task was NOT in the package or repository, so its requirements could not be read; this report uses CLAUDE_HANDOFF.md requirements and the existing regression suites (tests/ai/*regression*, tests/torture) only.";
const KEY_FINDINGS = [
  'Wrong data booked: booking actions were executed with junk patient names taken from ordinary sentences (e.g. "Yes", "For My", "Please", "That Is Perfect", "How Long Will It Take?", "Try"). See TM-0b5b803f, TM-66c6b5b1, TM-1671146d, TM-17420eb9.',
  "Correction ignored: in TM-60cceb98 the customer changed 12:30 to 1:30 at the confirmation step, the reply restated 12:30, and the booking was executed for 12:30.",
  "Questions during confirmation are ignored: the confirmation summary is repeated verbatim instead of answering duration/address questions (TM-da2f3e45), and the generic 'What day and time works best for you?' is repeated after validated details were already given (TM-929b59a3).",
  "Details lost: a name given before the date was never stored in TM-929b59a3 (booking could not proceed).",
  "Mis-routed handoff: non-emergency scheduling conversations escalated to staff after the receptionist failed to understand repeated messages (TM-65958f69, TM-70bc0cb6, TM-73b0e503, TM-209856e2) and the holding reply then repeated for every later message.",
  "Good behaviour observed: emergency symptoms escalated without booking (TM-cacb2e3c, TM-038e5414); out-of-hours times were rejected; Saturday/evening requests were not booked.",
];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kind = (r: ResultRecord) => r.scenario.variant;
const stateStr = (s: unknown) => JSON.stringify(s);

interface Meta {
  commit: string;
  dirty: boolean;
  generatedAt: string;
  heldOutIds: string[];
}

function counts(results: ResultRecord[]) {
  const c: Record<Status, number> = { pass: 0, fail: 0, incomplete: 0, "not-run": 0 };
  results.forEach((r) => c[r.status]++);
  return c;
}

function failureThemes(results: ResultRecord[]) {
  const m = new Map<string, { n: number; ids: Set<string>; sample: string }>();
  for (const r of results.filter((x) => x.status === "fail" && x.provider.startsWith("dev"))) {
    for (const f of r.failures) {
      const key = f.match(/^\[([^\]@]+?)(?: @turn \d+)?\]/)?.[1] ?? "other";
      const e = m.get(key) ?? { n: 0, ids: new Set<string>(), sample: f };
      e.n++;
      e.ids.add(r.scenario.sourceId.slice(4, 12));
      m.set(key, e);
    }
  }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
}

export function renderReports(meta: Meta, results: ResultRecord[]) {
  const fb = results.filter((r) => r.provider.startsWith("dev"));
  const sc = results.filter((r) => r.provider.startsWith("scripted"));
  const head = (r: ResultRecord[]) => counts(r);
  const themes = failureThemes(results);
  const byKind = (k: string) => fb.filter((r) => kind(r) === k);

  // ---------- Markdown ----------
  const md: string[] = [];
  md.push("# Conversation Test Report (Taskmaster-derived BahaOS evaluation)", "");
  md.push(
    `- Head commit under test: \`${meta.commit}\`${meta.dirty ? " (working tree contained uncommitted evaluation files at run time)" : ""}`,
  );
  md.push(`- Generated: ${meta.generatedAt}`);
  md.push(
    "- Providers: **dev-rule-based fallback** (free, deterministic, simulated tools) and **scripted LLM fixture** (free; authored scripts, NOT model output).",
  );
  md.push("- Paid/live-model runs: **none**. Deployment, staging migration, merge: **none**.", "");
  md.push("## Summary", "");
  md.push("| Group | Pass | Fail | Incomplete | Not run |", "|---|---:|---:|---:|---:|");
  const row = (n: string, r: ResultRecord[]) => {
    const c = head(r);
    md.push(`| ${n} | ${c.pass} | ${c.fail} | ${c.incomplete} | ${c["not-run"]} |`);
  };
  row("Fallback — adaptations (48)", byKind("adaptation"));
  row("Fallback — typo variants", byKind("typo"));
  row("Fallback — Bahamian augmentation", byKind("bahamian"));
  row("Scripted-LLM fixtures", sc);
  md.push(`| Held-out (reserved) | 0 | 0 | 0 | ${meta.heldOutIds.length} |`, "");
  md.push(
    "## Key findings (fallback provider; see transcripts)",
    "",
    ...KEY_FINDINGS.map((k) => `- ${k}`),
    "",
  );
  md.push("## Free test baseline", "", FREE_TESTS, "");
  md.push("## Common failure themes (fallback provider)", "");
  md.push("| Check | Count | Source groups affected |", "|---|---:|---:|");
  themes.forEach(([k, v]) => md.push(`| ${k} | ${v.n} | ${v.ids.size} |`));
  md.push("");
  md.push("## Attribution and method", "", ATTRIBUTION, "");
  md.push(
    "- Customer turns are scripted and fixed. They do not react to the receptionist's actual questions, so a reply that asks a differently-ordered question than the script assumes can cause a legitimate-looking failure; every failure below includes the full transcript so it can be judged.",
  );
  md.push(
    "- Expected outcomes encode what a correct receptionist should do under the configured clinic facts (Mon–Fri 9–5; four services/prices; unconfigured facts deferred to staff). They are not derived from current behaviour and not from any source assistant reply.",
  );
  md.push(
    "- Validators (`scripts/conversation-test/checks.ts`) read only the recorded transcript: exactly-one booking, separate confirmation, no false completion claims, no repeated identical replies, no loss of validated details, no unconfigured prices or foreign-domain talk, per-scenario reply rules.",
  );
  md.push(
    "- Held-out set: 12 source IDs reserved, never adapted, never run. See `scripts/conversation-test/held-out.ts`.",
    "",
  );
  md.push("## Held-out (reserved, NOT RUN)", "");
  meta.heldOutIds.forEach((id) => md.push(`- ${id} — not-run (reserved for final evaluation)`));
  md.push("", "## Scenario results", "");
  md.push("| ID | Variant | Provider | Status | Source | Mechanism |", "|---|---|---|---|---|---|");
  results.forEach((r) =>
    md.push(
      `| ${r.scenario.id} | ${r.scenario.variant} | ${r.provider.split(" (")[0]} | ${r.status.toUpperCase()} | ${r.scenario.sourceId.slice(0, 12)} | ${r.scenario.mechanism.replace(/\|/g, "/")} |`,
    ),
  );
  md.push("", "## Full transcripts", "");
  for (const r of results) {
    md.push(`### ${r.scenario.id} — ${r.status.toUpperCase()} (${r.provider})`, "");
    md.push(
      `- Source: ${r.scenario.sourceId} (${r.scenario.sourceDomain}), variant: ${r.scenario.variant}, seed ${r.scenario.seed}${r.scenario.derivedFrom ? `, derived from ${r.scenario.derivedFrom}` : ""}`,
    );
    md.push(`- Mechanism: ${r.scenario.mechanism}`);
    md.push(`- Changes: ${r.scenario.changes.join("; ")}`);
    if (r.scenario.augmentation) md.push(`- ${r.scenario.augmentation}`);
    if (r.scenario.typoEdits)
      md.push(`- Typo edits: ${r.scenario.typoEdits.map(([a, b]) => `${a}→${b}`).join(", ")}`);
    md.push(
      `- Expected: outcome \`${r.scenario.expect.outcome}\`, bookings ${r.scenario.expect.bookings}${r.scenario.expect.actions ? `, action ${JSON.stringify(r.scenario.expect.actions[0].payload) ?? ""}` : ""}`,
    );
    md.push(`- Actual outcome: ${r.actualOutcome ?? "n/a"}`);
    if (r.error) md.push(`- ERROR: \`${r.error.split("\n")[0]}\``);
    r.failures.forEach((f) => md.push(`- ❌ ${f}`));
    md.push("");
    r.transcript?.turns.forEach((t, i) => {
      md.push(
        `${i + 1}. **Customer:** ${t.input}`,
        `   **Receptionist:** ${t.reply}`,
        `   _state:_ \`${stateStr(t.bookingState)}\`${t.actionsTaken.length ? ` _actions:_ ${t.actionsTaken.map((a) => a.action.type + (a.result.success ? "" : " (failed)")).join(", ")}` : ""}`,
      );
    });
    md.push("");
  }
  writeFileSync("CONVERSATION_TEST_REPORT.md", md.join("\n"));

  // ---------- HTML ----------
  const cls = (s: Status) => `st-${s}`;
  const h: string[] = [];
  h.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BahaOS Conversation Test Report</title><style>
:root{--bg:#fff;--fg:#1c1f24;--mut:#5b6573;--card:#f5f6f8;--bd:#d7dbe0;--ok:#1a7f37;--bad:#c62828;--warn:#b26a00;--na:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--fg:#e8eaed;--mut:#9aa3af;--card:#1d2128;--bd:#2f3640;--ok:#4cc26a;--bad:#ff7b72;--warn:#e3a008;--na:#9aa3af}}
body{font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:16px;max-width:980px;margin-inline:auto}
h1{font-size:1.5rem}h2{margin-top:2rem;border-bottom:1px solid var(--bd)}table{border-collapse:collapse;width:100%;font-size:.88rem;display:block;overflow-x:auto}
td,th{border:1px solid var(--bd);padding:4px 8px;text-align:left}.card{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:10px 14px;margin:10px 0}
.pill{display:inline-block;padding:1px 9px;border-radius:999px;font-weight:600;font-size:.78rem;border:1px solid currentColor}
.st-pass{color:var(--ok)}.st-fail{color:var(--bad)}.st-incomplete{color:var(--warn)}.st-not-run{color:var(--na)}
.c{margin:6px 0 0}.u{color:var(--mut)}.a{margin:0 0 2px 14px}.s{margin-left:14px;font:12px monospace;color:var(--mut);overflow-wrap:anywhere}
.fail{color:var(--bad);margin:2px 0}.small{font-size:.85rem;color:var(--mut)}details>summary{cursor:pointer;font-weight:600}
</style></head><body>`);
  h.push(
    `<h1>BahaOS Conversation Test Report</h1><p class="small">Head commit <code>${esc(meta.commit)}</code>${meta.dirty ? " (+ uncommitted evaluation files)" : ""} · ${esc(meta.generatedAt)} · providers: dev-rule-based fallback and scripted-LLM fixtures (both free). No paid runs, deployment, migration or merge.</p>`,
  );
  h.push(
    `<div class="card"><b>Summary</b><table><tr><th>Group</th><th>Pass</th><th>Fail</th><th>Incomplete</th><th>Not run</th></tr>`,
  );
  const hrow = (n: string, r: ResultRecord[]) => {
    const c = head(r);
    h.push(
      `<tr><td>${n}</td><td>${c.pass}</td><td>${c.fail}</td><td>${c.incomplete}</td><td>${c["not-run"]}</td></tr>`,
    );
  };
  hrow("Fallback — adaptations", byKind("adaptation"));
  hrow("Fallback — typo variants", byKind("typo"));
  hrow("Fallback — Bahamian augmentation", byKind("bahamian"));
  hrow("Scripted-LLM fixtures", sc);
  h.push(
    `<tr><td>Held-out (reserved)</td><td>0</td><td>0</td><td>0</td><td>${meta.heldOutIds.length}</td></tr></table></div>`,
  );
  h.push(
    `<h2>Common failure themes (fallback)</h2><table><tr><th>Check</th><th>Count</th><th>Source groups</th></tr>${themes.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${v.ids.size}</td></tr>`).join("")}</table>`,
  );
  h.push(
    `<h2>Attribution and method</h2><p>${esc(ATTRIBUTION)}</p><p class="small">Customer turns are scripted and fixed; expected outcomes encode correct behaviour under configured clinic facts, not current behaviour and not source assistant replies. Scripted-LLM fixtures test application plumbing only; their scripted replies are authored fixtures, not model output.</p>`,
  );
  h.push(`<h2>Held-out (reserved, NOT RUN)</h2><p>${meta.heldOutIds.map(esc).join("<br>")}</p>`);
  h.push(`<h2>Scenarios</h2>`);
  for (const r of results) {
    h.push(
      `<details class="card" ${r.status === "fail" ? "open" : ""}><summary>${esc(r.scenario.id)} <span class="pill ${cls(r.status)}">${r.status.toUpperCase()}</span> <span class="small">${esc(r.provider.split(" (")[0])} · ${r.scenario.variant}</span></summary>`,
    );
    h.push(
      `<p class="small">Source ${esc(r.scenario.sourceId)} (${esc(r.scenario.sourceDomain)}) · seed ${r.scenario.seed}${r.scenario.derivedFrom ? ` · derived from ${esc(r.scenario.derivedFrom)}` : ""}<br>Mechanism: ${esc(r.scenario.mechanism)}<br>Changes: ${esc(r.scenario.changes.join("; "))}${r.scenario.augmentation ? `<br><b>${esc(r.scenario.augmentation)}</b>` : ""}${r.scenario.typoEdits ? `<br>Typo edits: ${esc(r.scenario.typoEdits.map(([a, b]) => `${a}→${b}`).join(", "))}` : ""}<br>Expected: outcome <b>${r.scenario.expect.outcome}</b>, bookings <b>${r.scenario.expect.bookings}</b>${r.scenario.expect.actions ? `, ${esc(JSON.stringify(r.scenario.expect.actions[0].payload) ?? "")}` : ""} · Actual outcome: <b>${esc(r.actualOutcome ?? "n/a")}</b></p>`,
    );
    if (r.error) h.push(`<div class="fail">ERROR: ${esc(r.error.split("\n")[0])}</div>`);
    r.failures.forEach((f) => h.push(`<div class="fail">✗ ${esc(f)}</div>`));
    r.transcript?.turns.forEach((t) => {
      h.push(
        `<div class="c u"><b>Customer:</b> ${esc(t.input)}</div><div class="a"><b>Receptionist:</b> ${esc(t.reply)}</div><div class="s">state ${esc(stateStr(t.bookingState))}${t.actionsTaken.length ? ` · actions ${esc(t.actionsTaken.map((a) => a.action.type + (a.result.success ? "" : " (failed)")).join(", "))}` : ""}</div>`,
      );
    });
    h.push(`</details>`);
  }
  h.push(`</body></html>`);
  writeFileSync("CONVERSATION_TEST_REPORT.html", h.join("\n"));
}
