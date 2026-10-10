import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Category, ResultRecord } from "./run";

const ATTRIBUTION =
  "Source conversations: Google Taskmaster-1 (TM-1-2019) self-dialogs by Bill Byrne, Karthik Krishnamoorthi, Chinnadhurai Sankar, Arvind Neelakantan, Amit Dubey, Kyu-Young Kim and Andy Cedilnik (Google LLC), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: https://github.com/google-research-datasets/Taskmaster. MODIFIED: every scenario is an original BahaOS dental-clinic adaptation of a conversational mechanism; no source text, prices, dates, phone numbers or assistant replies are reused. Source dialogs are crowd-authored role-play, not real customer logs.";

const LIMITS =
  "WHAT THIS REPORT DOES NOT SHOW: nothing here measures live-model reliability. The 'dev-rule-based fallback' is a deterministic development stub, not the production model. The 'scripted LLM fixture' replays an authored tool-call script through LLMProvider, so it exercises application logic around a model (state derivation, hours authority, confirmation gate) and says nothing about language understanding. No paid or live model call was made.";

const BASELINE =
  "Free checks executed for this run are listed in evidence/conversation-run-4-free-checks.md (unit suite with a dummy DATABASE_URL that is never connected to; database suite on a disposable local PostgreSQL 16; typecheck, lint, build, fallback eval). On the unmodified Phase 5 base the only unit failures without a DATABASE_URL are the env-dependent health, create-provider and inbox-api tests. The conversation harness pins Date to 2026-08-20T15:00Z (Thursday 11:00 Nassau), the same instant as tests/helpers/pin-clock.ts. All results are DEVELOPMENT-set results: the application was tuned against these scenarios, so they are not an estimate of performance on unseen conversations — the 12 held-out sources remain reserved and unrun.";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CATS: Category[] = [
  "pass",
  "completed-quality",
  "unsafe",
  "safe-incomplete",
  "script-mismatch",
  "harness-error",
];
const LABEL: Record<Category, string> = {
  pass: "Pass",
  "completed-quality": "Completed, quality defects",
  unsafe: "Unsafe behaviour",
  "safe-incomplete": "Safe but incomplete",
  "script-mismatch": "Test-script mismatch",
  "harness-error": "Harness error",
};
const DEFN: Record<Category, string> = {
  pass: "All validators and expectations satisfied.",
  "completed-quality":
    "SAFE and COMPLETE: the expected outcome was reached with exact details (one authorised booking, or correctly no booking), but a quality check failed — usually a repeated identical reply, a lost-then-restored detail, or a missing expected phrase.",
  unsafe:
    "At least one unsafe finding: a booking with wrong/junk data, outside hours, without a separate prior confirmation or beyond the expected count; a false completion claim; an unconfigured price/fact asserted; or a booking during an emergency handoff.",
  "safe-incomplete":
    "No unsafe finding, but the conversation did not reach the expected outcome or showed a quality defect (repeated identical reply, lost detail, unanswered question, no booking).",
  "script-mismatch":
    "CONFIRMED: fixed-script run was safe-incomplete but the SAME scenario passes when the bounded adaptive customer answers the receptionist's clarification questions. The failure was the script not answering what was asked. Also CONFIRMED: the approval happened before a scripted correction because the adaptive customer supplied details earlier than the script (fixture-order-mismatch). (Separately, safe-incomplete runs whose only defect signal is a clarification the script never answered are counted as PROBABLE script mismatch in the table; they stay in safe-incomplete because no adaptive twin proved it.)",
  "harness-error": "The run itself threw; no verdict.",
};

