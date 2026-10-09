# AI collaboration

## Scope and ownership
Claude Code continues implementation, including its existing local Phase 5 background-jobs work. Codex independently reviews committed GitHub snapshots, writes reproducible findings, and reviews proposed fixes. The human owner decides merges and releases. This review authorizes no merge, deployment, production access, live messaging, or migration.

Use separate branches/checkouts. Never reset, clean, stash, switch, or overwrite Claude's active checkout to obtain a review snapshot. Uncommitted work is outside remote visibility. Share it only after the owner authorizes a verified commit/push.

## Remote snapshot — October 9, 2026
- Default branch/main: `ba3671dde678b1fe2a7b02eac486f0482c454b96`.
- `claude/vibrant-gates-ulohrc`: `f1bb74eeae30e2830ae377ffeced4736e147f2de`, 2 ahead / 1 behind main; comparison contains frontend/demo changes.
- No open PRs at initial inspection. Neither remote tree contained these three collaboration files or AGENTS.md.
- Main's three successful check runs are GitHub Pages build/deploy/report checks, not evidence of receptionist tests. Combined commit status had zero status entries.
- Report snapshot: `0bb6106816e3fee4630e6f8dc1d738f7edec98bc` plus local working-tree files. It differs from remote main; do not transfer its pass counts to this SHA.
- README, PROJECT_CONTEXT and IMPLEMENTATION_PLAN retain old phase/status descriptions. PHASE1_PROGRESS and KNOWLEDGE_ENGINE contain later implementation evidence. Phase numbers alone are not a reliable status authority. No Phase 5 local files were inspected or modified.

## Lightweight workflow
1. Implement a narrowly scoped fix on its own branch. Record base/head SHA and changed files.
2. Add regressions asserting intermediate state AND executed action payloads; freeze the business clock for relative dates.
3. Record commands, runtime, provider/model, feature flags, tool backend, clock/timezone, results and skipped coverage in TEST_FINDINGS.md.
4. Request independent review through a PR; link exact failing inputs and evidence.
5. The owner approves any merge/release after RELEASE_GATES.md is satisfied. This document is a manual checklist, not an installed branch-protection rule.

## Claude handoff
Preserve the uncommitted Phase 5 work and verify it separately. In an isolated fix checkout, first reproduce the name and next-week date cases in TEST_FINDINGS.md. Fix field provenance and qualified-date handling in both deterministic extraction paths; retain confirmation invalidation and tool validation. Run targeted regressions, then lint/typecheck/build/offline suites and eval. Record remaining baseline failures explicitly. Run Anthropic with simulated tools separately from disposable-DB/inbox/outbox/job tests. Do not treat scripted LLM tests as a live model evaluation or simulated requests as durable appointments.
