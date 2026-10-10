# Master reliability reference — INCOMPLETE (original prompt not recovered)

**Status: the complete master reliability prompt is NOT in this repository, in
the Taskmaster package, or on any branch or PR (#1, #2) visible to this
session. It cannot be "restored" from what is available, and it has not been
reconstructed here from memory.** Anything below is limited to requirements
that are stated verbatim in documents that ARE available, with their source.
The owner must supply the original text; until then, treat this file as a
placeholder that marks the gap, not as the master prompt.

## Requirements stated in the Taskmaster package (`CLAUDE_HANDOFF.md`)

Source: `BAHAOS_TASKMASTER_HANDOFF.zip` → `taskmaster-handoff/CLAUDE_HANDOFF.md`.

- Keep all existing master-prompt requirements and exact user transcript regressions.
- No repeated generic questions or loss of validated details; no unsafe guesses.
- Separate confirmation and exactly one correct booking; preserve valid state through FAQs.
- Include context-dependent follow-ups, details out of order, corrections, ambiguous approvals, interruption/resumption and frustration.
- Add meaningful typo variants to at least half of the adaptations (done: 46 of 48 adapted scenarios).
- Add Bahamian wording separately, labelled authored augmentation, not source dialect.
- Keep the 12 held-out dialogs separate until final evaluation; group derived variants by source conversation.
- Run free fallback and scripted-LLM cases first; keep planned cases distinct from executed results; do not replay reference assistant replies; validate state and actions independently.
- Report: `CONVERSATION_TEST_REPORT.md` + browser-readable HTML with full executed transcripts, provider, commit, pass/fail/incomplete/not-run, source attribution, expected outcomes and failure evidence.
- No additional paid runs, staging migrations, deployment, merge, production changes, full dynamic UI or Phase 6. Keep PR #2 draft.

## Requirements stated in the follow-up instruction (2026-10-10)

- Commit the harness before execution and record the exact clean commit tested.
- Freeze the test clock; investigate every baseline failure.
- Validators must hold for both provider paths; do not assume one `pendingAction` value.
- Separate unsafe behaviour, safe incomplete conversations and test-script mismatches.
- Keep fixed scripts; add bounded customer behaviour that answers clarifications without changing expected facts or approving automatically.
- Do not claim live-model reliability from fallback or scripted fixtures.

## Related documents that DO exist (not the master prompt)

`RELEASE_GATE_CHECKLIST.md`, `evidence/README.md` (PR #2 branch); `RELEASE_GATES.md`, `TEST_FINDINGS.md`, `AI_COLLABORATION.md` (PR #1 branch).

## Attribution

Taskmaster-1 (TM-1-2019): Byrne, Krishnamoorthi, Sankar, Neelakantan, Dubey, Kim, Cedilnik — Google LLC, CC BY 4.0. Adaptations are modified original works.