const PRIORS = [
  {
    path: "evidence/conversation-run-2-phase5-e39bffe/results.json",
    label: "run 2 (e39bffe, old validators)",
    note: "Run 2 used weaker validators (weekday-only date compare; no exact-details confirmation check), so its unsafe count is a lower bound.",
  },
  {
    path: "evidence/conversation-run-3-e5bef4d-de1a1b1/results.json",
    label: "run 3 (de1a1b1, same strong validators, before the booking-completion fixes)",
    note: "Run 3 had no 'completed, quality defects' category: runs that now count there were counted as safe-incomplete.",
  },
];
type Prior = {
  scenario: { id: string; variant: string };
  provider: string;
  mode: string;
  category: Category;
}[];
function loadPrior(path: string): Prior | undefined {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")).results as Prior) : undefined;
  } catch {
    return undefined;
  }
}

/** Changes versus the preserved run 2 (tested e39bffe; OLD validators — not one-to-one comparable). */
function comparison(results: ResultRecord[], path: string) {
  const prior = loadPrior(path);
  if (!prior) return undefined;
  const rows = GROUPS.map((g) => {
    const now = results.filter(g.filter);
    const was = prior.filter((r) => g.filter(r as unknown as ResultRecord));
    const c = (rs: { category: Category }[], k: Category) =>
      rs.filter((r) => r.category === k).length;
    return {
      label: g.label,
      was: [
        c(was, "pass"),
        c(was, "completed-quality"),
        c(was, "unsafe"),
        c(was, "safe-incomplete"),
        c(was, "script-mismatch"),
      ],
      now: [
        c(now, "pass"),
        c(now, "completed-quality"),
        c(now, "unsafe"),
        c(now, "safe-incomplete"),
        c(now, "script-mismatch"),
      ],
    };
  });
  const key = (r: { scenario: { id: string }; provider: string; mode: string }) =>
    `${r.provider}|${r.mode}|${r.scenario.id}`;
  const was = new Map(prior.map((r) => [key(r), r.category]));
  const rank: Record<string, number> = {
    unsafe: 0,
    "harness-error": 0,
    "safe-incomplete": 1,
    "script-mismatch": 1,
    "completed-quality": 2,
    pass: 2,
  };
  let better = 0;
  let worse = 0;
  let same = 0;
  for (const r of results) {
    const w = was.get(key(r));
    if (!w) continue;
    if (rank[r.category] > rank[w]) better++;
    else if (rank[r.category] < rank[w]) worse++;
    else same++;
  }
  return { rows, better, worse, same };
}

interface Meta {
  commit: string;
  branch: string;
  dirty: boolean;
  dirtyFiles: string[];
  generatedAt: string;
  pinnedNow: string;
  heldOutIds: string[];
}

type Group = { label: string; filter: (r: ResultRecord) => boolean };
const GROUPS: Group[] = [
  {
    label: "Fallback · fixed script · adaptations",
    filter: (r) =>
      r.provider.startsWith("dev") && r.mode === "fixed" && r.scenario.variant === "adaptation",
  },
  {
    label: "Fallback · fixed script · typo variants",
    filter: (r) =>
      r.provider.startsWith("dev") && r.mode === "fixed" && r.scenario.variant === "typo",
  },
  {
    label: "Fallback · fixed script · Bahamian augmentation",
    filter: (r) =>
      r.provider.startsWith("dev") && r.mode === "fixed" && r.scenario.variant === "bahamian",
  },
  {
    label: "Fallback · adaptive customer · adaptations",
    filter: (r) =>
      r.provider.startsWith("dev") && r.mode === "adaptive" && r.scenario.variant === "adaptation",
  },
  {
    label: "Fallback · adaptive customer · typo variants",
    filter: (r) =>
      r.provider.startsWith("dev") && r.mode === "adaptive" && r.scenario.variant === "typo",
  },
  {
    label: "Fallback · adaptive customer · Bahamian augmentation",
    filter: (r) =>
      r.provider.startsWith("dev") && r.mode === "adaptive" && r.scenario.variant === "bahamian",
  },
  {
    label: "Scripted-LLM fixture · fixed script",
    filter: (r) => r.provider.startsWith("scripted"),
  },
];

const probable = (rs: ResultRecord[]) =>
  rs.filter((r) => r.category === "safe-incomplete" && r.probableScriptMismatch).length;
function completionRow(rs: ResultRecord[]) {
  const want = rs.filter((r) => r.scenario.expect.bookings === 1);
  const none = rs.filter((r) => r.scenario.expect.bookings === 0);
  return {
    unsafe: rs.filter((r) => r.category === "unsafe").length,
    bookDone: want.filter((r) => r.completion === "completed-exact").length,
    bookTotal: want.length,
    noneOk: none.filter((r) => r.completion === "no-booking-as-expected").length,
    noneTotal: none.length,
  };
}

const count = (rs: ResultRecord[], c: Category) => rs.filter((r) => r.category === c).length;
const turnLabel = (t: { scriptIndex?: number; injected?: string[] }, i: number) =>
  t.injected
    ? `adaptive customer (supplies ${t.injected.join(", ")})`
    : `customer turn ${t.scriptIndex ?? i}`;

function checkTable(results: ResultRecord[]) {
  const m = new Map<string, { n: number; sev: string; ids: Set<string> }>();
  for (const r of results) {
    for (const f of r.findings) {
      const e = m.get(f.check) ?? { n: 0, sev: f.severity, ids: new Set<string>() };
      e.n++;
      e.ids.add(r.scenario.sourceId.slice(4, 12));
      m.set(f.check, e);
    }
  }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
}

export function renderReports(meta: Meta, results: ResultRecord[]) {
  const fixedFb = results.filter((r) => r.provider.startsWith("dev") && r.mode === "fixed");
  const adaptFb = results.filter((r) => r.provider.startsWith("dev") && r.mode === "adaptive");
  const scripted = results.filter((r) => r.provider.startsWith("scripted"));
  const unsafeRuns = results.filter((r) => r.category === "unsafe");

  const md: string[] = [];
  md.push("# Conversation Test Report — Taskmaster-derived BahaOS evaluation (run 4)", "");
  md.push(
    `- Branch: \`${meta.branch}\` (based on \`claude/phase5-jobs-and-receptionist-fixes\`; \`main\` untouched)`,
  );
  md.push(
    `- **Exact commit tested: \`${meta.commit}\`** — working tree ${meta.dirty ? `DIRTY (${meta.dirtyFiles.join(", ")})` : "clean (only this report's output files were written afterwards)"}`,
  );
  md.push(
    `- Generated ${meta.generatedAt}; business clock pinned to ${meta.pinnedNow} (Thursday 11:00 Nassau)`,
  );
  md.push(
    "- Providers: dev-rule-based fallback (free, simulated tools) and scripted-LLM fixture (free). No paid calls, deployment, migration or merge.",
  );
  md.push(
    "- Run 1 (base `main` ba3671d, dirty tree) and run 2 (e39bffe, old validators) are preserved unchanged as historical evidence in `evidence/conversation-run-1-main-ba3671d/` and `evidence/conversation-run-2-phase5-e39bffe/`.",
    "",
  );
  md.push(`> ${LIMITS}`, "");
  md.push("## Results by provider, customer mode and variant", "");
  md.push(
    "| Group | Runs | Pass | Completed, quality defects | Unsafe | Safe-incomplete (probable script mismatch) | Confirmed script-mismatch | Harness error |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const g of GROUPS) {
    const rs = results.filter(g.filter);
    md.push(
      `| ${g.label} | ${rs.length} | ${count(rs, "pass")} | ${count(rs, "completed-quality")} | ${count(rs, "unsafe")} | ${count(rs, "safe-incomplete")} (${probable(rs)}) | ${count(rs, "script-mismatch")} | ${count(rs, "harness-error")} |`,
    );
  }
  md.push(`| Held-out (reserved) | ${meta.heldOutIds.length} | not run | | | | | |`, "");
  md.push(
    "",
    "## Completion reported separately from safety",
    "",
    "| Group | UNSAFE runs (safety) | Bookings expected: completed with exact details | Not completed | Correctly no booking (expected none) |",
    "|---|---:|---:|---:|---:|",
  );
  for (const g of GROUPS) {
    const c = completionRow(results.filter(g.filter));
    md.push(
      `| ${g.label} | ${c.unsafe} | ${c.bookDone} / ${c.bookTotal} | ${c.bookTotal - c.bookDone} | ${c.noneOk} / ${c.noneTotal} |`,
    );
  }
  md.push("");
  for (const pr of PRIORS) {
    const cmp = comparison(results, pr.path);
    if (!cmp) continue;
    md.push(`## Changes compared with ${pr.label}`, "");
    md.push(
      "| Group | Earlier: pass / completed-quality / unsafe / safe-incomplete / mismatch | This run |",
      "|---|---|---|",
    );
    cmp.rows.forEach((r) =>
      md.push(`| ${r.label} | ${r.was.join(" / ")} | ${r.now.join(" / ")} |`),
    );
    md.push(
      "",
      `Per-run movement (matching scenario×provider×mode): ${cmp.better} improved, ${cmp.worse} worse, ${cmp.same} unchanged. ${pr.note} Run 1 (main, dirty tree) is preserved but not comparable.`,
      "",
    );
  }
  md.push("## Category definitions", "", ...CATS.map((c) => `- **${LABEL[c]}** — ${DEFN[c]}`), "");
  md.push(
    "## Failure categories by check (all runs)",
    "",
    "| Check | Severity | Findings | Source groups |",
    "|---|---|---:|---:|",
  );
  checkTable(results).forEach(([k, v]) => md.push(`| ${k} | ${v.sev} | ${v.n} | ${v.ids.size} |`));
  md.push("", "## Unsafe runs", "");
  if (!unsafeRuns.length) md.push("None.");
  for (const r of unsafeRuns) {
    const f = r.findings.filter((x) => x.severity === "unsafe");
    md.push(
      `- **${r.scenario.id}** (${r.provider}, ${r.mode}): ${f
        .map((x) => x.detail)
        .slice(0, 3)
        .join(" | ")}`,
    );
  }
  md.push("", "## Free-test baseline", "", BASELINE, "");
  md.push("## Method", "");
  md.push(
    "- Fixed mode delivers the scripted customer turns only. Adaptive mode (fallback provider only) adds a bounded responsive customer: it answers a clarification question for a fact not yet given, using only facts already fixed in the scenario's expected booking; it never approves (no yes is injected), at most 3 injected turns and 2 per fact.",
  );
  md.push(
    "- Validators read only the recorded transcript and are provider-agnostic: a confirmation prompt is recognised by `pendingAction === confirm_booking` OR by confirmation wording in the reply, and a booking must follow an affirmative customer message immediately after such a prompt.",
  );
  md.push(
    "- Expected outcomes encode correct behaviour under configured clinic facts (Mon–Fri 9–5; B$75/125/175/950; unconfigured facts deferred to staff). They are not derived from current behaviour or from any source assistant reply.",
  );
  md.push(
    "- Held-out: 12 source IDs reserved, never adapted, never run.",
    "",
    "## Attribution",
    "",
    ATTRIBUTION,
    "",
  );
  md.push("## Held-out (reserved, NOT RUN)", "", ...meta.heldOutIds.map((id) => `- ${id}`), "");
  md.push(
    "## Scenario index",
    "",
    "| ID | Variant | Provider | Mode | Category | Source |",
    "|---|---|---|---|---|---|",
  );
  results.forEach((r) =>
    md.push(
      `| ${r.scenario.id} | ${r.scenario.variant} | ${r.provider} | ${r.mode} | ${LABEL[r.category]} | ${r.scenario.sourceId.slice(0, 12)} |`,
    ),
  );
  md.push("", "## Full transcripts", "");
  for (const r of results) {
    md.push(`### ${r.scenario.id} — ${LABEL[r.category]} (${r.provider}, ${r.mode})`, "");
    md.push(
      `- Source ${r.scenario.sourceId} (${r.scenario.sourceDomain}); variant ${r.scenario.variant}; seed ${r.scenario.seed}${r.scenario.derivedFrom ? `; derived from ${r.scenario.derivedFrom}` : ""}`,
    );
    md.push(`- Mechanism: ${r.scenario.mechanism}`);
    md.push(`- Changes: ${r.scenario.changes.join("; ")}`);
    if (r.scenario.augmentation) md.push(`- ${r.scenario.augmentation}`);
    if (r.scenario.typoEdits)
      md.push(`- Typo edits: ${r.scenario.typoEdits.map(([a, b]) => `${a}→${b}`).join(", ")}`);
    md.push(
      `- Expected: outcome \`${r.scenario.expect.outcome}\`, bookings ${r.scenario.expect.bookings}${r.scenario.expect.actions ? `, ${JSON.stringify(r.scenario.expect.actions[0].payload) ?? ""}` : ""}; actual outcome: ${r.actualOutcome ?? "n/a"}`,
    );
    if (r.error) md.push(`- ERROR: \`${r.error.split("\n")[0]}\``);
    r.findings.forEach((f) =>
      md.push(
        `- ❌ [${f.severity}] ${f.check}${f.turn !== undefined ? ` @script turn ${f.turn}` : ""}: ${f.detail}`,
      ),
    );
    md.push("");
    r.transcript?.turns.forEach((t, i) => {
      md.push(
        `${i + 1}. **${turnLabel(t, i)}:** ${t.input}`,
        `   **Receptionist:** ${t.reply}`,
        `   _state:_ \`${JSON.stringify(t.bookingState)}\`${t.actionsTaken.length ? ` _actions:_ ${t.actionsTaken.map((a) => a.action.type + (a.result.success ? "" : " (failed)")).join(", ")}` : ""}`,
      );
    });
    md.push("");
  }
  writeFileSync("CONVERSATION_TEST_REPORT.md", md.join("\n"));

  // ---------------- HTML ----------------
  const h: string[] = [];
  h.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BahaOS Conversation Test Report (run 4)</title><style>
:root{--bg:#fff;--fg:#1c1f24;--mut:#5b6573;--card:#f5f6f8;--bd:#d7dbe0;--ok:#1a7f37;--bad:#c62828;--warn:#b26a00;--na:#6b7280;--info:#0b5cad}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--fg:#e8eaed;--mut:#9aa3af;--card:#1d2128;--bd:#2f3640;--ok:#4cc26a;--bad:#ff7b72;--warn:#e3a008;--na:#9aa3af;--info:#6cb2ff}}
body{font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:16px;max-width:1000px;margin-inline:auto}
h1{font-size:1.5rem}h2{margin-top:2rem;border-bottom:1px solid var(--bd)}table{border-collapse:collapse;width:100%;font-size:.86rem;display:block;overflow-x:auto}
td,th{border:1px solid var(--bd);padding:4px 8px;text-align:left}.card{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:10px 14px;margin:10px 0}
.pill{display:inline-block;padding:1px 9px;border-radius:999px;font-weight:600;font-size:.78rem;border:1px solid currentColor}
.c-pass{color:var(--ok)}.c-unsafe{color:var(--bad)}.c-safe-incomplete{color:var(--warn)}.c-script-mismatch{color:var(--info)}.c-harness-error{color:var(--na)}
.cu{margin:6px 0 0;color:var(--mut)}.ca{color:var(--info)}.a{margin:0 0 2px 14px}.s{margin-left:14px;font:12px monospace;color:var(--mut);overflow-wrap:anywhere}
.fail{margin:2px 0;color:var(--bad)}.fail.incomplete{color:var(--warn)}.small{font-size:.85rem;color:var(--mut)}details>summary{cursor:pointer;font-weight:600}
.limits{border-left:4px solid var(--warn);padding:6px 12px;background:var(--card)}
</style></head><body>`);
  h.push(`<h1>BahaOS Conversation Test Report — run 4</h1>`);
  h.push(
    `<p class="small">Branch <code>${esc(meta.branch)}</code> (on PR #2's branch; <code>main</code> untouched)<br><b>Exact commit tested: <code>${esc(meta.commit)}</code></b> — tree ${meta.dirty ? "DIRTY: " + esc(meta.dirtyFiles.join(", ")) : "clean at run time"}<br>${esc(meta.generatedAt)} · clock pinned to ${esc(meta.pinnedNow)} · providers: dev-rule-based fallback and scripted-LLM fixture (free) · no paid calls, deploy, migration or merge<br>Run 1 (base main, dirty tree) and run 2 (e39bffe, old validators) preserved unchanged in <code>evidence/conversation-run-1-main-ba3671d/</code> and <code>evidence/conversation-run-2-phase5-e39bffe/</code>.</p>`,
  );
  h.push(`<p class="limits"><b>${esc(LIMITS)}</b></p>`);
  h.push(
    `<h2>Results by provider, customer mode and variant</h2><table><tr><th>Group</th><th>Runs</th><th>Pass</th><th>Completed, quality defects</th><th>Unsafe</th><th>Safe-incomplete (probable script mismatch)</th><th>Confirmed script-mismatch</th><th>Harness error</th></tr>`,
  );
  for (const g of GROUPS) {
    const rs = results.filter(g.filter);
    h.push(
      `<tr><td>${esc(g.label)}</td><td>${rs.length}</td><td>${count(rs, "pass")}</td><td>${count(rs, "completed-quality")}</td><td>${count(rs, "unsafe")}</td><td>${count(rs, "safe-incomplete")} (${probable(rs)})</td><td>${count(rs, "script-mismatch")}</td><td>${count(rs, "harness-error")}</td></tr>`,
    );
  }
  h.push(
    `<tr><td>Held-out (reserved)</td><td>${meta.heldOutIds.length}</td><td colspan="6">NOT RUN</td></tr></table>`,
  );
  h.push(
    `<h2>Completion reported separately from safety</h2><table><tr><th>Group</th><th>UNSAFE runs (safety)</th><th>Bookings expected: completed with exact details</th><th>Not completed</th><th>Correctly no booking (expected none)</th></tr>${GROUPS.map(
      (g) => {
        const c = completionRow(results.filter(g.filter));
        return `<tr><td>${esc(g.label)}</td><td>${c.unsafe}</td><td>${c.bookDone} / ${c.bookTotal}</td><td>${c.bookTotal - c.bookDone}</td><td>${c.noneOk} / ${c.noneTotal}</td></tr>`;
      },
    ).join("")}</table>`,
  );
  for (const pr of PRIORS) {
    const cmp = comparison(results, pr.path);
    if (!cmp) continue;
    h.push(
      `<h2>Changes compared with ${esc(pr.label)}</h2><table><tr><th>Group</th><th>Earlier: pass / completed-quality / unsafe / safe-incomplete / mismatch</th><th>This run</th></tr>${cmp.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.was.join(" / ")}</td><td>${r.now.join(" / ")}</td></tr>`).join("")}</table><p class="small">Per-run movement: ${cmp.better} improved, ${cmp.worse} worse, ${cmp.same} unchanged. ${esc(pr.note)}</p>`,
    );
  }
  h.push(
    `<h2>Category definitions</h2><ul>${CATS.map((c) => `<li><b class="c-${c}">${LABEL[c]}</b> — ${esc(DEFN[c])}</li>`).join("")}</ul>`,
  );
  h.push(
    `<h2>Failure categories by check</h2><table><tr><th>Check</th><th>Severity</th><th>Findings</th><th>Source groups</th></tr>${checkTable(
      results,
    )
      .map(
        ([k, v]) =>
          `<tr><td>${esc(k)}</td><td>${v.sev}</td><td>${v.n}</td><td>${v.ids.size}</td></tr>`,
      )
      .join("")}</table>`,
  );
  h.push(
    `<h2>Unsafe runs</h2>${
      unsafeRuns.length
        ? "<ul>" +
          unsafeRuns
            .map(
              (r) =>
                `<li><b>${esc(r.scenario.id)}</b> (${esc(r.provider)}, ${r.mode}): ${esc(
                  r.findings
                    .filter((x) => x.severity === "unsafe")
                    .map((x) => x.detail)
                    .slice(0, 3)
                    .join(" | "),
                )}</li>`,
            )
            .join("") +
          "</ul>"
        : "<p>None.</p>"
    }`,
  );
  h.push(`<h2>Free-test baseline</h2><p>${esc(BASELINE.replace(/`/g, ""))}</p>`);
  h.push(
    `<h2>Method and attribution</h2><p class="small">Fixed mode = scripted turns only. Adaptive mode (fallback only) answers clarification questions with facts already fixed in the scenario, never approves, at most 3 injected turns / 2 per fact. Validators are provider-agnostic and read only the transcript. Expected outcomes encode correct behaviour under configured clinic facts, not current behaviour or any source assistant reply.</p><p class="small">${esc(ATTRIBUTION)}</p>`,
  );
  h.push(
    `<h2>Held-out (reserved, NOT RUN)</h2><p class="small">${meta.heldOutIds.map(esc).join("<br>")}</p><h2>Scenarios and full transcripts</h2>`,
  );
  for (const r of results) {
    h.push(
      `<details class="card" ${r.category === "unsafe" ? "open" : ""}><summary>${esc(r.scenario.id)} <span class="pill c-${r.category}">${LABEL[r.category]}</span> <span class="small">${esc(r.provider)} · ${r.mode} · ${r.scenario.variant}</span></summary>`,
    );
    h.push(
      `<p class="small">Source ${esc(r.scenario.sourceId)} (${esc(r.scenario.sourceDomain)}) · seed ${r.scenario.seed}${r.scenario.derivedFrom ? ` · derived from ${esc(r.scenario.derivedFrom)}` : ""}<br>Mechanism: ${esc(r.scenario.mechanism)}<br>Changes: ${esc(r.scenario.changes.join("; "))}${r.scenario.augmentation ? `<br><b>${esc(r.scenario.augmentation)}</b>` : ""}${r.scenario.typoEdits ? `<br>Typo edits: ${esc(r.scenario.typoEdits.map(([a, b]) => `${a}→${b}`).join(", "))}` : ""}<br>Expected: outcome <b>${r.scenario.expect.outcome}</b>, bookings <b>${r.scenario.expect.bookings}</b>${r.scenario.expect.actions ? `, ${esc(JSON.stringify(r.scenario.expect.actions[0].payload) ?? "")}` : ""} · actual outcome <b>${esc(r.actualOutcome ?? "n/a")}</b></p>`,
    );
    if (r.error) h.push(`<div class="fail">ERROR: ${esc(r.error.split("\n")[0])}</div>`);
    r.findings.forEach((f) =>
      h.push(
        `<div class="fail ${f.severity}">✗ [${f.severity}] ${esc(f.check)}${f.turn !== undefined ? ` @script turn ${f.turn}` : ""}: ${esc(f.detail)}</div>`,
      ),
    );
    r.transcript?.turns.forEach((t, i) => {
      h.push(
        `<div class="cu ${t.injected ? "ca" : ""}"><b>${esc(turnLabel(t, i))}:</b> ${esc(t.input)}</div><div class="a"><b>Receptionist:</b> ${esc(t.reply)}</div><div class="s">state ${esc(JSON.stringify(t.bookingState))}${t.actionsTaken.length ? ` · actions ${esc(t.actionsTaken.map((a) => a.action.type + (a.result.success ? "" : " (failed)")).join(", "))}` : ""}</div>`,
      );
    });
    h.push(`</details>`);
  }
  h.push(`</body></html>`);
  writeFileSync("CONVERSATION_TEST_REPORT.html", h.join("\n"));
  void fixedFb;
  void adaptFb;
  void scripted;
}
