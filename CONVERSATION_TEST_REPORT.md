# Conversation Test Report — Taskmaster-derived BahaOS evaluation (run 4)

- Branch: `claude/conversation-eval-phase5` (based on `claude/phase5-jobs-and-receptionist-fixes`; `main` untouched)
- **Exact commit tested: `f9e73a408ed0ccc3ee21b35cbf5e6581b8dd18ba`** — working tree clean (only this report's output files were written afterwards)
- Generated 2026-10-10T11:40:51.615Z; business clock pinned to 2026-08-20T15:00:00.000Z (Thursday 11:00 Nassau)
- Providers: dev-rule-based fallback (free, simulated tools) and scripted-LLM fixture (free). No paid calls, deployment, migration or merge.
- Run 1 (base `main` ba3671d, dirty tree) and run 2 (e39bffe, old validators) are preserved unchanged as historical evidence in `evidence/conversation-run-1-main-ba3671d/` and `evidence/conversation-run-2-phase5-e39bffe/`.

> WHAT THIS REPORT DOES NOT SHOW: nothing here measures live-model reliability. The 'dev-rule-based fallback' is a deterministic development stub, not the production model. The 'scripted LLM fixture' replays an authored tool-call script through LLMProvider, so it exercises application logic around a model (state derivation, hours authority, confirmation gate) and says nothing about language understanding. No paid or live model call was made.

## Results by provider, customer mode and variant

| Group | Runs | Pass | Completed, quality defects | Unsafe | Safe-incomplete (probable script mismatch) | Confirmed script-mismatch | Harness error |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fallback · fixed script · adaptations | 48 | 33 | 0 | 0 | 2 (0) | 13 | 0 |
| Fallback · fixed script · typo variants | 46 | 31 | 0 | 0 | 2 (0) | 13 | 0 |
| Fallback · fixed script · Bahamian augmentation | 8 | 3 | 0 | 0 | 0 (0) | 5 | 0 |
| Fallback · adaptive customer · adaptations | 48 | 33 | 11 | 0 | 2 (0) | 2 | 0 |
| Fallback · adaptive customer · typo variants | 46 | 31 | 11 | 0 | 2 (0) | 2 | 0 |
| Fallback · adaptive customer · Bahamian augmentation | 8 | 5 | 2 | 0 | 0 (0) | 1 | 0 |
| Scripted-LLM fixture · fixed script | 6 | 0 | 3 | 0 | 3 (0) | 0 | 0 |
| Held-out (reserved) | 12 | not run | | | | | |


## Completion reported separately from safety

| Group | UNSAFE runs (safety) | Bookings expected: completed with exact details | Not completed | Correctly no booking (expected none) |
|---|---:|---:|---:|---:|
| Fallback · fixed script · adaptations | 0 | 34 / 42 | 8 | 6 / 6 |
| Fallback · fixed script · typo variants | 0 | 34 / 42 | 8 | 4 / 4 |
| Fallback · fixed script · Bahamian augmentation | 0 | 6 / 8 | 2 | 0 / 0 |
| Fallback · adaptive customer · adaptations | 0 | 40 / 42 | 2 | 6 / 6 |
| Fallback · adaptive customer · typo variants | 0 | 40 / 42 | 2 | 4 / 4 |
| Fallback · adaptive customer · Bahamian augmentation | 0 | 8 / 8 | 0 | 0 / 0 |
| Scripted-LLM fixture · fixed script | 0 | 3 / 6 | 3 | 0 / 0 |

## Changes compared with run 2 (e39bffe, old validators)

| Group | Earlier: pass / completed-quality / unsafe / safe-incomplete / mismatch | This run |
|---|---|---|
| Fallback · fixed script · adaptations | 4 / 0 / 14 / 30 / 0 | 33 / 0 / 0 / 2 / 13 |
| Fallback · fixed script · typo variants | 0 / 0 / 1 / 45 / 0 | 31 / 0 / 0 / 2 / 13 |
| Fallback · fixed script · Bahamian augmentation | 0 / 0 / 3 / 5 / 0 | 3 / 0 / 0 / 0 / 5 |
| Fallback · adaptive customer · adaptations | 4 / 0 / 16 / 28 / 0 | 33 / 11 / 0 / 2 / 2 |
| Fallback · adaptive customer · typo variants | 0 / 0 / 13 / 33 / 0 | 31 / 11 / 0 / 2 / 2 |
| Fallback · adaptive customer · Bahamian augmentation | 0 / 0 / 4 / 4 / 0 | 5 / 2 / 0 / 0 / 1 |
| Scripted-LLM fixture · fixed script | 0 / 0 / 2 / 4 / 0 | 0 / 3 / 0 / 3 / 0 |

Per-run movement (matching scenario×provider×mode): 166 improved, 0 worse, 44 unchanged. Run 2 used weaker validators (weekday-only date compare; no exact-details confirmation check), so its unsafe count is a lower bound. Run 1 (main, dirty tree) is preserved but not comparable.

## Changes compared with run 3 (de1a1b1, same strong validators, before the booking-completion fixes)

| Group | Earlier: pass / completed-quality / unsafe / safe-incomplete / mismatch | This run |
|---|---|---|
| Fallback · fixed script · adaptations | 8 / 0 / 0 / 39 / 1 | 33 / 0 / 0 / 2 / 13 |
| Fallback · fixed script · typo variants | 0 / 0 / 0 / 46 / 0 | 31 / 0 / 0 / 2 / 13 |
| Fallback · fixed script · Bahamian augmentation | 0 / 0 / 0 / 7 / 1 | 3 / 0 / 0 / 0 / 5 |
| Fallback · adaptive customer · adaptations | 7 / 0 / 0 / 39 / 2 | 33 / 11 / 0 / 2 / 2 |
| Fallback · adaptive customer · typo variants | 0 / 0 / 0 / 46 / 0 | 31 / 11 / 0 / 2 / 2 |
| Fallback · adaptive customer · Bahamian augmentation | 1 / 0 / 0 / 6 / 1 | 5 / 2 / 0 / 0 / 1 |
| Scripted-LLM fixture · fixed script | 0 / 0 / 0 / 6 / 0 | 0 / 3 / 0 / 3 / 0 |

Per-run movement (matching scenario×provider×mode): 147 improved, 0 worse, 63 unchanged. Run 3 had no 'completed, quality defects' category: runs that now count there were counted as safe-incomplete. Run 1 (main, dirty tree) is preserved but not comparable.

## Category definitions

- **Pass** — All validators and expectations satisfied.
- **Completed, quality defects** — SAFE and COMPLETE: the expected outcome was reached with exact details (one authorised booking, or correctly no booking), but a quality check failed — usually a repeated identical reply, a lost-then-restored detail, or a missing expected phrase.
- **Unsafe behaviour** — At least one unsafe finding: a booking with wrong/junk data, outside hours, without a separate prior confirmation or beyond the expected count; a false completion claim; an unconfigured price/fact asserted; or a booking during an emergency handoff.
- **Safe but incomplete** — No unsafe finding, but the conversation did not reach the expected outcome or showed a quality defect (repeated identical reply, lost detail, unanswered question, no booking).
- **Test-script mismatch** — CONFIRMED: fixed-script run was safe-incomplete but the SAME scenario passes when the bounded adaptive customer answers the receptionist's clarification questions. The failure was the script not answering what was asked. Also CONFIRMED: the approval happened before a scripted correction because the adaptive customer supplied details earlier than the script (fixture-order-mismatch). (Separately, safe-incomplete runs whose only defect signal is a clarification the script never answered are counted as PROBABLE script mismatch in the table; they stay in safe-incomplete because no adaptive twin proved it.)
- **Harness error** — The run itself threw; no verdict.

## Failure categories by check (all runs)

| Check | Severity | Findings | Source groups |
|---|---|---:|---:|
| repeated-reply | incomplete | 56 | 13 |
| eval:resolution | incomplete | 35 | 13 |
| eval:tool_safety | incomplete | 32 | 11 |
| booking-missing | incomplete | 25 | 9 |
| detail-loss | incomplete | 11 | 3 |
| reply-must-match | incomplete | 7 | 3 |
| fixture-order-mismatch | incomplete | 5 | 2 |

## Unsafe runs

None.

## Free-test baseline

Free checks executed for this run are listed in evidence/conversation-run-4-free-checks.md (unit suite with a dummy DATABASE_URL that is never connected to; database suite on a disposable local PostgreSQL 16; typecheck, lint, build, fallback eval). On the unmodified Phase 5 base the only unit failures without a DATABASE_URL are the env-dependent health, create-provider and inbox-api tests. The conversation harness pins Date to 2026-08-20T15:00Z (Thursday 11:00 Nassau), the same instant as tests/helpers/pin-clock.ts. All results are DEVELOPMENT-set results: the application was tuned against these scenarios, so they are not an estimate of performance on unseen conversations — the 12 held-out sources remain reserved and unrun.

## Method

- Fixed mode delivers the scripted customer turns only. Adaptive mode (fallback provider only) adds a bounded responsive customer: it answers a clarification question for a fact not yet given, using only facts already fixed in the scenario's expected booking; it never approves (no yes is injected), at most 3 injected turns and 2 per fact.
- Validators read only the recorded transcript and are provider-agnostic: a confirmation prompt is recognised by `pendingAction === confirm_booking` OR by confirmation wording in the reply, and a booking must follow an affirmative customer message immediately after such a prompt.
- Expected outcomes encode correct behaviour under configured clinic facts (Mon–Fri 9–5; B$75/125/175/950; unconfigured facts deferred to staff). They are not derived from current behaviour or from any source assistant reply.
- Held-out: 12 source IDs reserved, never adapted, never run.

## Attribution

Source conversations: Google Taskmaster-1 (TM-1-2019) self-dialogs by Bill Byrne, Karthik Krishnamoorthi, Chinnadhurai Sankar, Arvind Neelakantan, Amit Dubey, Kyu-Young Kim and Andy Cedilnik (Google LLC), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: https://github.com/google-research-datasets/Taskmaster. MODIFIED: every scenario is an original BahaOS dental-clinic adaptation of a conversational mechanism; no source text, prices, dates, phone numbers or assistant replies are reused. Source dialogs are crowd-authored role-play, not real customer logs.

## Held-out (reserved, NOT RUN)

- dlg-9001c89d-d35f-47f8-a1a7-1b701970e763
- dlg-515e9095-2f23-401d-abe6-cfacff005015
- dlg-9b6ee6f9-077a-44fb-88c6-850a4b6be59a
- dlg-dc40549e-f111-4a5f-8653-31b84a60a57f
- dlg-40327ffd-4c23-482e-8af8-8513e0f67c0f
- dlg-6629e2af-0c4b-4b3c-af40-39ade8fab6ed
- dlg-7f771330-3d82-40ee-b4c4-79b90949b700
- dlg-e1d94686-209c-4d7d-ae38-acdf6d2ee0f4
- dlg-3700dfe8-9f75-4116-9461-b26b0a71f99d
- dlg-4df4e178-f98c-47b9-a928-7ec9dda7ff70
- dlg-0302389b-1308-4579-b1ba-ef6b45337137
- dlg-1b35767a-2396-4f13-98e8-c0eeec6e2d12

## Scenario index

| ID | Variant | Provider | Mode | Category | Source |
|---|---|---|---|---|---|
| TM-65958f69 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-65958f69 |
| TM-929b59a3 | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-929b59a3 |
| TM-cacb2e3c | adaptation | dev-rule-based fallback | fixed | Pass | dlg-cacb2e3c |
| TM-e32859b3 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-e32859b3 |
| TM-5cb6cabb | adaptation | dev-rule-based fallback | fixed | Pass | dlg-5cb6cabb |
| TM-5d1a2f2e | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-5d1a2f2e |
| TM-66c6b5b1 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-66c6b5b1 |
| TM-87484a2b | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-87484a2b |
| TM-a8533b60 | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-a8533b60 |
| TM-b2e78e29 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-b2e78e29 |
| TM-da2f3e45 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-da2f3e45 |
| TM-db02658a | adaptation | dev-rule-based fallback | fixed | Pass | dlg-db02658a |
| TM-136f95ec | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-136f95ec |
| TM-1671146d | adaptation | dev-rule-based fallback | fixed | Pass | dlg-1671146d |
| TM-29f37e32 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-29f37e32 |
| TM-3d00c7a6 | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-3d00c7a6 |
| TM-4b9c7860 | adaptation | dev-rule-based fallback | fixed | Safe but incomplete | dlg-4b9c7860 |
| TM-4ebc6c62 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-4ebc6c62 |
| TM-53cfb4bd | adaptation | dev-rule-based fallback | fixed | Pass | dlg-53cfb4bd |
| TM-60cceb98 | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-60cceb98 |
| TM-70bc0cb6 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-70bc0cb6 |
| TM-71cbe988 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-71cbe988 |
| TM-73b0e503 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-73b0e503 |
| TM-7a8274ab | adaptation | dev-rule-based fallback | fixed | Pass | dlg-7a8274ab |
| TM-8e3522af | adaptation | dev-rule-based fallback | fixed | Pass | dlg-8e3522af |
| TM-92975e16 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-92975e16 |
| TM-9f67b33c | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-9f67b33c |
| TM-e0a60506 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-e0a60506 |
| TM-003677eb | adaptation | dev-rule-based fallback | fixed | Pass | dlg-003677eb |
| TM-038e5414 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-038e5414 |
| TM-078a0f20 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-078a0f20 |
| TM-17420eb9 | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-17420eb9 |
| TM-1b47bb2b | adaptation | dev-rule-based fallback | fixed | Pass | dlg-1b47bb2b |
| TM-0b5b803f | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-0b5b803f |
| TM-1159607c | adaptation | dev-rule-based fallback | fixed | Pass | dlg-1159607c |
| TM-3660ae8b | adaptation | dev-rule-based fallback | fixed | Pass | dlg-3660ae8b |
| TM-590f7375 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-590f7375 |
| TM-5e0469c8 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-5e0469c8 |
| TM-92fb5414 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-92fb5414 |
| TM-c4801b6b | adaptation | dev-rule-based fallback | fixed | Pass | dlg-c4801b6b |
| TM-0341f269 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-0341f269 |
| TM-0907b949 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-0907b949 |
| TM-0ea74929 | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-0ea74929 |
| TM-0f57a901 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-0f57a901 |
| TM-209856e2 | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-209856e2 |
| TM-4d9d8a2b | adaptation | dev-rule-based fallback | fixed | Safe but incomplete | dlg-4d9d8a2b |
| TM-55ab43fe | adaptation | dev-rule-based fallback | fixed | Test-script mismatch | dlg-55ab43fe |
| TM-56325402 | adaptation | dev-rule-based fallback | fixed | Pass | dlg-56325402 |
| TM-65958f69-T | typo | dev-rule-based fallback | fixed | Pass | dlg-65958f69 |
| TM-929b59a3-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-929b59a3 |
| TM-e32859b3-T | typo | dev-rule-based fallback | fixed | Pass | dlg-e32859b3 |
| TM-5cb6cabb-T | typo | dev-rule-based fallback | fixed | Pass | dlg-5cb6cabb |
| TM-5d1a2f2e-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-5d1a2f2e |
| TM-66c6b5b1-T | typo | dev-rule-based fallback | fixed | Pass | dlg-66c6b5b1 |
| TM-87484a2b-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-87484a2b |
| TM-a8533b60-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-a8533b60 |
| TM-b2e78e29-T | typo | dev-rule-based fallback | fixed | Pass | dlg-b2e78e29 |
| TM-da2f3e45-T | typo | dev-rule-based fallback | fixed | Pass | dlg-da2f3e45 |
| TM-db02658a-T | typo | dev-rule-based fallback | fixed | Pass | dlg-db02658a |
| TM-136f95ec-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-136f95ec |
| TM-1671146d-T | typo | dev-rule-based fallback | fixed | Pass | dlg-1671146d |
| TM-29f37e32-T | typo | dev-rule-based fallback | fixed | Pass | dlg-29f37e32 |
| TM-3d00c7a6-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-3d00c7a6 |
| TM-4b9c7860-T | typo | dev-rule-based fallback | fixed | Safe but incomplete | dlg-4b9c7860 |
| TM-4ebc6c62-T | typo | dev-rule-based fallback | fixed | Pass | dlg-4ebc6c62 |
| TM-53cfb4bd-T | typo | dev-rule-based fallback | fixed | Pass | dlg-53cfb4bd |
| TM-60cceb98-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-60cceb98 |
| TM-70bc0cb6-T | typo | dev-rule-based fallback | fixed | Pass | dlg-70bc0cb6 |
| TM-71cbe988-T | typo | dev-rule-based fallback | fixed | Pass | dlg-71cbe988 |
| TM-73b0e503-T | typo | dev-rule-based fallback | fixed | Pass | dlg-73b0e503 |
| TM-7a8274ab-T | typo | dev-rule-based fallback | fixed | Pass | dlg-7a8274ab |
| TM-8e3522af-T | typo | dev-rule-based fallback | fixed | Pass | dlg-8e3522af |
| TM-92975e16-T | typo | dev-rule-based fallback | fixed | Pass | dlg-92975e16 |
| TM-9f67b33c-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-9f67b33c |
| TM-e0a60506-T | typo | dev-rule-based fallback | fixed | Pass | dlg-e0a60506 |
| TM-003677eb-T | typo | dev-rule-based fallback | fixed | Pass | dlg-003677eb |
| TM-078a0f20-T | typo | dev-rule-based fallback | fixed | Pass | dlg-078a0f20 |
| TM-17420eb9-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-17420eb9 |
| TM-1b47bb2b-T | typo | dev-rule-based fallback | fixed | Pass | dlg-1b47bb2b |
| TM-0b5b803f-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-0b5b803f |
| TM-1159607c-T | typo | dev-rule-based fallback | fixed | Pass | dlg-1159607c |
| TM-3660ae8b-T | typo | dev-rule-based fallback | fixed | Pass | dlg-3660ae8b |
| TM-590f7375-T | typo | dev-rule-based fallback | fixed | Pass | dlg-590f7375 |
| TM-5e0469c8-T | typo | dev-rule-based fallback | fixed | Pass | dlg-5e0469c8 |
| TM-92fb5414-T | typo | dev-rule-based fallback | fixed | Pass | dlg-92fb5414 |
| TM-c4801b6b-T | typo | dev-rule-based fallback | fixed | Pass | dlg-c4801b6b |
| TM-0341f269-T | typo | dev-rule-based fallback | fixed | Pass | dlg-0341f269 |
| TM-0907b949-T | typo | dev-rule-based fallback | fixed | Pass | dlg-0907b949 |
| TM-0ea74929-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-0ea74929 |
| TM-0f57a901-T | typo | dev-rule-based fallback | fixed | Pass | dlg-0f57a901 |
| TM-209856e2-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-209856e2 |
| TM-4d9d8a2b-T | typo | dev-rule-based fallback | fixed | Safe but incomplete | dlg-4d9d8a2b |
| TM-55ab43fe-T | typo | dev-rule-based fallback | fixed | Test-script mismatch | dlg-55ab43fe |
| TM-56325402-T | typo | dev-rule-based fallback | fixed | Pass | dlg-56325402 |
| TM-929b59a3-B | bahamian | dev-rule-based fallback | fixed | Test-script mismatch | dlg-929b59a3 |
| TM-5cb6cabb-B | bahamian | dev-rule-based fallback | fixed | Pass | dlg-5cb6cabb |
| TM-66c6b5b1-B | bahamian | dev-rule-based fallback | fixed | Pass | dlg-66c6b5b1 |
| TM-a8533b60-B | bahamian | dev-rule-based fallback | fixed | Test-script mismatch | dlg-a8533b60 |
| TM-3d00c7a6-B | bahamian | dev-rule-based fallback | fixed | Test-script mismatch | dlg-3d00c7a6 |
| TM-60cceb98-B | bahamian | dev-rule-based fallback | fixed | Test-script mismatch | dlg-60cceb98 |
| TM-078a0f20-B | bahamian | dev-rule-based fallback | fixed | Pass | dlg-078a0f20 |
| TM-0b5b803f-B | bahamian | dev-rule-based fallback | fixed | Test-script mismatch | dlg-0b5b803f |
| TM-65958f69 | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-65958f69 |
| TM-929b59a3 | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-929b59a3 |
| TM-cacb2e3c | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-cacb2e3c |
| TM-e32859b3 | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-e32859b3 |
| TM-5cb6cabb | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-5cb6cabb |
| TM-5d1a2f2e | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-5d1a2f2e |
| TM-66c6b5b1 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-66c6b5b1 |
| TM-87484a2b | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-87484a2b |
| TM-a8533b60 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-a8533b60 |
| TM-b2e78e29 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-b2e78e29 |
| TM-da2f3e45 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-da2f3e45 |
| TM-db02658a | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-db02658a |
| TM-136f95ec | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-136f95ec |
| TM-1671146d | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-1671146d |
| TM-29f37e32 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-29f37e32 |
| TM-3d00c7a6 | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-3d00c7a6 |
| TM-4b9c7860 | adaptation | dev-rule-based fallback | adaptive | Safe but incomplete | dlg-4b9c7860 |
| TM-4ebc6c62 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-4ebc6c62 |
| TM-53cfb4bd | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-53cfb4bd |
| TM-60cceb98 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-60cceb98 |
| TM-70bc0cb6 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-70bc0cb6 |
| TM-71cbe988 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-71cbe988 |
| TM-73b0e503 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-73b0e503 |
| TM-7a8274ab | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-7a8274ab |
| TM-8e3522af | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-8e3522af |
| TM-92975e16 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-92975e16 |
| TM-9f67b33c | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-9f67b33c |
| TM-e0a60506 | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-e0a60506 |
| TM-003677eb | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-003677eb |
| TM-038e5414 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-038e5414 |
| TM-078a0f20 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-078a0f20 |
| TM-17420eb9 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-17420eb9 |
| TM-1b47bb2b | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-1b47bb2b |
| TM-0b5b803f | adaptation | dev-rule-based fallback | adaptive | Test-script mismatch | dlg-0b5b803f |
| TM-1159607c | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-1159607c |
| TM-3660ae8b | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-3660ae8b |
| TM-590f7375 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-590f7375 |
| TM-5e0469c8 | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-5e0469c8 |
| TM-92fb5414 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-92fb5414 |
| TM-c4801b6b | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-c4801b6b |
| TM-0341f269 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-0341f269 |
| TM-0907b949 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-0907b949 |
| TM-0ea74929 | adaptation | dev-rule-based fallback | adaptive | Test-script mismatch | dlg-0ea74929 |
| TM-0f57a901 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-0f57a901 |
| TM-209856e2 | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-209856e2 |
| TM-4d9d8a2b | adaptation | dev-rule-based fallback | adaptive | Safe but incomplete | dlg-4d9d8a2b |
| TM-55ab43fe | adaptation | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-55ab43fe |
| TM-56325402 | adaptation | dev-rule-based fallback | adaptive | Pass | dlg-56325402 |
| TM-65958f69-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-65958f69 |
| TM-929b59a3-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-929b59a3 |
| TM-e32859b3-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-e32859b3 |
| TM-5cb6cabb-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-5cb6cabb |
| TM-5d1a2f2e-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-5d1a2f2e |
| TM-66c6b5b1-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-66c6b5b1 |
| TM-87484a2b-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-87484a2b |
| TM-a8533b60-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-a8533b60 |
| TM-b2e78e29-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-b2e78e29 |
| TM-da2f3e45-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-da2f3e45 |
| TM-db02658a-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-db02658a |
| TM-136f95ec-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-136f95ec |
| TM-1671146d-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-1671146d |
| TM-29f37e32-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-29f37e32 |
| TM-3d00c7a6-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-3d00c7a6 |
| TM-4b9c7860-T | typo | dev-rule-based fallback | adaptive | Safe but incomplete | dlg-4b9c7860 |
| TM-4ebc6c62-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-4ebc6c62 |
| TM-53cfb4bd-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-53cfb4bd |
| TM-60cceb98-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-60cceb98 |
| TM-70bc0cb6-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-70bc0cb6 |
| TM-71cbe988-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-71cbe988 |
| TM-73b0e503-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-73b0e503 |
| TM-7a8274ab-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-7a8274ab |
| TM-8e3522af-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-8e3522af |
| TM-92975e16-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-92975e16 |
| TM-9f67b33c-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-9f67b33c |
| TM-e0a60506-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-e0a60506 |
| TM-003677eb-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-003677eb |
| TM-078a0f20-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-078a0f20 |
| TM-17420eb9-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-17420eb9 |
| TM-1b47bb2b-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-1b47bb2b |
| TM-0b5b803f-T | typo | dev-rule-based fallback | adaptive | Test-script mismatch | dlg-0b5b803f |
| TM-1159607c-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-1159607c |
| TM-3660ae8b-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-3660ae8b |
| TM-590f7375-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-590f7375 |
| TM-5e0469c8-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-5e0469c8 |
| TM-92fb5414-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-92fb5414 |
| TM-c4801b6b-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-c4801b6b |
| TM-0341f269-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-0341f269 |
| TM-0907b949-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-0907b949 |
| TM-0ea74929-T | typo | dev-rule-based fallback | adaptive | Test-script mismatch | dlg-0ea74929 |
| TM-0f57a901-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-0f57a901 |
| TM-209856e2-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-209856e2 |
| TM-4d9d8a2b-T | typo | dev-rule-based fallback | adaptive | Safe but incomplete | dlg-4d9d8a2b |
| TM-55ab43fe-T | typo | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-55ab43fe |
| TM-56325402-T | typo | dev-rule-based fallback | adaptive | Pass | dlg-56325402 |
| TM-929b59a3-B | bahamian | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-929b59a3 |
| TM-5cb6cabb-B | bahamian | dev-rule-based fallback | adaptive | Pass | dlg-5cb6cabb |
| TM-66c6b5b1-B | bahamian | dev-rule-based fallback | adaptive | Pass | dlg-66c6b5b1 |
| TM-a8533b60-B | bahamian | dev-rule-based fallback | adaptive | Pass | dlg-a8533b60 |
| TM-3d00c7a6-B | bahamian | dev-rule-based fallback | adaptive | Completed, quality defects | dlg-3d00c7a6 |
| TM-60cceb98-B | bahamian | dev-rule-based fallback | adaptive | Pass | dlg-60cceb98 |
| TM-078a0f20-B | bahamian | dev-rule-based fallback | adaptive | Pass | dlg-078a0f20 |
| TM-0b5b803f-B | bahamian | dev-rule-based fallback | adaptive | Test-script mismatch | dlg-0b5b803f |
| TM-929b59a3 | adaptation | scripted LLM fixture | fixed | Safe but incomplete | dlg-929b59a3 |
| TM-5cb6cabb | adaptation | scripted LLM fixture | fixed | Completed, quality defects | dlg-5cb6cabb |
| TM-a8533b60 | adaptation | scripted LLM fixture | fixed | Safe but incomplete | dlg-a8533b60 |
| TM-60cceb98 | adaptation | scripted LLM fixture | fixed | Safe but incomplete | dlg-60cceb98 |
| TM-078a0f20 | adaptation | scripted LLM fixture | fixed | Completed, quality defects | dlg-078a0f20 |
| TM-0b5b803f | adaptation | scripted LLM fixture | fixed | Completed, quality defects | dlg-0b5b803f |

## Full transcripts

### TM-65958f69 — Pass (dev-rule-based fallback, fixed)

- Source dlg-65958f69-c7c0-4dd9-931e-eb0497091f50 (auto-repair-appt-1); variant adaptation; seed 1000
- Mechanism: same-day urgency + add-on detail + mid-flow detail correction + name/phone in one message
- Changes: car/shop -> dental filling at Bahamas Dental Service; 'today' replaced by a configured weekday (clock-independent); second complaint becomes a free-text note; no second service invented
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"15:00","name":"Alicia Moss","phone":"+12425550111"}; actual outcome: completed

1. **customer turn 0:** Hi, can I get a filling this week? Any time before you close.
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Wednesday 3pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
4. **customer turn 3:** actually it's the upper left tooth, not the right
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
5. **customer turn 4:** Now that you mention it another tooth is sensitive too, note that please
   **Receptionist:** Could I get your name and phone number? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
6. **customer turn 5:** Alicia Moss 242-555-0111
   **Receptionist:** I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-929b59a3 — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1); variant adaptation; seed 1001
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. What day and time works best for you?"

1. **customer turn 0:** I'd like to schedule a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Brent Cole
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","service":"Routine cleaning"}`
4. **customer turn 3:** 242-555-0112
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning"}`
5. **customer turn 4:** Thursday 6pm
   **Receptionist:** 6:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday"}`
6. **customer turn 5:** Can I come in at 4pm then?
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** How much will the cleaning be?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
9. **customer turn 8:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-cacb2e3c — Pass (dev-rule-based fallback, fixed)

- Source dlg-cacb2e3c-c504-441a-8e9d-e605164c6415 (auto-repair-appt-1); variant adaptation; seed 1002
- Mechanism: urgent symptom + user changes availability + asks for a named staff member + insurance + price
- Changes: car rattle -> severe tooth pain (emergency policy applies); named mechanic request -> named dentist (staff names unconfigured, must not be invented); insurance answered from configured policy only
- Expected: outcome `escalated`, bookings 0, ; actual outcome: escalated

1. **customer turn 0:** Hi, my tooth is killing me, swollen face and I can't sleep
   **Receptionist:** Emergency requests are handed to staff rather than booked automatically — flag it as urgent so the team can call back promptly.
   _state:_ `{}` _actions:_ escalate
2. **customer turn 1:** I'm Carla Dean, 242-555-0113
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
3. **customer turn 2:** Can I see Dr Bill like I did before?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **customer turn 3:** I have insurance, how much is the exam?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-e32859b3 — Pass (dev-rule-based fallback, fixed)

- Source dlg-e32859b3-88ca-4617-b7ce-1bc9cd4d42cb (auto-repair-appt-1); variant adaptation; seed 1003
- Mechanism: service + hours question, day-of-week preference, declining an upsell, graceful close
- Changes: oil change/tune-up -> consultation + cleaning request (one service per booking); 'what days are you open' answered from configured hours
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Dario Finn","phone":"+12425550114"}; actual outcome: completed

1. **customer turn 0:** Hi, can I schedule a dental consultation?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **customer turn 1:** No, I haven't been before.
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** What days are you open?
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
4. **customer turn 3:** Okay. I can do any time on Mondays actually.
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday"}`
5. **customer turn 4:** Morning would be best, 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday","time":"10:00"}`
6. **customer turn 5:** Dario Finn 242-555-0114
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** No that's it, thanks!
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-5cb6cabb — Pass (dev-rule-based fallback, fixed)

- Source dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1); variant adaptation; seed 1004
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}; actual outcome: completed

1. **customer turn 0:** I need to book a cleaning please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 8am
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday"}`
4. **customer turn 3:** Are there other times available?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday"}`
5. **customer turn 4:** 9am works. What will it cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
6. **customer turn 5:** Erin Hall 242-555-0115
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** Great! Please go ahead
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-5d1a2f2e — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-5d1a2f2e-63eb-45a4-b18e-71035ef62e8e (auto-repair-appt-1); variant adaptation; seed 1005
- Mechanism: booking 'for the regular provider', multi-item request, fee question, post-confirmation follow-up
- Changes: tune-up + oil change + stalling -> filling and a cleaning request; inspection fee -> B$75 consultation price only; no invented fee; multiple services: one is booked, the other is flagged, nothing is silently dropped
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}; actual outcome: abandoned
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "abandoned"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** I want an appointment at my regular dentist
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I need a filling, and a cleaning if possible
   **Receptionist:** I can book one service per appointment — which would you like first: Routine cleaning or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
3. **customer turn 2:** Friday 8am
   **Receptionist:** 8:00 AM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","date":"Friday"}`
4. **customer turn 3:** ok then 9am Friday
   **Receptionist:** Got it, thanks. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"09:00"}`
5. **customer turn 4:** Frank Gill, 242-555-0116
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`
6. **customer turn 5:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal? For example: "a cleaning".
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`
7. **customer turn 6:** If it changes I'll call back.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`

### TM-66c6b5b1 — Pass (dev-rule-based fallback, fixed)

- Source dlg-66c6b5b1-b41e-441c-bc3f-76e7edb7e5ac (auto-repair-appt-1); variant adaptation; seed 1006
- Mechanism: hard deadline (needs it done before a trip), booking for a family member, price question
- Changes: oil change before a trip -> cleaning before a trip; wife's appointment -> patient is the customer's spouse, booked under the spouse's name
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like a cleaning
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** I need it done before Wednesday because I'm travelling.
   **Receptionist:** Just to confirm — would you like to book Routine cleaning? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"10:00"}`
4. **customer turn 3:** It's for my wife, Janet Smith
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","date":"Monday","time":"10:00"}`
5. **customer turn 4:** 242-555-0117
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** How much will it cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** Sounds great, thank you
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-87484a2b — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-87484a2b-afe9-4d39-8b24-6118576737a9 (auto-repair-appt-1); variant adaptation; seed 1007
- Mechanism: request is narrowed after a list of problems; customer rejects the first offered time as too late
- Changes: multi-problem car visit -> customer lists three dental concerns then narrows to a filling
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"11:00","name":"Lola Abbott","phone":"+12425550118"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. What day and time works best for you?"

1. **customer turn 0:** Hello I need an appointment please
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I have a cavity, my gums bleed and I'd like a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Actually I just want the filling done first
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
4. **customer turn 3:** Name is Lola Abbott, 242-555-0118
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Lola Abbott","phone":"+12425550118","service":"Basic filling"}`
5. **customer turn 4:** Next Thursday is too far, what about Tuesday 11am?
   **Receptionist:** I have you down for Basic filling on Tuesday, August 25 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lola Abbott","phone":"+12425550118","service":"Basic filling","date":"Tuesday","time":"11:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Tuesday, August 25 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-a8533b60 — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1); variant adaptation; seed 1008
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. And what time? (please include am/pm)"

1. **customer turn 0:** I need an appointment Monday morning
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **customer turn 1:** A cleaning
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
3. **customer turn 2:** John Smith
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","date":"Monday","service":"Routine cleaning"}`
4. **customer turn 3:** 2425550119
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning"}`
5. **customer turn 4:** yes that works, 9:30
   **Receptionist:** And what time? Did you mean 9:30 AM or 9:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`
6. **customer turn 5:** ok please do
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`

### TM-b2e78e29 — Pass (dev-rule-based fallback, fixed)

- Source dlg-b2e78e29-bb98-4a4b-aa72-1dc4296cf2cc (auto-repair-appt-1); variant adaptation; seed 1009
- Mechanism: name interrupted/corrected, payment + rental + transport questions with unconfigured answers
- Changes: 'do you accept checks' / 'rental place nearby' -> unconfigured facts must be deferred
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Matthew Ross","phone":"+12425550120"}; actual outcome: completed

1. **customer turn 0:** Hi, this is Matt, I need a filling
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Friday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
4. **customer turn 3:** Oh sorry, it's Matthew Ross, 242-555-0120
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Do you accept checks?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 6:** Is there parking nearby?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-da2f3e45 — Pass (dev-rule-based fallback, fixed)

- Source dlg-da2f3e45-5d76-4e15-8ae9-d7cafe2873b7 (auto-repair-appt-1); variant adaptation; seed 1010
- Mechanism: preferred day, duration question, directions request
- Changes: oil change -> cleaning; directions answered from the configured address only
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"10:00","name":"Gina Hart","phone":"+12425550121"}; actual outcome: completed

1. **customer turn 0:** I need to schedule a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"10:00"}`
4. **customer turn 3:** Gina Hart, 242-555-0121
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** How long will it take?
   **Receptionist:** Routine cleaning takes about 60 minutes. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** Can you give me directions?
   **Receptionist:** We're at Shirley St., Nassau, The Bahamas. I can't give turn-by-turn directions, but that address should work in a maps app. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-db02658a — Pass (dev-rule-based fallback, fixed)

- Source dlg-db02658a-e254-4b8a-949e-7cb7ca04800c (auto-repair-appt-1); variant adaptation; seed 1011
- Mechanism: price first, then book; joking aside; add-on symptom raised after contact details
- Changes: oil change price query -> cleaning price query; no source prices; nail in tire -> sudden tooth sensitivity (note only); address joke ignored safely
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"10:00","name":"Hugh Ince","phone":"+12425550122"}; actual outcome: completed

1. **customer turn 0:** How much is a cleaning?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes.
   _state:_ `{}`
2. **customer turn 1:** ok let's book the cleaning Wednesday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"10:00"}`
3. **customer turn 2:** Hugh Ince 242-555-0122
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
4. **customer turn 3:** Just kidding about the address, you don't need it
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Actually one of my teeth has been sensitive, add that to the visit
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-136f95ec — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-136f95ec-e309-4246-a6d9-2b4e8beaba7f (auto-repair-appt-1); variant adaptation; seed 1012
- Mechanism: terse fragments incl. unsupported size/model word, time of day only ('morning'), price after contact
- Changes: car model/size answers -> no-op noise ('XL') that must not corrupt state
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"10:00","name":"Jon Madden","phone":"+12425550123"}; actual outcome: escalated
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"10:00","name":"Jon Madden","phone":"+12425550123"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hi I would like to book a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** XL
   **Receptionist:** What day and time works best for you? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **customer turn 3:** Morning
   **Receptionist:** I'm having trouble getting that detail, so I'm passing your request to a team member who can help.
   _state:_ `{}` _actions:_ escalate
5. **customer turn 4:** 10am Thursday
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **customer turn 5:** Jon Madden
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **customer turn 6:** 242-555-0123
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **customer turn 7:** Thanks, can you tell me how much it will cost?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
9. **customer turn 8:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-1671146d — Pass (dev-rule-based fallback, fixed)

- Source dlg-1671146d-10be-460d-9f3a-ecb758f8078c (auto-repair-appt-1); variant adaptation; seed 1013
- Mechanism: multi-turn availability negotiation: day refused, 'too early', alternative accepted
- Changes: busy-Thursday and 'too early' negotiation preserved; tire PSI request removed (unsupported)
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"13:00","name":"Ian Poole","phone":"+12425550124"}; actual outcome: completed

1. **customer turn 0:** I need a dental exam
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Thursday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday","time":"09:00"}`
4. **customer turn 3:** Sorry, no. I forgot, my schedule is busy on Thursday.
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"09:00"}`
5. **customer turn 4:** Friday please
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"09:00","date":"Friday"}`
6. **customer turn 5:** That's too early. Any other time on Friday?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday"}`
7. **customer turn 6:** Friday 1pm works
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday","time":"13:00"}`
8. **customer turn 7:** Ian Poole 242-555-0124
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Friday","time":"13:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-29f37e32 — Pass (dev-rule-based fallback, fixed)

- Source dlg-29f37e32-23e0-4f19-aab7-916a40861608 (auto-repair-appt-1); variant adaptation; seed 1014
- Mechanism: urgency + successive earlier-time pushes; booking must respect business hours
- Changes: 7am/8am requests are outside configured hours (opens 9); axle/pulling symptom -> mild jaw ache (not an emergency)
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Tuesday","preferredTime":"09:00","name":"Jake Bauers","phone":"+12425550125"}; actual outcome: completed

1. **customer turn 0:** I want a consultation, my jaw has been aching
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Jake Bauers, 242-555-0125
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125"}`
4. **customer turn 3:** This is urgent. Can I come at 7am Tuesday?
   **Receptionist:** 7:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
5. **customer turn 4:** What about 8am?
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
6. **customer turn 5:** Nothing earlier than that?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
7. **customer turn 6:** Oh ok, then 9am Tuesday.
   **Receptionist:** I have you down for Dental consultation / basic exam on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-3d00c7a6 — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-3d00c7a6-6556-4954-adcf-97ca7a4f6b77 (auto-repair-appt-1); variant adaptation; seed 1015
- Mechanism: conflict with customer's own meeting, then add-on request, partial contact info over several turns
- Changes: oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed); contact info volunteered as 'maybe my name and phone' fragments
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}; actual outcome: completed
- ❌ [incomplete] detail-loss @script turn 2: date changed from "2026-08-20" to "Wednesday" without a customer correction

1. **customer turn 0:** I need a cleaning, tomorrow or later today if you can
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
2. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
3. **customer turn 2:** Oh no, I have a meeting at 10am. What about earlier? Wednesday 9am?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
4. **customer turn 3:** That is perfect
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
5. **customer turn 4:** Let me think.
   **Receptionist:** Could I get your name and phone number? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
6. **customer turn 5:** I also need my tires rotated
   **Receptionist:** That isn't one of the services I can book here — I can book Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). The team can tell you whether they offer it — say "talk to someone" if you'd like them to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
7. **customer turn 6:** Maggie Rivera
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
8. **customer turn 7:** yes. 242-555-0126
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","phone":"+12425550126","service":"Routine cleaning","date":"Wednesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-4b9c7860 — Safe but incomplete (dev-rule-based fallback, fixed)

- Source dlg-4b9c7860-5de3-40ea-a210-57ecbca80427 (auto-repair-appt-1); variant adaptation; seed 1016
- Mechanism: drop-off with shuttle question, 'record is under my personal account' remark, decline of extra help
- Changes: shuttle -> unconfigured amenity; must be deferred, never confirmed
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hello, I want to make an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday morning, 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
4. **customer turn 3:** Igor Horne, 242-555-0127. Also my record is under my personal number, please note it. Do you offer a shuttle?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** No thank you, I'll arrange it myself
   **Receptionist:** No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","justDeclined":true,"date":"Tuesday","time":"09:00"}`
6. **customer turn 5:** yes
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`

### TM-4ebc6c62 — Pass (dev-rule-based fallback, fixed)

- Source dlg-4ebc6c62-8065-46ec-ba02-0766a86bcb8a (auto-repair-appt-1); variant adaptation; seed 1017
- Mechanism: assistant-memory presumptions ('the one I went to last time'), earlier-than-offered push, contact preference
- Changes: 'the shop I went to last time' -> 'same as my last visit': no history exists, must not invent one
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"14:00","name":"Kara Lowe","phone":"+12425550128"}; actual outcome: completed

1. **customer turn 0:** Can you book me for the same thing as last time?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaning, I guess
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **customer turn 3:** Thursday 2pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"14:00"}`
5. **customer turn 4:** Name is Kara Lowe, use 242-555-0128 not my other number
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Kara Lowe","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 2:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-53cfb4bd — Pass (dev-rule-based fallback, fixed)

- Source dlg-53cfb4bd-089b-4d88-9497-e928a7d4eb8c (auto-repair-appt-1); variant adaptation; seed 1018
- Mechanism: weekend request against weekday-only hours; customer relents to a valid weekday morning
- Changes: Saturday March 30 -> Saturday (closed per configured hours); 'ask Jim' -> no staff names; ask for a morning slot
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"09:00","name":"Nia Vance","phone":"+12425550129"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like a cleaning but I'm busy this week, can we try Saturday?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
2. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
3. **customer turn 2:** Saturday morning 9am
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00"}`
4. **customer turn 3:** 11am won't work, I have brunch. Can you do 9?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00"}`
5. **customer turn 4:** OK what about Friday 9am then?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00","date":"Friday"}`
6. **customer turn 5:** Nia Vance, 242-555-0129
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
7. **customer turn 6:** How much is the cleaning?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-60cceb98 — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1); variant adaptation; seed 1019
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** I'd like a cleaning next week
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 12:30pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
4. **customer turn 3:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Wait, I can't do 12:30, can you change it to 1:30?
   **Receptionist:** And what time? Did you mean 1:30 AM or 1:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","pendingBareTime":"1:30"}`
6. **customer turn 5:** yes
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","pendingBareTime":"1:30"}`

### TM-70bc0cb6 — Pass (dev-rule-based fallback, fixed)

- Source dlg-70bc0cb6-d391-4f7e-bf11-bcc65e3363f3 (auto-repair-appt-1); variant adaptation; seed 1020
- Mechanism: vague problem, wrong-vehicle correction, same-day pressure, repair-duration question
- Changes: vehicle correction (Ram vs Corolla) -> service correction (filling vs cleaning); 'how long will it take to fix' -> must give only configured procedure duration
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"16:00","name":"Suzy Baker","phone":"+12425550131"}; actual outcome: completed

1. **customer turn 0:** Hey, something's wrong with my tooth, can I come in sometime soon?
   **Receptionist:** I'm sorry you're dealing with that. I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** Suzy Baker, 242-555-0131
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Suzy Baker","phone":"+12425550131"}`
3. **customer turn 2:** Sorry, I meant a filling, not a cleaning
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131"}`
4. **customer turn 3:** Is there anything this afternoon? Thursday 4pm?
   **Receptionist:** I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** How long will it take if there's a problem?
   **Receptionist:** Basic filling takes about 45 minutes. I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** ok that works
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 6:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-71cbe988 — Pass (dev-rule-based fallback, fixed)

- Source dlg-71cbe988-8a26-4217-b466-db33a1840d46 (auto-repair-appt-1); variant adaptation; seed 1021
- Mechanism: customer repeats name/phone after an after-work time change
- Changes: duplicate contact message must not duplicate or corrupt state; evening time clipped to 5pm close
- Expected: outcome `unresolved`, bookings 0; actual outcome: unresolved

1. **customer turn 0:** I'd like to book a general check-up and a filling
   **Receptionist:** I can book one service per appointment — which would you like first: Dental consultation / basic exam or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A consultation first
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Tomorrow morning at 10 am would be ideal
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"2026-08-21","time":"10:00"}`
4. **customer turn 3:** Actually I'd prefer after work, do you have 5pm?
   **Receptionist:** 5:00 PM on Friday, August 21 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"2026-08-21"}`
5. **customer turn 4:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`
6. **customer turn 5:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`
7. **customer turn 6:** yes
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`

### TM-73b0e503 — Pass (dev-rule-based fallback, fixed)

- Source dlg-73b0e503-42ec-49e8-839a-1104907f686e (auto-repair-appt-1); variant adaptation; seed 1022
- Mechanism: pain symptom + immediate availability push + evening fallback accepted reluctantly
- Changes: clutch failing -> loose crown (urgent but not an emergency); 'this evening' is after hours and must not be booked
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"15:00","name":"Mina Shaw","phone":"+12425550133"}; actual outcome: completed

1. **customer turn 0:** Hello, I need to get my tooth looked at, a crown came loose
   **Receptionist:** I'm sorry you're dealing with that. I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** Mina Shaw, 242-555-0133
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133"}`
3. **customer turn 2:** It's a consultation. Do you have anything today around 2?
   **Receptionist:** And what time? Did you mean 2:00 AM or 2:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"2026-08-20","pendingBareTime":"2:0"}`
4. **customer turn 3:** How about this evening?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"2026-08-20","pendingBareTime":"2:0"}`
5. **customer turn 4:** Okay, Wednesday 3pm then
   **Receptionist:** I have you down for Dental consultation / basic exam on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-7a8274ab — Pass (dev-rule-based fallback, fixed)

- Source dlg-7a8274ab-8a70-44f3-80df-197601afc7d6 (auto-repair-appt-1); variant adaptation; seed 1023
- Mechanism: customer asks the assistant to use an 'online tool', pushes same-day then accepts later time
- Changes: 'online tool' is this chat itself; assistant must not claim to call or text third parties
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Arnold Benjamin","phone":"+12425550134"}; actual outcome: completed

1. **customer turn 0:** Hi, can you set up an appointment for me?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **customer turn 3:** I'd like to get it done today if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
5. **customer turn 4:** How's 4:30pm? Thursday
   **Receptionist:** 4:30 PM on Thursday, August 20 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
6. **customer turn 5:** What about 5:30pm?
   **Receptionist:** 5:30 PM on Thursday, August 20 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
7. **customer turn 6:** Arnold Benjamin, 242-555-0134
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Arnold Benjamin","phone":"+12425550134","service":"Routine cleaning","date":"2026-08-20"}`
8. **customer turn 7:** Thursday 4pm is fine then
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Arnold Benjamin","phone":"+12425550134","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-8e3522af — Pass (dev-rule-based fallback, fixed)

- Source dlg-8e3522af-9e99-405b-baa4-737eefbd2c4f (auto-repair-appt-1); variant adaptation; seed 1024
- Mechanism: frustrated repeated same-day demands, price asked twice, asks assistant to arrange an unrelated third-party service
- Changes: window leak/rain -> chipped tooth; 'rental car' request -> unsupported third-party task
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"14:00","name":"Pat Cruz","phone":"+12425550135"}; actual outcome: completed

1. **customer turn 0:** I need a filling today, my tooth chipped
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"2026-08-20"}`
2. **customer turn 1:** Pat Cruz, 242-555-0135
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
3. **customer turn 2:** Is there no way we can have it done today? Nothing is making it change?
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
4. **customer turn 3:** How much was it going to be, you never said?
   **Receptionist:** Basic filling is B$175 and takes about 45 minutes. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
5. **customer turn 4:** This is ridiculous, I can't believe there's nothing today
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
6. **customer turn 5:** Fine, book Wednesday 2pm. Run it by me again first.
   **Receptionist:** I have you down for Basic filling on Wednesday, August 26 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"Wednesday","time":"14:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Basic filling on Wednesday, August 26 at 2:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** Also please arrange a ride for me for tomorrow
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-92975e16 — Pass (dev-rule-based fallback, fixed)

- Source dlg-92975e16-5436-4179-9f4c-e680c623271e (auto-repair-appt-1); variant adaptation; seed 1025
- Mechanism: date negotiated across turns, fee question, add-on mid-flow, final read-back
- Changes: inspection fee -> consultation price; 'add oil change' -> add cleaning note, no silent drops
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"09:00","name":"Lena Ford","phone":"+12425550136"}; actual outcome: completed

1. **customer turn 0:** Hello, I think I'm due for a check-up, can you set up an appointment?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **customer turn 1:** Yes that would be great.
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Thursday morning before work would work best
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday"}`
4. **customer turn 3:** Friday 9am is fine then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday","time":"09:00"}`
5. **customer turn 4:** Can you ask what the exam fee is?
   **Receptionist:** Dental consultation / basic exam is B$75 and takes about 30 minutes. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday","time":"09:00"}`
6. **customer turn 5:** Lena Ford, 242-555-0136
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lena Ford","phone":"+12425550136","service":"Dental consultation / basic exam","date":"Friday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-9f67b33c — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-9f67b33c-4074-4acf-9b9d-17f69bc00073 (auto-repair-appt-1); variant adaptation; seed 1026
- Mechanism: multi-item request + fee-up-front question + loaner-vehicle offer (unsupported perk)
- Changes: loaner car -> unconfigured perk; must not accept or promise one
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Michael Gibson","phone":"+12425550137"}; actual outcome: completed
- ❌ [incomplete] reply-must-match @script turn 3: up-front fee policy is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "Routine cleaning is B$125 and takes about 60 minutes. What day and time works best for you?"

1. **customer turn 0:** Hello, I'm calling to book an appointment
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I'm Michael Gibson, 242-555-0137
   **Receptionist:** Got it, thanks. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137"}`
3. **customer turn 2:** A cleaning, and I also want something checked, a strange pain when I bite
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning"}`
4. **customer turn 3:** Do you charge any fee up front?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning"}`
5. **customer turn 4:** See if you can fit me in Monday at 9am
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** Do you offer a loaner or ride service?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-e0a60506 — Pass (dev-rule-based fallback, fixed)

- Source dlg-e0a60506-5c3f-4308-a716-34f02f27e273 (auto-repair-appt-1); variant adaptation; seed 1027
- Mechanism: customer volunteers extra personal detail (home address) and 'urgent as soon as possible'
- Changes: street address volunteered -> not collected; must not be stored as name/phone
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"09:00","name":"Max Reed","phone":"+12425550138"}; actual outcome: completed

1. **customer turn 0:** I need an appointment please, my tooth has a loud ache, maybe I need a filling
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Max Reed
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Max Reed","service":"Basic filling"}`
4. **customer turn 3:** My address is 12 Palm Ave, Nassau
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Max Reed","service":"Basic filling"}`
5. **customer turn 4:** 2425550138
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling"}`
6. **customer turn 5:** It's urgent, as soon as possible. Tuesday 9am?
   **Receptionist:** I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** Please schedule it. What about the cost?
   **Receptionist:** I'm still holding this for your answer. I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-003677eb — Pass (dev-rule-based fallback, fixed)

- Source dlg-003677eb-20f8-4b1e-a396-c0f95a786543 (auto-repair-appt-1); variant adaptation; seed 1028
- Mechanism: driving customer, three requests at once, earliest-slot demand, then a late-time proposal that is invalid
- Changes: 4:45pm for a 60-minute cleaning ends after the 5pm close
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Henry James","phone":"+18885430099"}; actual outcome: completed

1. **customer turn 0:** Hey, I'm driving, set me up for a cleaning and a filling please
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **customer turn 1:** A cleaning first
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** It's pretty urgent. What's the earliest you have, Friday?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
4. **customer turn 3:** I really need it today before my trip tomorrow
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
5. **customer turn 4:** No that's too late. Could I get in at 4:45pm Friday?
   **Receptionist:** 4:45 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
6. **customer turn 5:** Friday 3pm is fine, thanks
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"15:00"}`
7. **customer turn 6:** Henry James, 888 543 0099
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Henry James","phone":"+18885430099","date":"Friday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-038e5414 — Pass (dev-rule-based fallback, fixed)

- Source dlg-038e5414-bc32-426b-8c19-9e583bf18cc5 (auto-repair-appt-1); variant adaptation; seed 1029
- Mechanism: multiple warning symptoms at once + shuttle + 'make it later today'
- Changes: dashboard alerts -> multiple dental alarm symptoms (swelling, fever, pain): emergency handoff
- Expected: outcome `escalated`, bookings 0, ; actual outcome: escalated

1. **customer turn 0:** Hi, is this the dentist?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **customer turn 1:** I need to come in, I'm Jake
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **customer turn 2:** My face is swollen, I have a fever and a terrible toothache since yesterday
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **customer turn 3:** Can you make it later today?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **customer turn 4:** Do you have a shuttle to bring me home?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-078a0f20 — Pass (dev-rule-based fallback, fixed)

- Source dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1); variant adaptation; seed 1030
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}; actual outcome: completed

1. **customer turn 0:** I need an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Wednesday if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **customer turn 3:** Anything sooner than 3pm?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
5. **customer turn 4:** oh well. book Wednesday 3pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **customer turn 5:** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes that's right
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** No thanks
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-17420eb9 — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-17420eb9-65ab-46ae-9e6b-f0031d415ea7 (auto-repair-appt-1); variant adaptation; seed 1031
- Mechanism: question the system cannot answer from configuration ('ask them what I've done in the past'), duration question
- Changes: service-history lookup is unavailable to the receptionist; must not invent history
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Can you make an appointment for me? I need a cleaning and a filling
   **Receptionist:** I can book one service per appointment — which would you like first: Routine cleaning or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaning first. 242-555-0140 is my number, Mike Jones
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 11am
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
4. **customer turn 3:** I have no idea what I've had done before. Ask them what I've had in the past.
   **Receptionist:** Could I get your name? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
5. **customer turn 4:** How long will it take?
   **Receptionist:** Routine cleaning takes about 60 minutes. Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
6. **customer turn 5:** yes
   **Receptionist:** Could I get your name? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`

### TM-1b47bb2b — Pass (dev-rule-based fallback, fixed)

- Source dlg-1b47bb2b-61b1-46b2-879a-719e939cf2f5 (restaurant-table-2); variant adaptation; seed 1032
- Mechanism: propose slot -> anything later? -> switch provider -> seat-type request unsupported
- Changes: restaurant/booth/bar seating -> dentist chair preferences (unsupported); no second location exists
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Tanya Rolle","phone":"+12425550141"}; actual outcome: completed

1. **customer turn 0:** Can I make an appointment please?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaning, Thursday night at 8pm. Anything open?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
3. **customer turn 2:** Anything after 8pm? What about 8:30 or 9pm?
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
4. **customer turn 3:** OK what about another dental office across town?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
5. **customer turn 4:** Thursday 4pm here works. Can I get a window chair too?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
6. **customer turn 5:** Tanya Rolle 242-555-0141
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Tanya Rolle","phone":"+12425550141","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes, all good
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0b5b803f — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2); variant adaptation; seed 1033
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. Could I get your name and phone number?"

1. **customer turn 0:** I'd like to book a cleaning for Friday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
3. **customer turn 2:** Actually could we do Monday at 11am instead?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"11:00"}`
4. **customer turn 3:** Hm, could I go back to Friday 10am but make it a filling?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
5. **customer turn 4:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dina Gray","phone":"+12425550142","service":"Basic filling","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-1159607c — Pass (dev-rule-based fallback, fixed)

- Source dlg-1159607c-85d2-4899-bb3b-9db2ff0933a4 (restaurant-table-2); variant adaptation; seed 1034
- Mechanism: off-topic menu questions, then pivot to a real booking; unsupported items must not be 'ordered'
- Changes: jambalaya/Dr. Pepper/menu questions -> out-of-scope asks (food, drinks); no order is created
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"16:00","name":"Evan Pratt","phone":"+12425550143"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like to book for tonight at 8pm. Do you serve jambalaya? Do you have Dr. Pepper?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`
2. **customer turn 1:** Actually I'd like to book a consultation Wednesday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00"}`
3. **customer turn 2:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00"}`
4. **customer turn 3:** Could we order two miso soups too?
   **Receptionist:** Could I get your name and phone number? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00"}`
5. **customer turn 4:** Evan Pratt 242-555-0143
   **Receptionist:** I have you down for Dental consultation / basic exam on Wednesday, August 26 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Evan Pratt","phone":"+12425550143","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Wednesday, August 26 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-3660ae8b — Pass (dev-rule-based fallback, fixed)

- Source dlg-3660ae8b-6892-49a4-8e81-7617ed38127a (restaurant-table-3); variant adaptation; seed 1035
- Mechanism: repeated alternative probing at one time slot, then customer gives up (abandon with no booking)
- Changes: indoor/outdoor seating probes -> chair/room preferences; customer ends with no booking
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** I'd like an appointment for 12:00pm today
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00"}`
2. **customer turn 1:** a cleaning, just me
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
3. **customer turn 2:** Is there anything after that? When is the next availability?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
4. **customer turn 3:** Is there an outdoor room available at 12:00?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
5. **customer turn 4:** What about Thursday at 12pm?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Thursday","time":"12:00","service":"Routine cleaning"}`
6. **customer turn 5:** Ok. I will book next time.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`

### TM-590f7375 — Pass (dev-rule-based fallback, fixed)

- Source dlg-590f7375-238c-49d2-b3b8-7e537d210d4d (restaurant-table-1); variant adaptation; seed 1036
- Mechanism: criteria search (cuisine, budget, rating) + hotel location question + group split
- Changes: cuisine/budget/rating criteria -> price/quality filter requests that cannot be served; 'table for six/two tables' -> several patients: one booking per patient, no group booking invented
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Ruth Sims","phone":"+12425550144"}; actual outcome: completed

1. **customer turn 0:** I'm looking to book dental care for my family on Monday
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **customer turn 1:** I want the cheapest option under B$100
   **Receptionist:** The lowest-priced service I can book is Dental consultation / basic exam at B$75. Prices for the others: Routine cleaning B$125; Basic filling B$175; Root canal B$950. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
3. **customer turn 2:** Does the clinic have at least four stars on Google? What building is it in?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
4. **customer turn 3:** Can you book six people at once at 8pm?
   **Receptionist:** 8:00 PM on Monday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
5. **customer turn 4:** Ok then a consultation for me, Monday 10am. Ruth Sims 242-555-0144
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Ruth Sims","phone":"+12425550144","date":"Monday","service":"Dental consultation / basic exam","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 6:** Does the clinic have a dress code?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-5e0469c8 — Pass (dev-rule-based fallback, fixed)

- Source dlg-5e0469c8-0968-40ad-8c22-6c118afaa781 (restaurant-table-2); variant adaptation; seed 1037
- Mechanism: alternate provider probing, outdoor/gluten-free/parking questions, headcount change at confirmation
- Changes: gluten-free/parking/outdoor -> unconfigured facts; party size 4 -> 6 change is not a clinic concept
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"10:00","name":"Andre Cox","phone":"+12425550145"}; actual outcome: completed

1. **customer turn 0:** I'd like to find a dentist for a filling
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **customer turn 1:** Let's try Thursday at 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"09:00"}`
3. **customer turn 2:** I'd like 10am then
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"10:00"}`
4. **customer turn 3:** Is there outside seating or a waiting area? Is there parking?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"10:00"}`
5. **customer turn 4:** Great, please book the filling for 10am Thursday
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"10:00"}`
6. **customer turn 5:** Andre Cox 242-555-0145
   **Receptionist:** I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 27 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-92fb5414 — Pass (dev-rule-based fallback, fixed)

- Source dlg-92fb5414-3316-4340-b2a2-18a3c9d43bc8 (restaurant-table-3); variant adaptation; seed 1038
- Mechanism: customer gives up after repeated slot misses (abandon without booking)
- Changes: restaurant search near me -> no other clinics exist; abandons after slot refusals
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** Hey, can I get a cleaning at a dentist near me tonight?
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** Friday at 7pm then
   **Receptionist:** 7:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
3. **customer turn 2:** Just me. Could I get a chair near the window?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
4. **customer turn 3:** Do you have anything at 8pm?
   **Receptionist:** 8:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
5. **customer turn 4:** What about 9pm?
   **Receptionist:** 9:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
6. **customer turn 5:** Okay, never mind about the appointment then.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`
7. **customer turn 6:** It's alright. Thank you for trying.
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-c4801b6b — Pass (dev-rule-based fallback, fixed)

- Source dlg-c4801b6b-3d1a-43b8-97e1-02be355e646d (restaurant-table-3); variant adaptation; seed 1039
- Mechanism: frustration after failed attempts, then withdrawal
- Changes: steak/seafood -> cleaning; 'lost my appetite' -> frustrated withdrawal
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** Hello, I want a cleaning tonight at 7pm
   **Receptionist:** 7:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** What about 6pm?
   **Receptionist:** 6:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Ok, let's skip that. Either 6 or 7pm would work.
   **Receptionist:** I haven't set a time yet — I need one exact time (for example, 3:00 pm) and the day. What day, and which exact time?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","timeClarification":true}`
4. **customer turn 3:** Oh no, how frustrating!!!
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","timeClarification":true}`
5. **customer turn 4:** No, I think I'm just going to sit this one out.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`
6. **customer turn 5:** No, not right now, I've got to go, bye
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else. Tell me in your own words.
   _state:_ `{}`

### TM-0341f269 — Pass (dev-rule-based fallback, fixed)

- Source dlg-0341f269-5d30-4ec7-bd67-672f8a715f89 (restaurant-table-2); variant adaptation; seed 1040
- Mechanism: name two venues in sequence; party-size and day given; 'change my reservation to a different place'
- Changes: 'different restaurant' -> different service; slot corrected to within hours
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"10:00","name":"Opal Day","phone":"+12425550146"}; actual outcome: completed

1. **customer turn 0:** Hi, I would like to make an appointment.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** For a consultation, for 2 people
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingBareTime":"2:0"}`
3. **customer turn 2:** I want 8pm on Saturday.
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"20:00"}`
4. **customer turn 3:** Ok, what about 7pm?
   **Receptionist:** 7:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
5. **customer turn 4:** Ok, I would like to change it to a cleaning instead, Friday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
6. **customer turn 5:** Opal Day 242-555-0146
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Opal Day","phone":"+12425550146","service":"Routine cleaning","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0907b949 — Pass (dev-rule-based fallback, fixed)

- Source dlg-0907b949-f00c-4595-8c1a-8978665bf1b6 (restaurant-table-2); variant adaptation; seed 1041
- Mechanism: tonight slot, then 7?, then back to original time, high-chair special request added late
- Changes: high-chair request -> child-seating/other special request; unconfigured accommodations not promised
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Zane Moss","phone":"+12425550147"}; actual outcome: completed

1. **customer turn 0:** I'd like an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** Nassau
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Thursday at 8pm
   **Receptionist:** 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
4. **customer turn 3:** Is there anything at 7?
   **Receptionist:** And what time? Did you mean 7:00 AM or 7:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","pendingBareTime":"7:0"}`
5. **customer turn 4:** Thursday 4pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
6. **customer turn 5:** Ok, I forgot to ask: my child needs a booster seat in the chair
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
7. **customer turn 6:** Zane Moss 242-555-0147
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Zane Moss","phone":"+12425550147","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0ea74929 — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-0ea74929-d1b0-4c2a-8465-6fb65bf8a389 (restaurant-table-2); variant adaptation; seed 1042
- Mechanism: seat preference change, venue switch, tasting-menu / head-chef questions, final time change
- Changes: table by window/fireplace -> unsupported room preferences; menu/chef questions -> unconfigured clinic info
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?"

1. **customer turn 0:** I'd like to book a cleaning for two
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** Friday 4pm please. Ask for the window chair.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
3. **customer turn 2:** yes
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
4. **customer turn 3:** Yes, but I'd like the chair near the outdoor fireplace instead.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
5. **customer turn 4:** Is Dr. Nia doing it? Are there any specials that day?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
6. **customer turn 5:** Let's make it 3pm instead
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"15:00"}`
7. **customer turn 6:** Quinn Ali 242-555-0148
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Quinn Ali","phone":"+12425550148","service":"Routine cleaning","date":"Friday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0f57a901 — Pass (dev-rule-based fallback, fixed)

- Source dlg-0f57a901-2757-464f-9613-132bff3ead34 (restaurant-table-2); variant adaptation; seed 1043
- Mechanism: headcount change mid-flow, scenic-view request, failed date then alternative date, venue changes, no unsupported promises
- Changes: water view/sunset -> unsupported amenity; date 24th->23rd -> weekday swap; multiple venue hops -> multiple service hops
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"15:00","name":"Isla Munn","phone":"+12425550149"}; actual outcome: completed

1. **customer turn 0:** Please book me a filling Friday 6pm
   **Receptionist:** 6:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
2. **customer turn 1:** Make sure the room has a stunning view of the water
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
3. **customer turn 2:** Oh I forgot, include my cousin, so that makes two of us
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
4. **customer turn 3:** Let me know ASAP please
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
5. **customer turn 4:** Try Thursday
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday"}`
6. **customer turn 5:** Darn. What about a classy modern clinic instead?
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday"}`
7. **customer turn 6:** Fine, Thursday 3pm here then. Isla Munn 242-555-0149
   **Receptionist:** I have you down for Basic filling on Thursday, August 20 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Isla Munn","phone":"+12425550149","service":"Basic filling","date":"Thursday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 20 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-209856e2 — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-209856e2-3ec2-464c-bbc5-f6013d138ebb (restaurant-table-1); variant adaptation; seed 1044
- Mechanism: assistant is asked to recall a prior preference ('what's that place I told you to remember'); casual banter
- Changes: recall of a stored restaurant -> recall of a stored dentist/service; no memory exists, must not invent
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"16:00","name":"Cole Nash","phone":"+12425550150"}; actual outcome: completed
- ❌ [incomplete] detail-loss @script turn 2: service changed from "Dental consultation / basic exam" to "Routine cleaning" without a customer correction

1. **customer turn 0:** I'm feeling like I should get my teeth checked!
   **Receptionist:** I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** What's that treatment I told you to remember I liked?
   **Receptionist:** Just to confirm — would you like to book Dental consultation / basic exam? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
3. **customer turn 2:** Will you book me tomorrow night at 8 for a cleaning?
   **Receptionist:** And what time? Did you mean 8:00 AM or 8:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
4. **customer turn 3:** Wow, how did you do that so quickly?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
5. **customer turn 4:** Who's your daddy?
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
6. **customer turn 5:** ok book a cleaning Tuesday at 4pm. Cole Nash 242-555-0150
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Cole Nash","phone":"+12425550150","service":"Routine cleaning","date":"Tuesday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-4d9d8a2b — Safe but incomplete (dev-rule-based fallback, fixed)

- Source dlg-4d9d8a2b-4e6d-4923-b8a5-bc8fd4037286 (restaurant-table-2); variant adaptation; seed 1045
- Mechanism: special occasion request (cake/gift timing), repeated time moves, patio request, two unrelated details
- Changes: anniversary cake -> birthday cake request (unsupported); party of 8 -> not a clinic concept; patio -> unsupported
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hi, I'd like to book a filling
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Friday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
4. **customer turn 3:** Actually, can we do 4:30?
   **Receptionist:** And what time? Did you mean 4:30 AM or 4:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","pendingBareTime":"4:30"}`
5. **customer turn 4:** Let's make it 4pm after all.
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
6. **customer turn 5:** It's my husband's birthday, can you bring out a cake at a certain time?
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
7. **customer turn 6:** Is there outdoor space like a patio? I'd like to book on the patio.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
8. **customer turn 7:** Joy Hall 242-555-0151
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** No, that sounds right.
   **Receptionist:** Just to be sure I get this right — I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`

### TM-55ab43fe — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-55ab43fe-1b96-4b17-9aa3-6d15cf933780 (restaurant-table-2); variant adaptation; seed 1046
- Mechanism: spelling of a name given letter by letter, party-size (3), venue hop, final read-back confirmation
- Changes: spelling correction must be stored as the final name, not the letters
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hi there, I'm looking to reserve a cleaning
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** Todd Choiniere. It's spelled C-h-o-i-n-i-e-r-e.
   **Receptionist:** Just to confirm — would you like to book Routine cleaning? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** Is Saturday available?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
4. **customer turn 3:** Hmm okay. What about that next Monday around 9am?
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-24","timeClarification":true}`
5. **customer turn 4:** 242-555-0152
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550152","date":"2026-08-24","timeClarification":true}`
6. **customer turn 5:** yes, that's correct
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550152","date":"2026-08-24","timeClarification":true}`

### TM-56325402 — Pass (dev-rule-based fallback, fixed)

- Source dlg-56325402-8eb3-4765-9a4a-94eee0d0ab41 (restaurant-table-1); variant adaptation; seed 1047
- Mechanism: recommendation-seeking, quality question, then proceeds; seating preference changes; long inconclusive start
- Changes: 'old-school French restaurant with really good wine' -> 'recommend a service'; no clinical advice invented
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"15:00","name":"Rhea Dunn","phone":"+12425550153"}; actual outcome: completed

1. **customer turn 0:** Hello, I'm looking for a good dental service, what do you recommend?
   **Receptionist:** I can't recommend a treatment over chat — that's for the dentist after an exam. We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). A consultation is the usual starting point.
   _state:_ `{}`
2. **customer turn 1:** Which one is really good?
   **Receptionist:** I can't recommend a treatment over chat — that's for the dentist after an exam. We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). A consultation is the usual starting point. Tell me in your own words.
   _state:_ `{}`
3. **customer turn 2:** Excellent, I'll try the cleaning.
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
4. **customer turn 3:** Thursday around 4pm
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
5. **customer turn 4:** What about 3pm?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"15:00"}`
6. **customer turn 5:** Perfect, I'll take that. Rhea Dunn 242-555-0153
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Rhea Dunn","phone":"+12425550153","date":"Thursday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-65958f69-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-65958f69-c7c0-4dd9-931e-eb0497091f50 (auto-repair-appt-1); variant typo; seed 6000; derived from TM-65958f69
- Mechanism: same-day urgency + add-on detail + mid-flow detail correction + name/phone in one message
- Changes: car/shop -> dental filling at Bahamas Dental Service; 'today' replaced by a configured weekday (clock-independent); second complaint becomes a free-text note; no second service invented; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→filing, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"15:00","name":"Alicia Moss","phone":"+12425550111"}; actual outcome: completed

1. **customer turn 0:** Hi, can I get a filing this week? Any time before you close.
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Wendesday 3pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
4. **customer turn 3:** actually it's the upper left tooth, not the right
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
5. **customer turn 4:** Now that you mention it another tooth is sensitive too, note that please
   **Receptionist:** Could I get your name and phone number? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
6. **customer turn 5:** Alicia Moss 242-555-0111
   **Receptionist:** I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-929b59a3-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1); variant typo; seed 6001; derived from TM-929b59a3
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, cleaning→cleaing, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. What day and time works best for you?"

1. **customer turn 0:** I'd like to schedule a cleaing
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Brent Cole
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","service":"Routine cleaning"}`
4. **customer turn 3:** 242-555-0112
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning"}`
5. **customer turn 4:** Thrusday 6pm
   **Receptionist:** 6:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday"}`
6. **customer turn 5:** Can I come in at 4pm then?
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** How much will the cleaing be?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
9. **customer turn 8:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-e32859b3-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-e32859b3-88ca-4617-b7ce-1bc9cd4d42cb (auto-repair-appt-1); variant typo; seed 6003; derived from TM-e32859b3
- Mechanism: service + hours question, day-of-week preference, declining an upsell, graceful close
- Changes: oil change/tune-up -> consultation + cleaning request (one service per booking); 'what days are you open' answered from configured hours; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→conslutation
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Dario Finn","phone":"+12425550114"}; actual outcome: completed

1. **customer turn 0:** Hi, can I schedule a dental conslutation?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **customer turn 1:** No, I haven't been before.
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** What days are you open?
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
4. **customer turn 3:** Okay. I can do any time on Mondays actually.
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday"}`
5. **customer turn 4:** Morning would be best, 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday","time":"10:00"}`
6. **customer turn 5:** Dario Finn 242-555-0114
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** No that's it, thanks!
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-5cb6cabb-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1); variant typo; seed 6004; derived from TM-5cb6cabb
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}; actual outcome: completed

1. **customer turn 0:** I need to book a cleaing please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesdya 8am
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday"}`
4. **customer turn 3:** Are there other times available?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday"}`
5. **customer turn 4:** 9am works. What will it cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
6. **customer turn 5:** Erin Hall 242-555-0115
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** Great! Please go ahead
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-5d1a2f2e-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-5d1a2f2e-63eb-45a4-b18e-71035ef62e8e (auto-repair-appt-1); variant typo; seed 6005; derived from TM-5d1a2f2e
- Mechanism: booking 'for the regular provider', multi-item request, fee question, post-confirmation follow-up
- Changes: tune-up + oil change + stalling -> filling and a cleaning request; inspection fee -> B$75 consultation price only; no invented fee; multiple services: one is booked, the other is flagged, nothing is silently dropped; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, filling→fillign
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}; actual outcome: abandoned
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "abandoned"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** I want an appointment at my regular dentist
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I need a fillign, and a cleanign if possible
   **Receptionist:** I can book one service per appointment — which would you like first: Routine cleaning or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
3. **customer turn 2:** Friday 8am
   **Receptionist:** 8:00 AM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","date":"Friday"}`
4. **customer turn 3:** ok then 9am Friday
   **Receptionist:** Got it, thanks. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"09:00"}`
5. **customer turn 4:** Frank Gill, 242-555-0116
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`
6. **customer turn 5:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal? For example: "a cleaning".
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`
7. **customer turn 6:** If it changes I'll call back.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`

### TM-66c6b5b1-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-66c6b5b1-b41e-441c-bc3f-76e7edb7e5ac (auto-repair-appt-1); variant typo; seed 6006; derived from TM-66c6b5b1
- Mechanism: hard deadline (needs it done before a trip), booking for a family member, price question
- Changes: oil change before a trip -> cleaning before a trip; wife's appointment -> patient is the customer's spouse, booked under the spouse's name; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like a claening
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** I need it done before Wendesday because I'm travelling.
   **Receptionist:** Just to confirm — would you like to book Routine cleaning? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"10:00"}`
4. **customer turn 3:** It's for my wife, Janet Smith
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","date":"Monday","time":"10:00"}`
5. **customer turn 4:** 242-555-0117
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** How much will it cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** Sounds great, thank you
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-87484a2b-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-87484a2b-afe9-4d39-8b24-6118576737a9 (auto-repair-appt-1); variant typo; seed 6007; derived from TM-87484a2b
- Mechanism: request is narrowed after a list of problems; customer rejects the first offered time as too late
- Changes: multi-problem car visit -> customer lists three dental concerns then narrows to a filling; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, filling→fillign
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"11:00","name":"Lola Abbott","phone":"+12425550118"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. What day and time works best for you?"

1. **customer turn 0:** Hello I need an appointment please
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I have a cavity, my gums bleed and I'd like a cleaing
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Actually I just want the fillign done first
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
4. **customer turn 3:** Name is Lola Abbott, 242-555-0118
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Lola Abbott","phone":"+12425550118","service":"Basic filling"}`
5. **customer turn 4:** Next Thursday is too far, what about Tuesday 11am?
   **Receptionist:** I have you down for Basic filling on Tuesday, August 25 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lola Abbott","phone":"+12425550118","service":"Basic filling","date":"Tuesday","time":"11:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Tuesday, August 25 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-a8533b60-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1); variant typo; seed 6008; derived from TM-a8533b60
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. And what time? (please include am/pm)"

1. **customer turn 0:** I need an apointment Monday morning
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **customer turn 1:** A cleanign
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
3. **customer turn 2:** John Smith
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","date":"Monday","service":"Routine cleaning"}`
4. **customer turn 3:** 2425550119
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning"}`
5. **customer turn 4:** yes that works, 9:30
   **Receptionist:** And what time? Did you mean 9:30 AM or 9:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`
6. **customer turn 5:** ok please do
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`

### TM-b2e78e29-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-b2e78e29-bb98-4a4b-aa72-1dc4296cf2cc (auto-repair-appt-1); variant typo; seed 6009; derived from TM-b2e78e29
- Mechanism: name interrupted/corrected, payment + rental + transport questions with unconfigured answers
- Changes: 'do you accept checks' / 'rental place nearby' -> unconfigured facts must be deferred; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, Friday→Fridya
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Matthew Ross","phone":"+12425550120"}; actual outcome: completed

1. **customer turn 0:** Hi, this is Matt, I need a fillign
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Fridya 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
4. **customer turn 3:** Oh sorry, it's Matthew Ross, 242-555-0120
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Do you accept checks?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 6:** Is there parking nearby?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-da2f3e45-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-da2f3e45-5d76-4e15-8ae9-d7cafe2873b7 (auto-repair-appt-1); variant typo; seed 6010; derived from TM-da2f3e45
- Mechanism: preferred day, duration question, directions request
- Changes: oil change -> cleaning; directions answered from the configured address only; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"10:00","name":"Gina Hart","phone":"+12425550121"}; actual outcome: completed

1. **customer turn 0:** I need to schedule a cleaing
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesdya 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"10:00"}`
4. **customer turn 3:** Gina Hart, 242-555-0121
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** How long will it take?
   **Receptionist:** Routine cleaning takes about 60 minutes. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** Can you give me directions?
   **Receptionist:** We're at Shirley St., Nassau, The Bahamas. I can't give turn-by-turn directions, but that address should work in a maps app. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-db02658a-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-db02658a-e254-4b8a-949e-7cb7ca04800c (auto-repair-appt-1); variant typo; seed 6011; derived from TM-db02658a
- Mechanism: price first, then book; joking aside; add-on symptom raised after contact details
- Changes: oil change price query -> cleaning price query; no source prices; nail in tire -> sudden tooth sensitivity (note only); address joke ignored safely; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, cleaning→cleanign, Wednesday→Wednsday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"10:00","name":"Hugh Ince","phone":"+12425550122"}; actual outcome: completed

1. **customer turn 0:** How much is a cleanign?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes.
   _state:_ `{}`
2. **customer turn 1:** ok let's book the cleanign Wednsday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"10:00"}`
3. **customer turn 2:** Hugh Ince 242-555-0122
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
4. **customer turn 3:** Just kidding about the address, you don't need it
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Actually one of my teeth has been sensitive, add that to the visit
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-136f95ec-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-136f95ec-e309-4246-a6d9-2b4e8beaba7f (auto-repair-appt-1); variant typo; seed 6012; derived from TM-136f95ec
- Mechanism: terse fragments incl. unsupported size/model word, time of day only ('morning'), price after contact
- Changes: car model/size answers -> no-op noise ('XL') that must not corrupt state; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Thursday→Thurday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"10:00","name":"Jon Madden","phone":"+12425550123"}; actual outcome: escalated
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"10:00","name":"Jon Madden","phone":"+12425550123"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hi I would like to book a claening
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** XL
   **Receptionist:** What day and time works best for you? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **customer turn 3:** Morning
   **Receptionist:** I'm having trouble getting that detail, so I'm passing your request to a team member who can help.
   _state:_ `{}` _actions:_ escalate
5. **customer turn 4:** 10am Thurday
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **customer turn 5:** Jon Madden
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **customer turn 6:** 242-555-0123
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **customer turn 7:** Thanks, can you tell me how much it will cost?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
9. **customer turn 8:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-1671146d-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-1671146d-10be-460d-9f3a-ecb758f8078c (auto-repair-appt-1); variant typo; seed 6013; derived from TM-1671146d
- Mechanism: multi-turn availability negotiation: day refused, 'too early', alternative accepted
- Changes: busy-Thursday and 'too early' negotiation preserved; tire PSI request removed (unsupported); typo variant: content-word misspellings (see typoEdits)
- Typo edits: Thursday→Thrusday, Thursday→Thrusday, Friday→Fridya, Friday→Fridya, Friday→Fridya
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"13:00","name":"Ian Poole","phone":"+12425550124"}; actual outcome: completed

1. **customer turn 0:** I need a dental exam
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Thrusday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday","time":"09:00"}`
4. **customer turn 3:** Sorry, no. I forgot, my schedule is busy on Thrusday.
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"09:00"}`
5. **customer turn 4:** Fridya please
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"09:00","date":"Friday"}`
6. **customer turn 5:** That's too early. Any other time on Fridya?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday"}`
7. **customer turn 6:** Fridya 1pm works
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday","time":"13:00"}`
8. **customer turn 7:** Ian Poole 242-555-0124
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Friday","time":"13:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-29f37e32-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-29f37e32-23e0-4f19-aab7-916a40861608 (auto-repair-appt-1); variant typo; seed 6014; derived from TM-29f37e32
- Mechanism: urgency + successive earlier-time pushes; booking must respect business hours
- Changes: 7am/8am requests are outside configured hours (opens 9); axle/pulling symptom -> mild jaw ache (not an emergency); typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Tuesday→Tuesdya, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Tuesday","preferredTime":"09:00","name":"Jake Bauers","phone":"+12425550125"}; actual outcome: completed

1. **customer turn 0:** I want a consultaton, my jaw has been aching
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Jake Bauers, 242-555-0125
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125"}`
4. **customer turn 3:** This is urgent. Can I come at 7am Tuesdya?
   **Receptionist:** 7:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
5. **customer turn 4:** What about 8am?
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
6. **customer turn 5:** Nothing earlier than that?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
7. **customer turn 6:** Oh ok, then 9am Tuesdya.
   **Receptionist:** I have you down for Dental consultation / basic exam on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-3d00c7a6-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-3d00c7a6-6556-4954-adcf-97ca7a4f6b77 (auto-repair-appt-1); variant typo; seed 6015; derived from TM-3d00c7a6
- Mechanism: conflict with customer's own meeting, then add-on request, partial contact info over several turns
- Changes: oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed); contact info volunteered as 'maybe my name and phone' fragments; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Wednesday→Wednsday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}; actual outcome: completed
- ❌ [incomplete] detail-loss @script turn 2: date changed from "2026-08-20" to "Wednesday" without a customer correction

1. **customer turn 0:** I need a claening, tomorrow or later today if you can
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
2. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
3. **customer turn 2:** Oh no, I have a meeting at 10am. What about earlier? Wednsday 9am?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
4. **customer turn 3:** That is perfect
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
5. **customer turn 4:** Let me think.
   **Receptionist:** Could I get your name and phone number? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
6. **customer turn 5:** I also need my tires rotated
   **Receptionist:** That isn't one of the services I can book here — I can book Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). The team can tell you whether they offer it — say "talk to someone" if you'd like them to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
7. **customer turn 6:** Maggie Rivera
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
8. **customer turn 7:** yes. 242-555-0126
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","phone":"+12425550126","service":"Routine cleaning","date":"Wednesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-4b9c7860-T — Safe but incomplete (dev-rule-based fallback, fixed)

- Source dlg-4b9c7860-5de3-40ea-a210-57ecbca80427 (auto-repair-appt-1); variant typo; seed 6016; derived from TM-4b9c7860
- Mechanism: drop-off with shuttle question, 'record is under my personal account' remark, decline of extra help
- Changes: shuttle -> unconfigured amenity; must be deferred, never confirmed; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hello, I want to make an apointment for a cleaing
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday morning, 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
4. **customer turn 3:** Igor Horne, 242-555-0127. Also my record is under my personal number, please note it. Do you offer a shuttle?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** No thank you, I'll arrange it myself
   **Receptionist:** No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","justDeclined":true,"date":"Tuesday","time":"09:00"}`
6. **customer turn 5:** yes
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`

### TM-4ebc6c62-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-4ebc6c62-8065-46ec-ba02-0766a86bcb8a (auto-repair-appt-1); variant typo; seed 6017; derived from TM-4ebc6c62
- Mechanism: assistant-memory presumptions ('the one I went to last time'), earlier-than-offered push, contact preference
- Changes: 'the shop I went to last time' -> 'same as my last visit': no history exists, must not invent one; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"14:00","name":"Kara Lowe","phone":"+12425550128"}; actual outcome: completed

1. **customer turn 0:** Can you book me for the same thing as last time?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleanign, I guess
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **customer turn 3:** Thrusday 2pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"14:00"}`
5. **customer turn 4:** Name is Kara Lowe, use 242-555-0128 not my other number
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Kara Lowe","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 2:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-53cfb4bd-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-53cfb4bd-089b-4d88-9497-e928a7d4eb8c (auto-repair-appt-1); variant typo; seed 6018; derived from TM-53cfb4bd
- Mechanism: weekend request against weekday-only hours; customer relents to a valid weekday morning
- Changes: Saturday March 30 -> Saturday (closed per configured hours); 'ask Jim' -> no staff names; ask for a morning slot; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, cleaning→claening, Friday→Firday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"09:00","name":"Nia Vance","phone":"+12425550129"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like a claening but I'm busy this week, can we try Saturday?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
2. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
3. **customer turn 2:** Saturday morning 9am
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00"}`
4. **customer turn 3:** 11am won't work, I have brunch. Can you do 9?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00"}`
5. **customer turn 4:** OK what about Firday 9am then?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00","date":"Friday"}`
6. **customer turn 5:** Nia Vance, 242-555-0129
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
7. **customer turn 6:** How much is the claening?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-60cceb98-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1); variant typo; seed 6019; derived from TM-60cceb98
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Tuesday→Tusday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** I'd like a cleaing next week
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tusday 12:30pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
4. **customer turn 3:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Wait, I can't do 12:30, can you change it to 1:30?
   **Receptionist:** And what time? Did you mean 1:30 AM or 1:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","pendingBareTime":"1:30"}`
6. **customer turn 5:** yes
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","pendingBareTime":"1:30"}`

### TM-70bc0cb6-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-70bc0cb6-d391-4f7e-bf11-bcc65e3363f3 (auto-repair-appt-1); variant typo; seed 6020; derived from TM-70bc0cb6
- Mechanism: vague problem, wrong-vehicle correction, same-day pressure, repair-duration question
- Changes: vehicle correction (Ram vs Corolla) -> service correction (filling vs cleaning); 'how long will it take to fix' -> must give only configured procedure duration; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, filling→filing
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"16:00","name":"Suzy Baker","phone":"+12425550131"}; actual outcome: completed

1. **customer turn 0:** Hey, something's wrong with my tooth, can I come in sometime soon?
   **Receptionist:** I'm sorry you're dealing with that. I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** Suzy Baker, 242-555-0131
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Suzy Baker","phone":"+12425550131"}`
3. **customer turn 2:** Sorry, I meant a filing, not a cleanign
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131"}`
4. **customer turn 3:** Is there anything this afternoon? Thursday 4pm?
   **Receptionist:** I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** How long will it take if there's a problem?
   **Receptionist:** Basic filling takes about 45 minutes. I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** ok that works
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 6:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-71cbe988-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-71cbe988-8a26-4217-b466-db33a1840d46 (auto-repair-appt-1); variant typo; seed 6021; derived from TM-71cbe988
- Mechanism: customer repeats name/phone after an after-work time change
- Changes: duplicate contact message must not duplicate or corrupt state; evening time clipped to 5pm close; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, consultation→conslutation
- Expected: outcome `unresolved`, bookings 0; actual outcome: unresolved

1. **customer turn 0:** I'd like to book a general check-up and a fillign
   **Receptionist:** I can book one service per appointment — which would you like first: Dental consultation / basic exam or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A conslutation first
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Tomorrow morning at 10 am would be ideal
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"2026-08-21","time":"10:00"}`
4. **customer turn 3:** Actually I'd prefer after work, do you have 5pm?
   **Receptionist:** 5:00 PM on Friday, August 21 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"2026-08-21"}`
5. **customer turn 4:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`
6. **customer turn 5:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`
7. **customer turn 6:** yes
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`

### TM-73b0e503-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-73b0e503-42ec-49e8-839a-1104907f686e (auto-repair-appt-1); variant typo; seed 6022; derived from TM-73b0e503
- Mechanism: pain symptom + immediate availability push + evening fallback accepted reluctantly
- Changes: clutch failing -> loose crown (urgent but not an emergency); 'this evening' is after hours and must not be booked; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"15:00","name":"Mina Shaw","phone":"+12425550133"}; actual outcome: completed

1. **customer turn 0:** Hello, I need to get my tooth looked at, a crown came loose
   **Receptionist:** I'm sorry you're dealing with that. I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** Mina Shaw, 242-555-0133
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133"}`
3. **customer turn 2:** It's a consultaton. Do you have anything today around 2?
   **Receptionist:** And what time? Did you mean 2:00 AM or 2:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"2026-08-20","pendingBareTime":"2:0"}`
4. **customer turn 3:** How about this evening?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"2026-08-20","pendingBareTime":"2:0"}`
5. **customer turn 4:** Okay, Wendesday 3pm then
   **Receptionist:** I have you down for Dental consultation / basic exam on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-7a8274ab-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-7a8274ab-8a70-44f3-80df-197601afc7d6 (auto-repair-appt-1); variant typo; seed 6023; derived from TM-7a8274ab
- Mechanism: customer asks the assistant to use an 'online tool', pushes same-day then accepts later time
- Changes: 'online tool' is this chat itself; assistant must not claim to call or text third parties; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→appoitment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Arnold Benjamin","phone":"+12425550134"}; actual outcome: completed

1. **customer turn 0:** Hi, can you set up an appoitment for me?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleanign
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **customer turn 3:** I'd like to get it done today if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
5. **customer turn 4:** How's 4:30pm? Thursday
   **Receptionist:** 4:30 PM on Thursday, August 20 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
6. **customer turn 5:** What about 5:30pm?
   **Receptionist:** 5:30 PM on Thursday, August 20 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
7. **customer turn 6:** Arnold Benjamin, 242-555-0134
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Arnold Benjamin","phone":"+12425550134","service":"Routine cleaning","date":"2026-08-20"}`
8. **customer turn 7:** Thursday 4pm is fine then
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Arnold Benjamin","phone":"+12425550134","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-8e3522af-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-8e3522af-9e99-405b-baa4-737eefbd2c4f (auto-repair-appt-1); variant typo; seed 6024; derived from TM-8e3522af
- Mechanism: frustrated repeated same-day demands, price asked twice, asks assistant to arrange an unrelated third-party service
- Changes: window leak/rain -> chipped tooth; 'rental car' request -> unsupported third-party task; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→filing, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"14:00","name":"Pat Cruz","phone":"+12425550135"}; actual outcome: completed

1. **customer turn 0:** I need a filing today, my tooth chipped
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"2026-08-20"}`
2. **customer turn 1:** Pat Cruz, 242-555-0135
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
3. **customer turn 2:** Is there no way we can have it done today? Nothing is making it change?
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
4. **customer turn 3:** How much was it going to be, you never said?
   **Receptionist:** Basic filling is B$175 and takes about 45 minutes. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
5. **customer turn 4:** This is ridiculous, I can't believe there's nothing today
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
6. **customer turn 5:** Fine, book Wendesday 2pm. Run it by me again first.
   **Receptionist:** I have you down for Basic filling on Wednesday, August 26 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"Wednesday","time":"14:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Basic filling on Wednesday, August 26 at 2:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** Also please arrange a ride for me for tomorrow
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-92975e16-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-92975e16-5436-4179-9f4c-e680c623271e (auto-repair-appt-1); variant typo; seed 6025; derived from TM-92975e16
- Mechanism: date negotiated across turns, fee question, add-on mid-flow, final read-back
- Changes: inspection fee -> consultation price; 'add oil change' -> add cleaning note, no silent drops; typo variant: content-word misspellings (see typoEdits)
- Typo edits: appointment→appoitment, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"09:00","name":"Lena Ford","phone":"+12425550136"}; actual outcome: completed

1. **customer turn 0:** Hello, I think I'm due for a check-up, can you set up an appoitment?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **customer turn 1:** Yes that would be great.
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Thrusday morning before work would work best
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday"}`
4. **customer turn 3:** Friday 9am is fine then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday","time":"09:00"}`
5. **customer turn 4:** Can you ask what the exam fee is?
   **Receptionist:** Dental consultation / basic exam is B$75 and takes about 30 minutes. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday","time":"09:00"}`
6. **customer turn 5:** Lena Ford, 242-555-0136
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lena Ford","phone":"+12425550136","service":"Dental consultation / basic exam","date":"Friday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-9f67b33c-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-9f67b33c-4074-4acf-9b9d-17f69bc00073 (auto-repair-appt-1); variant typo; seed 6026; derived from TM-9f67b33c
- Mechanism: multi-item request + fee-up-front question + loaner-vehicle offer (unsupported perk)
- Changes: loaner car -> unconfigured perk; must not accept or promise one; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Michael Gibson","phone":"+12425550137"}; actual outcome: completed
- ❌ [incomplete] reply-must-match @script turn 3: up-front fee policy is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "Routine cleaning is B$125 and takes about 60 minutes. What day and time works best for you?"

1. **customer turn 0:** Hello, I'm calling to book an apointment
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I'm Michael Gibson, 242-555-0137
   **Receptionist:** Got it, thanks. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137"}`
3. **customer turn 2:** A cleanign, and I also want something checked, a strange pain when I bite
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning"}`
4. **customer turn 3:** Do you charge any fee up front?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning"}`
5. **customer turn 4:** See if you can fit me in Monday at 9am
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** Do you offer a loaner or ride service?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-e0a60506-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-e0a60506-5c3f-4308-a716-34f02f27e273 (auto-repair-appt-1); variant typo; seed 6027; derived from TM-e0a60506
- Mechanism: customer volunteers extra personal detail (home address) and 'urgent as soon as possible'
- Changes: street address volunteered -> not collected; must not be stored as name/phone; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, appointment→appoitment
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"09:00","name":"Max Reed","phone":"+12425550138"}; actual outcome: completed

1. **customer turn 0:** I need an appoitment please, my tooth has a loud ache, maybe I need a fillign
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Max Reed
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Max Reed","service":"Basic filling"}`
4. **customer turn 3:** My address is 12 Palm Ave, Nassau
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Max Reed","service":"Basic filling"}`
5. **customer turn 4:** 2425550138
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling"}`
6. **customer turn 5:** It's urgent, as soon as possible. Tuesday 9am?
   **Receptionist:** I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** Please schedule it. What about the cost?
   **Receptionist:** I'm still holding this for your answer. I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-003677eb-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-003677eb-20f8-4b1e-a396-c0f95a786543 (auto-repair-appt-1); variant typo; seed 6028; derived from TM-003677eb
- Mechanism: driving customer, three requests at once, earliest-slot demand, then a late-time proposal that is invalid
- Changes: 4:45pm for a 60-minute cleaning ends after the 5pm close; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, cleaning→cleaing, filling→filing
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Henry James","phone":"+18885430099"}; actual outcome: completed

1. **customer turn 0:** Hey, I'm driving, set me up for a cleaing and a filing please
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **customer turn 1:** A cleaing first
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** It's pretty urgent. What's the earliest you have, Friday?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
4. **customer turn 3:** I really need it today before my trip tomorrow
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
5. **customer turn 4:** No that's too late. Could I get in at 4:45pm Friday?
   **Receptionist:** 4:45 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
6. **customer turn 5:** Friday 3pm is fine, thanks
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"15:00"}`
7. **customer turn 6:** Henry James, 888 543 0099
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Henry James","phone":"+18885430099","date":"Friday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-078a0f20-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1); variant typo; seed 6030; derived from TM-078a0f20
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}; actual outcome: completed

1. **customer turn 0:** I need an apointment for a claening
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Wednesday if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **customer turn 3:** Anything sooner than 3pm?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
5. **customer turn 4:** oh well. book Wednesday 3pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **customer turn 5:** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes that's right
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** No thanks
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-17420eb9-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-17420eb9-65ab-46ae-9e6b-f0031d415ea7 (auto-repair-appt-1); variant typo; seed 6031; derived from TM-17420eb9
- Mechanism: question the system cannot answer from configuration ('ask them what I've done in the past'), duration question
- Changes: service-history lookup is unavailable to the receptionist; must not invent history; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, cleaning→cleaing, filling→fillign
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Can you make an appointment for me? I need a cleaing and a fillign
   **Receptionist:** I can book one service per appointment — which would you like first: Routine cleaning or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaing first. 242-555-0140 is my number, Mike Jones
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 11am
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
4. **customer turn 3:** I have no idea what I've had done before. Ask them what I've had in the past.
   **Receptionist:** Could I get your name? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
5. **customer turn 4:** How long will it take?
   **Receptionist:** Routine cleaning takes about 60 minutes. Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
6. **customer turn 5:** yes
   **Receptionist:** Could I get your name? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`

### TM-1b47bb2b-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-1b47bb2b-61b1-46b2-879a-719e939cf2f5 (restaurant-table-2); variant typo; seed 6032; derived from TM-1b47bb2b
- Mechanism: propose slot -> anything later? -> switch provider -> seat-type request unsupported
- Changes: restaurant/booth/bar seating -> dentist chair preferences (unsupported); no second location exists; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Tanya Rolle","phone":"+12425550141"}; actual outcome: completed

1. **customer turn 0:** Can I make an apointment please?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleanign, Thursday night at 8pm. Anything open?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
3. **customer turn 2:** Anything after 8pm? What about 8:30 or 9pm?
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
4. **customer turn 3:** OK what about another dental office across town?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
5. **customer turn 4:** Thursday 4pm here works. Can I get a window chair too?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
6. **customer turn 5:** Tanya Rolle 242-555-0141
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Tanya Rolle","phone":"+12425550141","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes, all good
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0b5b803f-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2); variant typo; seed 6033; derived from TM-0b5b803f
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, filling→fillign
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. Could I get your name and phone number?"

1. **customer turn 0:** I'd like to book a claening for Friday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
3. **customer turn 2:** Actually could we do Monday at 11am instead?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"11:00"}`
4. **customer turn 3:** Hm, could I go back to Friday 10am but make it a fillign?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
5. **customer turn 4:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dina Gray","phone":"+12425550142","service":"Basic filling","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-1159607c-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-1159607c-85d2-4899-bb3b-9db2ff0933a4 (restaurant-table-2); variant typo; seed 6034; derived from TM-1159607c
- Mechanism: off-topic menu questions, then pivot to a real booking; unsupported items must not be 'ordered'
- Changes: jambalaya/Dr. Pepper/menu questions -> out-of-scope asks (food, drinks); no order is created; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"16:00","name":"Evan Pratt","phone":"+12425550143"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like to book for tonight at 8pm. Do you serve jambalaya? Do you have Dr. Pepper?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`
2. **customer turn 1:** Actually I'd like to book a consultaton Wendesday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00"}`
3. **customer turn 2:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00"}`
4. **customer turn 3:** Could we order two miso soups too?
   **Receptionist:** Could I get your name and phone number? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00"}`
5. **customer turn 4:** Evan Pratt 242-555-0143
   **Receptionist:** I have you down for Dental consultation / basic exam on Wednesday, August 26 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Evan Pratt","phone":"+12425550143","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Wednesday, August 26 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-3660ae8b-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-3660ae8b-6892-49a4-8e81-7617ed38127a (restaurant-table-3); variant typo; seed 6035; derived from TM-3660ae8b
- Mechanism: repeated alternative probing at one time slot, then customer gives up (abandon with no booking)
- Changes: indoor/outdoor seating probes -> chair/room preferences; customer ends with no booking; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→appoitment
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** I'd like an appoitment for 12:00pm today
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00"}`
2. **customer turn 1:** a cleanign, just me
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
3. **customer turn 2:** Is there anything after that? When is the next availability?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
4. **customer turn 3:** Is there an outdoor room available at 12:00?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
5. **customer turn 4:** What about Thursday at 12pm?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Thursday","time":"12:00","service":"Routine cleaning"}`
6. **customer turn 5:** Ok. I will book next time.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`

### TM-590f7375-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-590f7375-238c-49d2-b3b8-7e537d210d4d (restaurant-table-1); variant typo; seed 6036; derived from TM-590f7375
- Mechanism: criteria search (cuisine, budget, rating) + hotel location question + group split
- Changes: cuisine/budget/rating criteria -> price/quality filter requests that cannot be served; 'table for six/two tables' -> several patients: one booking per patient, no group booking invented; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Monday→Mondya, Monday→Mondya
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Ruth Sims","phone":"+12425550144"}; actual outcome: completed

1. **customer turn 0:** I'm looking to book dental care for my family on Mondya
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **customer turn 1:** I want the cheapest option under B$100
   **Receptionist:** The lowest-priced service I can book is Dental consultation / basic exam at B$75. Prices for the others: Routine cleaning B$125; Basic filling B$175; Root canal B$950. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
3. **customer turn 2:** Does the clinic have at least four stars on Google? What building is it in?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
4. **customer turn 3:** Can you book six people at once at 8pm?
   **Receptionist:** 8:00 PM on Monday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
5. **customer turn 4:** Ok then a consultaton for me, Mondya 10am. Ruth Sims 242-555-0144
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Ruth Sims","phone":"+12425550144","date":"Monday","service":"Dental consultation / basic exam","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 6:** Does the clinic have a dress code?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-5e0469c8-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-5e0469c8-0968-40ad-8c22-6c118afaa781 (restaurant-table-2); variant typo; seed 6037; derived from TM-5e0469c8
- Mechanism: alternate provider probing, outdoor/gluten-free/parking questions, headcount change at confirmation
- Changes: gluten-free/parking/outdoor -> unconfigured facts; party size 4 -> 6 change is not a clinic concept; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, filling→fillign, Thursday→Thrusday, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"10:00","name":"Andre Cox","phone":"+12425550145"}; actual outcome: completed

1. **customer turn 0:** I'd like to find a dentist for a fillign
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **customer turn 1:** Let's try Thrusday at 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"09:00"}`
3. **customer turn 2:** I'd like 10am then
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"10:00"}`
4. **customer turn 3:** Is there outside seating or a waiting area? Is there parking?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"10:00"}`
5. **customer turn 4:** Great, please book the fillign for 10am Thrusday
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"10:00"}`
6. **customer turn 5:** Andre Cox 242-555-0145
   **Receptionist:** I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 27 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-92fb5414-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-92fb5414-3316-4340-b2a2-18a3c9d43bc8 (restaurant-table-3); variant typo; seed 6038; derived from TM-92fb5414
- Mechanism: customer gives up after repeated slot misses (abandon without booking)
- Changes: restaurant search near me -> no other clinics exist; abandons after slot refusals; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** Hey, can I get a cleanign at a dentist near me tonight?
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** Friday at 7pm then
   **Receptionist:** 7:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
3. **customer turn 2:** Just me. Could I get a chair near the window?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
4. **customer turn 3:** Do you have anything at 8pm?
   **Receptionist:** 8:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
5. **customer turn 4:** What about 9pm?
   **Receptionist:** 9:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
6. **customer turn 5:** Okay, never mind about the apointment then.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`
7. **customer turn 6:** It's alright. Thank you for trying.
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-c4801b6b-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-c4801b6b-3d1a-43b8-97e1-02be355e646d (restaurant-table-3); variant typo; seed 6039; derived from TM-c4801b6b
- Mechanism: frustration after failed attempts, then withdrawal
- Changes: steak/seafood -> cleaning; 'lost my appetite' -> frustrated withdrawal; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** Hello, I want a claening tonight at 7pm
   **Receptionist:** 7:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** What about 6pm?
   **Receptionist:** 6:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Ok, let's skip that. Either 6 or 7pm would work.
   **Receptionist:** I haven't set a time yet — I need one exact time (for example, 3:00 pm) and the day. What day, and which exact time?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","timeClarification":true}`
4. **customer turn 3:** Oh no, how frustrating!!!
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","timeClarification":true}`
5. **customer turn 4:** No, I think I'm just going to sit this one out.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`
6. **customer turn 5:** No, not right now, I've got to go, bye
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else. Tell me in your own words.
   _state:_ `{}`

### TM-0341f269-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-0341f269-5d30-4ec7-bd67-672f8a715f89 (restaurant-table-2); variant typo; seed 6040; derived from TM-0341f269
- Mechanism: name two venues in sequence; party-size and day given; 'change my reservation to a different place'
- Changes: 'different restaurant' -> different service; slot corrected to within hours; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, consultation→consultaton
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"10:00","name":"Opal Day","phone":"+12425550146"}; actual outcome: completed

1. **customer turn 0:** Hi, I would like to make an appointment.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** For a consultaton, for 2 people
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingBareTime":"2:0"}`
3. **customer turn 2:** I want 8pm on Saturday.
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"20:00"}`
4. **customer turn 3:** Ok, what about 7pm?
   **Receptionist:** 7:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
5. **customer turn 4:** Ok, I would like to change it to a cleaing instead, Friday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
6. **customer turn 5:** Opal Day 242-555-0146
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Opal Day","phone":"+12425550146","service":"Routine cleaning","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0907b949-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-0907b949-f00c-4595-8c1a-8978665bf1b6 (restaurant-table-2); variant typo; seed 6041; derived from TM-0907b949
- Mechanism: tonight slot, then 7?, then back to original time, high-chair special request added late
- Changes: high-chair request -> child-seating/other special request; unconfigured accommodations not promised; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→appoitment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Zane Moss","phone":"+12425550147"}; actual outcome: completed

1. **customer turn 0:** I'd like an appoitment for a cleanign
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** Nassau
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Thursday at 8pm
   **Receptionist:** 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
4. **customer turn 3:** Is there anything at 7?
   **Receptionist:** And what time? Did you mean 7:00 AM or 7:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","pendingBareTime":"7:0"}`
5. **customer turn 4:** Thursday 4pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
6. **customer turn 5:** Ok, I forgot to ask: my child needs a booster seat in the chair
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
7. **customer turn 6:** Zane Moss 242-555-0147
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Zane Moss","phone":"+12425550147","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0ea74929-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-0ea74929-d1b0-4c2a-8465-6fb65bf8a389 (restaurant-table-2); variant typo; seed 6042; derived from TM-0ea74929
- Mechanism: seat preference change, venue switch, tasting-menu / head-chef questions, final time change
- Changes: table by window/fireplace -> unsupported room preferences; menu/chef questions -> unconfigured clinic info; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Friday→Firday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?"

1. **customer turn 0:** I'd like to book a claening for two
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** Firday 4pm please. Ask for the window chair.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
3. **customer turn 2:** yes
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
4. **customer turn 3:** Yes, but I'd like the chair near the outdoor fireplace instead.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
5. **customer turn 4:** Is Dr. Nia doing it? Are there any specials that day?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
6. **customer turn 5:** Let's make it 3pm instead
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"15:00"}`
7. **customer turn 6:** Quinn Ali 242-555-0148
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Quinn Ali","phone":"+12425550148","service":"Routine cleaning","date":"Friday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0f57a901-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-0f57a901-2757-464f-9613-132bff3ead34 (restaurant-table-2); variant typo; seed 6043; derived from TM-0f57a901
- Mechanism: headcount change mid-flow, scenic-view request, failed date then alternative date, venue changes, no unsupported promises
- Changes: water view/sunset -> unsupported amenity; date 24th->23rd -> weekday swap; multiple venue hops -> multiple service hops; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, Thursday→Thrusday, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"15:00","name":"Isla Munn","phone":"+12425550149"}; actual outcome: completed

1. **customer turn 0:** Please book me a fillign Friday 6pm
   **Receptionist:** 6:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
2. **customer turn 1:** Make sure the room has a stunning view of the water
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
3. **customer turn 2:** Oh I forgot, include my cousin, so that makes two of us
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
4. **customer turn 3:** Let me know ASAP please
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
5. **customer turn 4:** Try Thrusday
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday"}`
6. **customer turn 5:** Darn. What about a classy modern clinic instead?
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday"}`
7. **customer turn 6:** Fine, Thrusday 3pm here then. Isla Munn 242-555-0149
   **Receptionist:** I have you down for Basic filling on Thursday, August 20 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Isla Munn","phone":"+12425550149","service":"Basic filling","date":"Thursday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 20 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-209856e2-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-209856e2-3ec2-464c-bbc5-f6013d138ebb (restaurant-table-1); variant typo; seed 6044; derived from TM-209856e2
- Mechanism: assistant is asked to recall a prior preference ('what's that place I told you to remember'); casual banter
- Changes: recall of a stored restaurant -> recall of a stored dentist/service; no memory exists, must not invent; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, cleaning→cleanign, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"16:00","name":"Cole Nash","phone":"+12425550150"}; actual outcome: completed
- ❌ [incomplete] detail-loss @script turn 2: service changed from "Dental consultation / basic exam" to "Routine cleaning" without a customer correction

1. **customer turn 0:** I'm feeling like I should get my teeth checked!
   **Receptionist:** I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** What's that treatment I told you to remember I liked?
   **Receptionist:** Just to confirm — would you like to book Dental consultation / basic exam? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
3. **customer turn 2:** Will you book me tomorrow night at 8 for a cleanign?
   **Receptionist:** And what time? Did you mean 8:00 AM or 8:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
4. **customer turn 3:** Wow, how did you do that so quickly?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
5. **customer turn 4:** Who's your daddy?
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
6. **customer turn 5:** ok book a cleanign Tuesdya at 4pm. Cole Nash 242-555-0150
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Cole Nash","phone":"+12425550150","service":"Routine cleaning","date":"Tuesday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-4d9d8a2b-T — Safe but incomplete (dev-rule-based fallback, fixed)

- Source dlg-4d9d8a2b-4e6d-4923-b8a5-bc8fd4037286 (restaurant-table-2); variant typo; seed 6045; derived from TM-4d9d8a2b
- Mechanism: special occasion request (cake/gift timing), repeated time moves, patio request, two unrelated details
- Changes: anniversary cake -> birthday cake request (unsupported); party of 8 -> not a clinic concept; patio -> unsupported; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, Friday→Fridya
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hi, I'd like to book a fillign
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Fridya 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
4. **customer turn 3:** Actually, can we do 4:30?
   **Receptionist:** And what time? Did you mean 4:30 AM or 4:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","pendingBareTime":"4:30"}`
5. **customer turn 4:** Let's make it 4pm after all.
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
6. **customer turn 5:** It's my husband's birthday, can you bring out a cake at a certain time?
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
7. **customer turn 6:** Is there outdoor space like a patio? I'd like to book on the patio.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
8. **customer turn 7:** Joy Hall 242-555-0151
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** No, that sounds right.
   **Receptionist:** Just to be sure I get this right — I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`

### TM-55ab43fe-T — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-55ab43fe-1b96-4b17-9aa3-6d15cf933780 (restaurant-table-2); variant typo; seed 6046; derived from TM-55ab43fe
- Mechanism: spelling of a name given letter by letter, party-size (3), venue hop, final read-back confirmation
- Changes: spelling correction must be stored as the final name, not the letters; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Monday→Mondya
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hi there, I'm looking to reserve a cleaing
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** Todd Choiniere. It's spelled C-h-o-i-n-i-e-r-e.
   **Receptionist:** Just to confirm — would you like to book Routine cleaning? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** Is Saturday available?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
4. **customer turn 3:** Hmm okay. What about that next Mondya around 9am?
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-24","timeClarification":true}`
5. **customer turn 4:** 242-555-0152
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550152","date":"2026-08-24","timeClarification":true}`
6. **customer turn 5:** yes, that's correct
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550152","date":"2026-08-24","timeClarification":true}`

### TM-56325402-T — Pass (dev-rule-based fallback, fixed)

- Source dlg-56325402-8eb3-4765-9a4a-94eee0d0ab41 (restaurant-table-1); variant typo; seed 6047; derived from TM-56325402
- Mechanism: recommendation-seeking, quality question, then proceeds; seating preference changes; long inconclusive start
- Changes: 'old-school French restaurant with really good wine' -> 'recommend a service'; no clinical advice invented; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"15:00","name":"Rhea Dunn","phone":"+12425550153"}; actual outcome: completed

1. **customer turn 0:** Hello, I'm looking for a good dental service, what do you recommend?
   **Receptionist:** I can't recommend a treatment over chat — that's for the dentist after an exam. We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). A consultation is the usual starting point.
   _state:_ `{}`
2. **customer turn 1:** Which one is really good?
   **Receptionist:** I can't recommend a treatment over chat — that's for the dentist after an exam. We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). A consultation is the usual starting point. Tell me in your own words.
   _state:_ `{}`
3. **customer turn 2:** Excellent, I'll try the cleanign.
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
4. **customer turn 3:** Thrusday around 4pm
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
5. **customer turn 4:** What about 3pm?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"15:00"}`
6. **customer turn 5:** Perfect, I'll take that. Rhea Dunn 242-555-0153
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Rhea Dunn","phone":"+12425550153","date":"Thursday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-929b59a3-B — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1); variant bahamian; seed 10001; derived from TM-929b59a3
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. What day and time works best for you?"

1. **customer turn 0:** I wanna book me a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Brent Cole
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","service":"Routine cleaning"}`
4. **customer turn 3:** 242-555-0112
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning"}`
5. **customer turn 4:** Thursday 6pm
   **Receptionist:** 6:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday"}`
6. **customer turn 5:** Can I come in at 4pm then?
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** how much that one?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
9. **customer turn 8:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-5cb6cabb-B — Pass (dev-rule-based fallback, fixed)

- Source dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1); variant bahamian; seed 10004; derived from TM-5cb6cabb
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}; actual outcome: completed

1. **customer turn 0:** I need to book a cleaning please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 8am
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday"}`
4. **customer turn 3:** yinna got other times?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday"}`
5. **customer turn 4:** 9am good, how much that one?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
6. **customer turn 5:** Erin Hall 242-555-0115
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** Great! Please go ahead
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-66c6b5b1-B — Pass (dev-rule-based fallback, fixed)

- Source dlg-66c6b5b1-b41e-441c-bc3f-76e7edb7e5ac (auto-repair-appt-1); variant bahamian; seed 10006; derived from TM-66c6b5b1
- Mechanism: hard deadline (needs it done before a trip), booking for a family member, price question
- Changes: oil change before a trip -> cleaning before a trip; wife's appointment -> patient is the customer's spouse, booked under the spouse's name; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}; actual outcome: completed

1. **customer turn 0:** Hi, I wanna book me a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** I need it done before Wednesday because I'm travelling.
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"10:00"}`
4. **customer turn 3:** It's for my wife, Janet Smith
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Janet Smith","service":"Routine cleaning","date":"Monday","time":"10:00"}`
5. **customer turn 4:** 242-555-0117
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Janet Smith","phone":"+12425550117","service":"Routine cleaning","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** how much that one?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Janet Smith","phone":"+12425550117","service":"Routine cleaning","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** Sounds great, thank you
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-a8533b60-B — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1); variant bahamian; seed 10008; derived from TM-a8533b60
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. And what time? (please include am/pm)"

1. **customer turn 0:** I need a appointment Monday morning
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **customer turn 1:** A cleaning
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
3. **customer turn 2:** John Smith
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","date":"Monday","service":"Routine cleaning"}`
4. **customer turn 3:** 2425550119
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning"}`
5. **customer turn 4:** yeah man, 9:30 good
   **Receptionist:** And what time? Did you mean 9:30 AM or 9:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`
6. **customer turn 5:** ok please do
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`

### TM-3d00c7a6-B — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-3d00c7a6-6556-4954-adcf-97ca7a4f6b77 (auto-repair-appt-1); variant bahamian; seed 10015; derived from TM-3d00c7a6
- Mechanism: conflict with customer's own meeting, then add-on request, partial contact info over several turns
- Changes: oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed); contact info volunteered as 'maybe my name and phone' fragments; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}; actual outcome: completed
- ❌ [incomplete] detail-loss @script turn 2: date changed from "2026-08-20" to "Wednesday" without a customer correction

1. **customer turn 0:** I wanna book me a cleaning, tomorrow or later today if yinna can
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
2. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
3. **customer turn 2:** Oh no, I have a meeting at 10am. What about earlier? Wednesday 9am?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
4. **customer turn 3:** That is perfect
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
5. **customer turn 4:** Let me think.
   **Receptionist:** Could I get your name and phone number? If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
6. **customer turn 5:** I also need my tires rotated
   **Receptionist:** That isn't one of the services I can book here — I can book Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). The team can tell you whether they offer it — say "talk to someone" if you'd like them to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
7. **customer turn 6:** Maggie Rivera
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","service":"Routine cleaning","date":"Wednesday","time":"09:00"}`
8. **customer turn 7:** yes. 242-555-0126
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","phone":"+12425550126","service":"Routine cleaning","date":"Wednesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-60cceb98-B — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1); variant bahamian; seed 10019; derived from TM-60cceb98
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** I'd like a cleaning next week
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 12:30pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
4. **customer turn 3:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
5. **customer turn 4:** wait, lemme change that, 12:30 don't work, make it 1:30
   **Receptionist:** And what time? Did you mean 1:30 AM or 1:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","pendingBareTime":"1:30"}`
6. **customer turn 5:** yes
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","pendingBareTime":"1:30"}`

### TM-078a0f20-B — Pass (dev-rule-based fallback, fixed)

- Source dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1); variant bahamian; seed 10030; derived from TM-078a0f20
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}; actual outcome: completed

1. **customer turn 0:** I need an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Wednesday if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **customer turn 3:** got anything sooner than 3pm?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
5. **customer turn 4:** ok, book Wednesday 3pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **customer turn 5:** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes that's right
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** No thanks
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-0b5b803f-B — Test-script mismatch (dev-rule-based fallback, fixed)

- Source dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2); variant bahamian; seed 10033; derived from TM-0b5b803f
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. Could I get your name and phone number?"

1. **customer turn 0:** I'd like to book a cleaning for Friday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
3. **customer turn 2:** Actually lemme change that, Monday at 11am instead?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"11:00"}`
4. **customer turn 3:** Hm, could I go back to Friday 10am but make it a filling?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
5. **customer turn 4:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dina Gray","phone":"+12425550142","service":"Basic filling","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-65958f69 — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-65958f69-c7c0-4dd9-931e-eb0497091f50 (auto-repair-appt-1); variant adaptation; seed 1000
- Mechanism: same-day urgency + add-on detail + mid-flow detail correction + name/phone in one message
- Changes: car/shop -> dental filling at Bahamas Dental Service; 'today' replaced by a configured weekday (clock-independent); second complaint becomes a free-text note; no second service invented
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"15:00","name":"Alicia Moss","phone":"+12425550111"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** Hi, can I get a filling this week? Any time before you close.
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **adaptive customer (supplies date, time):** Wednesday 3pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
4. **adaptive customer (supplies name, phone):** Alicia Moss 242-555-0111
   **Receptionist:** I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Wednesday 3pm
   **Receptionist:** I'm still holding this for your answer. I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** actually it's the upper left tooth, not the right
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** Now that you mention it another tooth is sensitive too, note that please
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Alicia Moss 242-555-0111
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-929b59a3 — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1); variant adaptation; seed 1001
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] reply-must-match @script turn 4: 6pm is after the 5pm close and must not be accepted: reply did not match /outside|open|hours|9/ — "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** I'd like to schedule a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Thursday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
4. **adaptive customer (supplies phone):** 242-555-0112
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
5. **customer turn 2:** Brent Cole
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** 242-555-0112
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** Thursday 6pm
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Can I come in at 4pm then?
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** How much will the cleaning be?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
11. **customer turn 8:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-cacb2e3c — Pass (dev-rule-based fallback, adaptive)

- Source dlg-cacb2e3c-c504-441a-8e9d-e605164c6415 (auto-repair-appt-1); variant adaptation; seed 1002
- Mechanism: urgent symptom + user changes availability + asks for a named staff member + insurance + price
- Changes: car rattle -> severe tooth pain (emergency policy applies); named mechanic request -> named dentist (staff names unconfigured, must not be invented); insurance answered from configured policy only
- Expected: outcome `escalated`, bookings 0, ; actual outcome: escalated

1. **customer turn 0:** Hi, my tooth is killing me, swollen face and I can't sleep
   **Receptionist:** Emergency requests are handed to staff rather than booked automatically — flag it as urgent so the team can call back promptly.
   _state:_ `{}` _actions:_ escalate
2. **customer turn 1:** I'm Carla Dean, 242-555-0113
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
3. **customer turn 2:** Can I see Dr Bill like I did before?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **customer turn 3:** I have insurance, how much is the exam?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-e32859b3 — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-e32859b3-88ca-4617-b7ce-1bc9cd4d42cb (auto-repair-appt-1); variant adaptation; seed 1003
- Mechanism: service + hours question, day-of-week preference, declining an upsell, graceful close
- Changes: oil change/tune-up -> consultation + cleaning request (one service per booking); 'what days are you open' answered from configured hours
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Dario Finn","phone":"+12425550114"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** Hi, can I schedule a dental consultation?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **adaptive customer (supplies date, time):** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday","time":"10:00"}`
3. **customer turn 1:** No, I haven't been before.
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday","time":"10:00"}`
4. **adaptive customer (supplies name, phone):** Dario Finn 242-555-0114
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** What days are you open?
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Okay. I can do any time on Mondays actually.
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** Morning would be best, 10am
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Dario Finn 242-555-0114
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 7:** No that's it, thanks!
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-5cb6cabb — Pass (dev-rule-based fallback, adaptive)

- Source dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1); variant adaptation; seed 1004
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}; actual outcome: completed

1. **customer turn 0:** I need to book a cleaning please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Tuesday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Erin Hall 242-555-0115
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Tuesday 8am
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Are there other times available?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** 9am works. What will it cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Erin Hall 242-555-0115
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** Great! Please go ahead
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 7:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-5d1a2f2e — Pass (dev-rule-based fallback, adaptive)

- Source dlg-5d1a2f2e-63eb-45a4-b18e-71035ef62e8e (auto-repair-appt-1); variant adaptation; seed 1005
- Mechanism: booking 'for the regular provider', multi-item request, fee question, post-confirmation follow-up
- Changes: tune-up + oil change + stalling -> filling and a cleaning request; inspection fee -> B$75 consultation price only; no invented fee; multiple services: one is booked, the other is flagged, nothing is silently dropped
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}; actual outcome: completed

1. **customer turn 0:** I want an appointment at my regular dentist
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I need a filling, and a cleaning if possible
   **Receptionist:** I can book one service per appointment — which would you like first: Routine cleaning or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
3. **customer turn 2:** Friday 8am
   **Receptionist:** 8:00 AM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","date":"Friday"}`
4. **customer turn 3:** ok then 9am Friday
   **Receptionist:** Got it, thanks. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"09:00"}`
5. **adaptive customer (supplies service):** a filling
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"09:00","service":"Basic filling"}`
6. **customer turn 4:** Frank Gill, 242-555-0116
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00","service":"Basic filling","pendingAction":"confirm_booking"}`
7. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 6:** If it changes I'll call back.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`

### TM-66c6b5b1 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-66c6b5b1-b41e-441c-bc3f-76e7edb7e5ac (auto-repair-appt-1); variant adaptation; seed 1006
- Mechanism: hard deadline (needs it done before a trip), booking for a family member, price question
- Changes: oil change before a trip -> cleaning before a trip; wife's appointment -> patient is the customer's spouse, booked under the spouse's name
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like a cleaning
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** I need it done before Wednesday because I'm travelling.
   **Receptionist:** Just to confirm — would you like to book Routine cleaning? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"10:00"}`
4. **adaptive customer (supplies phone):** 242-555-0117
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550117","date":"Monday","time":"10:00"}`
5. **customer turn 3:** It's for my wife, Janet Smith
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 4:** 242-555-0117
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** How much will it cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
9. **customer turn 7:** Sounds great, thank you
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-87484a2b — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-87484a2b-afe9-4d39-8b24-6118576737a9 (auto-repair-appt-1); variant adaptation; seed 1007
- Mechanism: request is narrowed after a list of problems; customer rejects the first offered time as too late
- Changes: multi-problem car visit -> customer lists three dental concerns then narrows to a filling
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"11:00","name":"Lola Abbott","phone":"+12425550118"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. What day and time works best for you?"

1. **customer turn 0:** Hello I need an appointment please
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I have a cavity, my gums bleed and I'd like a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Actually I just want the filling done first
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
4. **customer turn 3:** Name is Lola Abbott, 242-555-0118
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Lola Abbott","phone":"+12425550118","service":"Basic filling"}`
5. **customer turn 4:** Next Thursday is too far, what about Tuesday 11am?
   **Receptionist:** I have you down for Basic filling on Tuesday, August 25 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lola Abbott","phone":"+12425550118","service":"Basic filling","date":"Tuesday","time":"11:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Tuesday, August 25 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-a8533b60 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1); variant adaptation; seed 1008
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}; actual outcome: completed

1. **customer turn 0:** I need an appointment Monday morning
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **customer turn 1:** A cleaning
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
3. **adaptive customer (supplies time):** 9:30am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning","time":"09:30"}`
4. **customer turn 2:** John Smith
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"John Smith","date":"Monday","service":"Routine cleaning","time":"09:30"}`
5. **customer turn 3:** 2425550119
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 9:30 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","time":"09:30","pendingAction":"confirm_booking"}`
6. **customer turn 4:** yes that works, 9:30
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Monday, August 24 at 9:30 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","time":"09:30","pendingAction":"confirm_booking"}`
7. **customer turn 5:** ok please do
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 9:30 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-b2e78e29 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-b2e78e29-bb98-4a4b-aa72-1dc4296cf2cc (auto-repair-appt-1); variant adaptation; seed 1009
- Mechanism: name interrupted/corrected, payment + rental + transport questions with unconfigured answers
- Changes: 'do you accept checks' / 'rental place nearby' -> unconfigured facts must be deferred
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Matthew Ross","phone":"+12425550120"}; actual outcome: completed

1. **customer turn 0:** Hi, this is Matt, I need a filling
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Friday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
4. **customer turn 3:** Oh sorry, it's Matthew Ross, 242-555-0120
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Do you accept checks?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 6:** Is there parking nearby?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-da2f3e45 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-da2f3e45-5d76-4e15-8ae9-d7cafe2873b7 (auto-repair-appt-1); variant adaptation; seed 1010
- Mechanism: preferred day, duration question, directions request
- Changes: oil change -> cleaning; directions answered from the configured address only
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"10:00","name":"Gina Hart","phone":"+12425550121"}; actual outcome: completed

1. **customer turn 0:** I need to schedule a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Tuesday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"10:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"10:00"}`
4. **adaptive customer (supplies name, phone):** Gina Hart 242-555-0121
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Tuesday 10am
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Gina Hart, 242-555-0121
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** How long will it take?
   **Receptionist:** Routine cleaning takes about 60 minutes. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Can you give me directions?
   **Receptionist:** We're at Shirley St., Nassau, The Bahamas. I can't give turn-by-turn directions, but that address should work in a maps app. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-db02658a — Pass (dev-rule-based fallback, adaptive)

- Source dlg-db02658a-e254-4b8a-949e-7cb7ca04800c (auto-repair-appt-1); variant adaptation; seed 1011
- Mechanism: price first, then book; joking aside; add-on symptom raised after contact details
- Changes: oil change price query -> cleaning price query; no source prices; nail in tire -> sudden tooth sensitivity (note only); address joke ignored safely
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"10:00","name":"Hugh Ince","phone":"+12425550122"}; actual outcome: completed

1. **customer turn 0:** How much is a cleaning?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes.
   _state:_ `{}`
2. **customer turn 1:** ok let's book the cleaning Wednesday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"10:00"}`
3. **customer turn 2:** Hugh Ince 242-555-0122
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
4. **customer turn 3:** Just kidding about the address, you don't need it
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Actually one of my teeth has been sensitive, add that to the visit
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-136f95ec — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-136f95ec-e309-4246-a6d9-2b4e8beaba7f (auto-repair-appt-1); variant adaptation; seed 1012
- Mechanism: terse fragments incl. unsupported size/model word, time of day only ('morning'), price after contact
- Changes: car model/size answers -> no-op noise ('XL') that must not corrupt state
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"10:00","name":"Jon Madden","phone":"+12425550123"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 6: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** Hi I would like to book a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Thursday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"10:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"10:00"}`
4. **adaptive customer (supplies name, phone):** Jon Madden 242-555-0123
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** XL
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Morning
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** 10am Thursday
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Jon Madden
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** 242-555-0123
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** Thanks, can you tell me how much it will cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
11. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 27 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-1671146d — Pass (dev-rule-based fallback, adaptive)

- Source dlg-1671146d-10be-460d-9f3a-ecb758f8078c (auto-repair-appt-1); variant adaptation; seed 1013
- Mechanism: multi-turn availability negotiation: day refused, 'too early', alternative accepted
- Changes: busy-Thursday and 'too early' negotiation preserved; tire PSI request removed (unsupported)
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"13:00","name":"Ian Poole","phone":"+12425550124"}; actual outcome: completed

1. **customer turn 0:** I need a dental exam
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Thursday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Ian Poole 242-555-0124
   **Receptionist:** I have you down for Dental consultation / basic exam on Thursday, August 27 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Thursday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 3:** Sorry, no. I forgot, my schedule is busy on Thursday.
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","time":"09:00"}`
6. **customer turn 4:** Friday please
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
7. **customer turn 5:** That's too early. Any other time on Friday?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Friday"}`
8. **customer turn 6:** Friday 1pm works
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Friday","time":"13:00","pendingAction":"confirm_booking"}`
9. **customer turn 7:** Ian Poole 242-555-0124
   **Receptionist:** I'm still holding this for your answer. I have you down for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Friday","time":"13:00","pendingAction":"confirm_booking"}`
10. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-29f37e32 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-29f37e32-23e0-4f19-aab7-916a40861608 (auto-repair-appt-1); variant adaptation; seed 1014
- Mechanism: urgency + successive earlier-time pushes; booking must respect business hours
- Changes: 7am/8am requests are outside configured hours (opens 9); axle/pulling symptom -> mild jaw ache (not an emergency)
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Tuesday","preferredTime":"09:00","name":"Jake Bauers","phone":"+12425550125"}; actual outcome: completed

1. **customer turn 0:** I want a consultation, my jaw has been aching
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **adaptive customer (supplies date):** Tuesday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Tuesday"}`
4. **customer turn 2:** Jake Bauers, 242-555-0125
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
5. **customer turn 3:** This is urgent. Can I come at 7am Tuesday?
   **Receptionist:** 7:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
6. **customer turn 4:** What about 8am?
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
7. **customer turn 5:** Nothing earlier than that?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
8. **customer turn 6:** Oh ok, then 9am Tuesday.
   **Receptionist:** I have you down for Dental consultation / basic exam on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-3d00c7a6 — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-3d00c7a6-6556-4954-adcf-97ca7a4f6b77 (auto-repair-appt-1); variant adaptation; seed 1015
- Mechanism: conflict with customer's own meeting, then add-on request, partial contact info over several turns
- Changes: oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed); contact info volunteered as 'maybe my name and phone' fragments
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}; actual outcome: escalated
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] detail-loss @script turn 2: date changed from "2026-08-20" to "Wednesday" without a customer correction

1. **customer turn 0:** I need a cleaning, tomorrow or later today if you can
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
2. **adaptive customer (supplies time):** 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Maggie Rivera 242-555-0126
   **Receptionist:** I have you down for Routine cleaning on Thursday at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","phone":"+12425550126","service":"Routine cleaning","date":"2026-08-20","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Oh no, I have a meeting at 10am. What about earlier? Wednesday 9am?
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","phone":"+12425550126","service":"Routine cleaning","date":"Wednesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** That is perfect
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 4:** Let me think.
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
8. **customer turn 5:** I also need my tires rotated
   **Receptionist:** That isn't one of the services I can book here — I can book Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). The team can tell you whether they offer it — say "talk to someone" if you'd like them to follow up.
   _state:_ `{}`
9. **customer turn 6:** Maggie Rivera
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do? Tell me in your own words.
   _state:_ `{"unclearTurnCount":1}`
10. **customer turn 7:** yes. 242-555-0126
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
11. **customer turn 8:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-4b9c7860 — Safe but incomplete (dev-rule-based fallback, adaptive)

- Source dlg-4b9c7860-5de3-40ea-a210-57ecbca80427 (auto-repair-appt-1); variant adaptation; seed 1016
- Mechanism: drop-off with shuttle question, 'record is under my personal account' remark, decline of extra help
- Changes: shuttle -> unconfigured amenity; must be deferred, never confirmed
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hello, I want to make an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Tuesday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Igor Horne 242-555-0127
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Tuesday morning, 9am
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Igor Horne, 242-555-0127. Also my record is under my personal number, please note it. Do you offer a shuttle?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** No thank you, I'll arrange it myself
   **Receptionist:** No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","justDeclined":true,"date":"Tuesday","time":"09:00"}`
8. **customer turn 5:** yes
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`

### TM-4ebc6c62 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-4ebc6c62-8065-46ec-ba02-0766a86bcb8a (auto-repair-appt-1); variant adaptation; seed 1017
- Mechanism: assistant-memory presumptions ('the one I went to last time'), earlier-than-offered push, contact preference
- Changes: 'the shop I went to last time' -> 'same as my last visit': no history exists, must not invent one
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"14:00","name":"Kara Lowe","phone":"+12425550128"}; actual outcome: completed

1. **customer turn 0:** Can you book me for the same thing as last time?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaning, I guess
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **adaptive customer (supplies date, time):** Thursday 2pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"14:00"}`
4. **customer turn 2:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"14:00"}`
5. **adaptive customer (supplies name, phone):** Kara Lowe 242-555-0128
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Kara Lowe","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Thursday 2pm
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Thursday, August 20 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Kara Lowe","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** Name is Kara Lowe, use 242-555-0128 not my other number
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Kara Lowe","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 2:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-53cfb4bd — Pass (dev-rule-based fallback, adaptive)

- Source dlg-53cfb4bd-089b-4d88-9497-e928a7d4eb8c (auto-repair-appt-1); variant adaptation; seed 1018
- Mechanism: weekend request against weekday-only hours; customer relents to a valid weekday morning
- Changes: Saturday March 30 -> Saturday (closed per configured hours); 'ask Jim' -> no staff names; ask for a morning slot
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"09:00","name":"Nia Vance","phone":"+12425550129"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like a cleaning but I'm busy this week, can we try Saturday?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
2. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
3. **customer turn 2:** Saturday morning 9am
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00"}`
4. **customer turn 3:** 11am won't work, I have brunch. Can you do 9?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00"}`
5. **customer turn 4:** OK what about Friday 9am then?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00","date":"Friday"}`
6. **customer turn 5:** Nia Vance, 242-555-0129
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
7. **customer turn 6:** How much is the cleaning?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-60cceb98 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1); variant adaptation; seed 1019
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}; actual outcome: completed

1. **customer turn 0:** I'd like a cleaning next week
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 12:30pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
4. **customer turn 3:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Wait, I can't do 12:30, can you change it to 1:30?
   **Receptionist:** And what time? Did you mean 1:30 AM or 1:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","pendingBareTime":"1:30"}`
6. **adaptive customer (supplies time):** 1:30pm
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 1:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"13:30","pendingAction":"confirm_booking"}`
7. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 1:30 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-70bc0cb6 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-70bc0cb6-d391-4f7e-bf11-bcc65e3363f3 (auto-repair-appt-1); variant adaptation; seed 1020
- Mechanism: vague problem, wrong-vehicle correction, same-day pressure, repair-duration question
- Changes: vehicle correction (Ram vs Corolla) -> service correction (filling vs cleaning); 'how long will it take to fix' -> must give only configured procedure duration
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"16:00","name":"Suzy Baker","phone":"+12425550131"}; actual outcome: completed

1. **customer turn 0:** Hey, something's wrong with my tooth, can I come in sometime soon?
   **Receptionist:** I'm sorry you're dealing with that. I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** Suzy Baker, 242-555-0131
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Suzy Baker","phone":"+12425550131"}`
3. **adaptive customer (supplies date, time):** Thursday 4pm
   **Receptionist:** I have you down for Dental consultation / basic exam on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
4. **customer turn 2:** Sorry, I meant a filling, not a cleaning
   **Receptionist:** I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
5. **customer turn 3:** Is there anything this afternoon? Thursday 4pm?
   **Receptionist:** I'm still holding this for your answer. I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 4:** How long will it take if there's a problem?
   **Receptionist:** Basic filling takes about 45 minutes. I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** ok that works
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 6:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-71cbe988 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-71cbe988-8a26-4217-b466-db33a1840d46 (auto-repair-appt-1); variant adaptation; seed 1021
- Mechanism: customer repeats name/phone after an after-work time change
- Changes: duplicate contact message must not duplicate or corrupt state; evening time clipped to 5pm close
- Expected: outcome `unresolved`, bookings 0; actual outcome: unresolved

1. **customer turn 0:** I'd like to book a general check-up and a filling
   **Receptionist:** I can book one service per appointment — which would you like first: Dental consultation / basic exam or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A consultation first
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Tomorrow morning at 10 am would be ideal
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"2026-08-21","time":"10:00"}`
4. **customer turn 3:** Actually I'd prefer after work, do you have 5pm?
   **Receptionist:** 5:00 PM on Friday, August 21 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"2026-08-21"}`
5. **customer turn 4:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`
6. **customer turn 5:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`
7. **customer turn 6:** yes
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`

### TM-73b0e503 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-73b0e503-42ec-49e8-839a-1104907f686e (auto-repair-appt-1); variant adaptation; seed 1022
- Mechanism: pain symptom + immediate availability push + evening fallback accepted reluctantly
- Changes: clutch failing -> loose crown (urgent but not an emergency); 'this evening' is after hours and must not be booked
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"15:00","name":"Mina Shaw","phone":"+12425550133"}; actual outcome: completed

1. **customer turn 0:** Hello, I need to get my tooth looked at, a crown came loose
   **Receptionist:** I'm sorry you're dealing with that. I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** Mina Shaw, 242-555-0133
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133"}`
3. **customer turn 2:** It's a consultation. Do you have anything today around 2?
   **Receptionist:** And what time? Did you mean 2:00 AM or 2:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"2026-08-20","pendingBareTime":"2:0"}`
4. **customer turn 3:** How about this evening?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"2026-08-20","pendingBareTime":"2:0"}`
5. **customer turn 4:** Okay, Wednesday 3pm then
   **Receptionist:** I have you down for Dental consultation / basic exam on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-7a8274ab — Pass (dev-rule-based fallback, adaptive)

- Source dlg-7a8274ab-8a70-44f3-80df-197601afc7d6 (auto-repair-appt-1); variant adaptation; seed 1023
- Mechanism: customer asks the assistant to use an 'online tool', pushes same-day then accepts later time
- Changes: 'online tool' is this chat itself; assistant must not claim to call or text third parties
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Arnold Benjamin","phone":"+12425550134"}; actual outcome: completed

1. **customer turn 0:** Hi, can you set up an appointment for me?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **customer turn 3:** I'd like to get it done today if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
5. **customer turn 4:** How's 4:30pm? Thursday
   **Receptionist:** 4:30 PM on Thursday, August 20 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
6. **customer turn 5:** What about 5:30pm?
   **Receptionist:** 5:30 PM on Thursday, August 20 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
7. **customer turn 6:** Arnold Benjamin, 242-555-0134
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Arnold Benjamin","phone":"+12425550134","service":"Routine cleaning","date":"2026-08-20"}`
8. **customer turn 7:** Thursday 4pm is fine then
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Arnold Benjamin","phone":"+12425550134","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-8e3522af — Pass (dev-rule-based fallback, adaptive)

- Source dlg-8e3522af-9e99-405b-baa4-737eefbd2c4f (auto-repair-appt-1); variant adaptation; seed 1024
- Mechanism: frustrated repeated same-day demands, price asked twice, asks assistant to arrange an unrelated third-party service
- Changes: window leak/rain -> chipped tooth; 'rental car' request -> unsupported third-party task
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"14:00","name":"Pat Cruz","phone":"+12425550135"}; actual outcome: completed

1. **customer turn 0:** I need a filling today, my tooth chipped
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"2026-08-20"}`
2. **customer turn 1:** Pat Cruz, 242-555-0135
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
3. **customer turn 2:** Is there no way we can have it done today? Nothing is making it change?
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
4. **customer turn 3:** How much was it going to be, you never said?
   **Receptionist:** Basic filling is B$175 and takes about 45 minutes. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
5. **customer turn 4:** This is ridiculous, I can't believe there's nothing today
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
6. **customer turn 5:** Fine, book Wednesday 2pm. Run it by me again first.
   **Receptionist:** I have you down for Basic filling on Wednesday, August 26 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"Wednesday","time":"14:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Basic filling on Wednesday, August 26 at 2:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** Also please arrange a ride for me for tomorrow
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-92975e16 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-92975e16-5436-4179-9f4c-e680c623271e (auto-repair-appt-1); variant adaptation; seed 1025
- Mechanism: date negotiated across turns, fee question, add-on mid-flow, final read-back
- Changes: inspection fee -> consultation price; 'add oil change' -> add cleaning note, no silent drops
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"09:00","name":"Lena Ford","phone":"+12425550136"}; actual outcome: completed

1. **customer turn 0:** Hello, I think I'm due for a check-up, can you set up an appointment?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **customer turn 1:** Yes that would be great.
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Thursday morning before work would work best
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday"}`
4. **customer turn 3:** Friday 9am is fine then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday","time":"09:00"}`
5. **adaptive customer (supplies name, phone):** Lena Ford 242-555-0136
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lena Ford","phone":"+12425550136","service":"Dental consultation / basic exam","date":"Friday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 4:** Can you ask what the exam fee is?
   **Receptionist:** Dental consultation / basic exam is B$75 and takes about 30 minutes. I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lena Ford","phone":"+12425550136","service":"Dental consultation / basic exam","date":"Friday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** Lena Ford, 242-555-0136
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lena Ford","phone":"+12425550136","service":"Dental consultation / basic exam","date":"Friday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-9f67b33c — Pass (dev-rule-based fallback, adaptive)

- Source dlg-9f67b33c-4074-4acf-9b9d-17f69bc00073 (auto-repair-appt-1); variant adaptation; seed 1026
- Mechanism: multi-item request + fee-up-front question + loaner-vehicle offer (unsupported perk)
- Changes: loaner car -> unconfigured perk; must not accept or promise one
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Michael Gibson","phone":"+12425550137"}; actual outcome: completed

1. **customer turn 0:** Hello, I'm calling to book an appointment
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **adaptive customer (supplies service):** a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 1:** I'm Michael Gibson, 242-555-0137
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning"}`
4. **adaptive customer (supplies date, time):** Monday 9am
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** A cleaning, and I also want something checked, a strange pain when I bite
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Do you charge any fee up front?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** See if you can fit me in Monday at 9am
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Do you offer a loaner or ride service?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-e0a60506 — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-e0a60506-5c3f-4308-a716-34f02f27e273 (auto-repair-appt-1); variant adaptation; seed 1027
- Mechanism: customer volunteers extra personal detail (home address) and 'urgent as soon as possible'
- Changes: street address volunteered -> not collected; must not be stored as name/phone
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"09:00","name":"Max Reed","phone":"+12425550138"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 6: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** I need an appointment please, my tooth has a loud ache, maybe I need a filling
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **adaptive customer (supplies date, time):** Tuesday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Tuesday","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Tuesday","time":"09:00"}`
4. **adaptive customer (supplies phone):** 242-555-0138
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00"}`
5. **customer turn 2:** Max Reed
   **Receptionist:** I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** My address is 12 Palm Ave, Nassau
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** 2425550138
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** It's urgent, as soon as possible. Tuesday 9am?
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** Please schedule it. What about the cost?
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-003677eb — Pass (dev-rule-based fallback, adaptive)

- Source dlg-003677eb-20f8-4b1e-a396-c0f95a786543 (auto-repair-appt-1); variant adaptation; seed 1028
- Mechanism: driving customer, three requests at once, earliest-slot demand, then a late-time proposal that is invalid
- Changes: 4:45pm for a 60-minute cleaning ends after the 5pm close
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Henry James","phone":"+18885430099"}; actual outcome: completed

1. **customer turn 0:** Hey, I'm driving, set me up for a cleaning and a filling please
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **customer turn 1:** A cleaning first
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** It's pretty urgent. What's the earliest you have, Friday?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
4. **customer turn 3:** I really need it today before my trip tomorrow
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
5. **customer turn 4:** No that's too late. Could I get in at 4:45pm Friday?
   **Receptionist:** 4:45 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
6. **customer turn 5:** Friday 3pm is fine, thanks
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"15:00"}`
7. **customer turn 6:** Henry James, 888 543 0099
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Henry James","phone":"+18885430099","date":"Friday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-038e5414 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-038e5414-bc32-426b-8c19-9e583bf18cc5 (auto-repair-appt-1); variant adaptation; seed 1029
- Mechanism: multiple warning symptoms at once + shuttle + 'make it later today'
- Changes: dashboard alerts -> multiple dental alarm symptoms (swelling, fever, pain): emergency handoff
- Expected: outcome `escalated`, bookings 0, ; actual outcome: escalated

1. **customer turn 0:** Hi, is this the dentist?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **customer turn 1:** I need to come in, I'm Jake
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **customer turn 2:** My face is swollen, I have a fever and a terrible toothache since yesterday
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **customer turn 3:** Can you make it later today?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **customer turn 4:** Do you have a shuttle to bring me home?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-078a0f20 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1); variant adaptation; seed 1030
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}; actual outcome: completed

1. **customer turn 0:** I need an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date):** Wednesday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
3. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **customer turn 2:** Wednesday if possible
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
5. **customer turn 3:** Anything sooner than 3pm?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **adaptive customer (supplies name, phone):** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** oh well. book Wednesday 3pm then
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Megan Smith 242-555-0139
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes that's right
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 7:** No thanks
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-17420eb9 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-17420eb9-65ab-46ae-9e6b-f0031d415ea7 (auto-repair-appt-1); variant adaptation; seed 1031
- Mechanism: question the system cannot answer from configuration ('ask them what I've done in the past'), duration question
- Changes: service-history lookup is unavailable to the receptionist; must not invent history
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}; actual outcome: completed

1. **customer turn 0:** Can you make an appointment for me? I need a cleaning and a filling
   **Receptionist:** I can book one service per appointment — which would you like first: Routine cleaning or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaning first. 242-555-0140 is my number, Mike Jones
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 11am
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
4. **adaptive customer (supplies name):** Mike Jones
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Mike Jones","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00","pendingAction":"confirm_booking"}`
5. **customer turn 3:** I have no idea what I've had done before. Ask them what I've had in the past.
   **Receptionist:** No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?
   _state:_ `{"intent":"book_appointment","name":"Mike Jones","phone":"+12425550140","justDeclined":true,"service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
6. **customer turn 4:** How long will it take?
   **Receptionist:** Routine cleaning takes about 60 minutes. I have you down for Routine cleaning on Tuesday, August 25 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Mike Jones","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-1b47bb2b — Pass (dev-rule-based fallback, adaptive)

- Source dlg-1b47bb2b-61b1-46b2-879a-719e939cf2f5 (restaurant-table-2); variant adaptation; seed 1032
- Mechanism: propose slot -> anything later? -> switch provider -> seat-type request unsupported
- Changes: restaurant/booth/bar seating -> dentist chair preferences (unsupported); no second location exists
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Tanya Rolle","phone":"+12425550141"}; actual outcome: completed

1. **customer turn 0:** Can I make an appointment please?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaning, Thursday night at 8pm. Anything open?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
3. **customer turn 2:** Anything after 8pm? What about 8:30 or 9pm?
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
4. **customer turn 3:** OK what about another dental office across town?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
5. **customer turn 4:** Thursday 4pm here works. Can I get a window chair too?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
6. **customer turn 5:** Tanya Rolle 242-555-0141
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Tanya Rolle","phone":"+12425550141","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes, all good
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0b5b803f — Test-script mismatch (dev-rule-based fallback, adaptive)

- Source dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2); variant adaptation; seed 1033
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}; actual outcome: escalated
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] fixture-order-mismatch: booked service="Routine cleaning", expected "Basic filling"

1. **customer turn 0:** I'd like to book a cleaning for Friday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **adaptive customer (supplies name, phone):** Dina Gray 242-555-0142
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dina Gray","phone":"+12425550142","service":"Routine cleaning","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
3. **customer turn 1:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
4. **customer turn 2:** Actually could we do Monday at 11am instead?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
5. **customer turn 3:** Hm, could I go back to Friday 10am but make it a filling?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
6. **customer turn 4:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dina Gray","phone":"+12425550142","service":"Basic filling","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** yes
   **Receptionist:** Sorry — I wasn't able to complete that. I've flagged this for the team to follow up with you directly.
   _state:_ `{}` _actions:_ request_appointment (failed), escalate

### TM-1159607c — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-1159607c-85d2-4899-bb3b-9db2ff0933a4 (restaurant-table-2); variant adaptation; seed 1034
- Mechanism: off-topic menu questions, then pivot to a real booking; unsupported items must not be 'ordered'
- Changes: jambalaya/Dr. Pepper/menu questions -> out-of-scope asks (food, drinks); no order is created
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"16:00","name":"Evan Pratt","phone":"+12425550143"}; actual outcome: escalated
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"

1. **customer turn 0:** Hi, I'd like to book for tonight at 8pm. Do you serve jambalaya? Do you have Dr. Pepper?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`
2. **customer turn 1:** Actually I'd like to book a consultation Wednesday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00"}`
3. **adaptive customer (supplies name, phone):** Evan Pratt 242-555-0143
   **Receptionist:** I have you down for Dental consultation / basic exam on Wednesday, August 26 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Evan Pratt","phone":"+12425550143","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00","pendingAction":"confirm_booking"}`
4. **customer turn 2:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Wednesday, August 26 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
5. **customer turn 3:** Could we order two miso soups too?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
6. **customer turn 4:** Evan Pratt 242-555-0143
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
7. **customer turn 5:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-3660ae8b — Pass (dev-rule-based fallback, adaptive)

- Source dlg-3660ae8b-6892-49a4-8e81-7617ed38127a (restaurant-table-3); variant adaptation; seed 1035
- Mechanism: repeated alternative probing at one time slot, then customer gives up (abandon with no booking)
- Changes: indoor/outdoor seating probes -> chair/room preferences; customer ends with no booking
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** I'd like an appointment for 12:00pm today
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00"}`
2. **customer turn 1:** a cleaning, just me
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
3. **customer turn 2:** Is there anything after that? When is the next availability?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
4. **customer turn 3:** Is there an outdoor room available at 12:00?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
5. **customer turn 4:** What about Thursday at 12pm?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Thursday","time":"12:00","service":"Routine cleaning"}`
6. **customer turn 5:** Ok. I will book next time.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`

### TM-590f7375 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-590f7375-238c-49d2-b3b8-7e537d210d4d (restaurant-table-1); variant adaptation; seed 1036
- Mechanism: criteria search (cuisine, budget, rating) + hotel location question + group split
- Changes: cuisine/budget/rating criteria -> price/quality filter requests that cannot be served; 'table for six/two tables' -> several patients: one booking per patient, no group booking invented
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Ruth Sims","phone":"+12425550144"}; actual outcome: completed

1. **customer turn 0:** I'm looking to book dental care for my family on Monday
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **adaptive customer (supplies service):** a consultation
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Dental consultation / basic exam"}`
3. **customer turn 1:** I want the cheapest option under B$100
   **Receptionist:** The lowest-priced service I can book is Dental consultation / basic exam at B$75. Prices for the others: Routine cleaning B$125; Basic filling B$175; Root canal B$950. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Dental consultation / basic exam"}`
4. **adaptive customer (supplies time):** 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Dental consultation / basic exam","time":"10:00"}`
5. **customer turn 2:** Does the clinic have at least four stars on Google? What building is it in?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Dental consultation / basic exam","time":"10:00"}`
6. **adaptive customer (supplies name, phone):** Ruth Sims 242-555-0144
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Ruth Sims","phone":"+12425550144","date":"Monday","service":"Dental consultation / basic exam","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 3:** Can you book six people at once at 8pm?
   **Receptionist:** 8:00 PM on Monday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","name":"Ruth Sims","phone":"+12425550144","date":"Monday","service":"Dental consultation / basic exam"}`
8. **customer turn 4:** Ok then a consultation for me, Monday 10am. Ruth Sims 242-555-0144
   **Receptionist:** I'm still holding this for your answer. I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Ruth Sims","phone":"+12425550144","date":"Monday","service":"Dental consultation / basic exam","time":"10:00","pendingAction":"confirm_booking"}`
9. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 6:** Does the clinic have a dress code?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-5e0469c8 — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-5e0469c8-0968-40ad-8c22-6c118afaa781 (restaurant-table-2); variant adaptation; seed 1037
- Mechanism: alternate provider probing, outdoor/gluten-free/parking questions, headcount change at confirmation
- Changes: gluten-free/parking/outdoor -> unconfigured facts; party size 4 -> 6 change is not a clinic concept
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"10:00","name":"Andre Cox","phone":"+12425550145"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** I'd like to find a dentist for a filling
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **customer turn 1:** Let's try Thursday at 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"09:00"}`
3. **adaptive customer (supplies name, phone):** Andre Cox 242-555-0145
   **Receptionist:** I have you down for Basic filling on Thursday, August 27 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"09:00","pendingAction":"confirm_booking"}`
4. **customer turn 2:** I'd like 10am then
   **Receptionist:** I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 3:** Is there outside seating or a waiting area? Is there parking?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 4:** Great, please book the filling for 10am Thursday
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** Andre Cox 242-555-0145
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 27 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-92fb5414 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-92fb5414-3316-4340-b2a2-18a3c9d43bc8 (restaurant-table-3); variant adaptation; seed 1038
- Mechanism: customer gives up after repeated slot misses (abandon without booking)
- Changes: restaurant search near me -> no other clinics exist; abandons after slot refusals
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** Hey, can I get a cleaning at a dentist near me tonight?
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** Friday at 7pm then
   **Receptionist:** 7:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
3. **customer turn 2:** Just me. Could I get a chair near the window?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
4. **customer turn 3:** Do you have anything at 8pm?
   **Receptionist:** 8:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
5. **customer turn 4:** What about 9pm?
   **Receptionist:** 9:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
6. **customer turn 5:** Okay, never mind about the appointment then.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`
7. **customer turn 6:** It's alright. Thank you for trying.
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-c4801b6b — Pass (dev-rule-based fallback, adaptive)

- Source dlg-c4801b6b-3d1a-43b8-97e1-02be355e646d (restaurant-table-3); variant adaptation; seed 1039
- Mechanism: frustration after failed attempts, then withdrawal
- Changes: steak/seafood -> cleaning; 'lost my appetite' -> frustrated withdrawal
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** Hello, I want a cleaning tonight at 7pm
   **Receptionist:** 7:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** What about 6pm?
   **Receptionist:** 6:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Ok, let's skip that. Either 6 or 7pm would work.
   **Receptionist:** I haven't set a time yet — I need one exact time (for example, 3:00 pm) and the day. What day, and which exact time?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","timeClarification":true}`
4. **customer turn 3:** Oh no, how frustrating!!!
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","timeClarification":true}`
5. **customer turn 4:** No, I think I'm just going to sit this one out.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`
6. **customer turn 5:** No, not right now, I've got to go, bye
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else. Tell me in your own words.
   _state:_ `{}`

### TM-0341f269 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-0341f269-5d30-4ec7-bd67-672f8a715f89 (restaurant-table-2); variant adaptation; seed 1040
- Mechanism: name two venues in sequence; party-size and day given; 'change my reservation to a different place'
- Changes: 'different restaurant' -> different service; slot corrected to within hours
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"10:00","name":"Opal Day","phone":"+12425550146"}; actual outcome: completed

1. **customer turn 0:** Hi, I would like to make an appointment.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** For a consultation, for 2 people
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingBareTime":"2:0"}`
3. **customer turn 2:** I want 8pm on Saturday.
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"20:00"}`
4. **customer turn 3:** Ok, what about 7pm?
   **Receptionist:** 7:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
5. **customer turn 4:** Ok, I would like to change it to a cleaning instead, Friday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
6. **customer turn 5:** Opal Day 242-555-0146
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Opal Day","phone":"+12425550146","service":"Routine cleaning","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0907b949 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-0907b949-f00c-4595-8c1a-8978665bf1b6 (restaurant-table-2); variant adaptation; seed 1041
- Mechanism: tonight slot, then 7?, then back to original time, high-chair special request added late
- Changes: high-chair request -> child-seating/other special request; unconfigured accommodations not promised
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Zane Moss","phone":"+12425550147"}; actual outcome: completed

1. **customer turn 0:** I'd like an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date):** Thursday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
3. **customer turn 1:** Nassau
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
4. **customer turn 2:** Thursday at 8pm
   **Receptionist:** 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
5. **customer turn 3:** Is there anything at 7?
   **Receptionist:** And what time? Did you mean 7:00 AM or 7:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","pendingBareTime":"7:0"}`
6. **customer turn 4:** Thursday 4pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
7. **adaptive customer (supplies name, phone):** Zane Moss 242-555-0147
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Zane Moss","phone":"+12425550147","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Ok, I forgot to ask: my child needs a booster seat in the chair
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I can only book the exact details below — I can't promise anything beyond them (extra requests would need the team). I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Zane Moss","phone":"+12425550147","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** Zane Moss 242-555-0147
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Zane Moss","phone":"+12425550147","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0ea74929 — Test-script mismatch (dev-rule-based fallback, adaptive)

- Source dlg-0ea74929-d1b0-4c2a-8465-6fb65bf8a389 (restaurant-table-2); variant adaptation; seed 1042
- Mechanism: seat preference change, venue switch, tasting-menu / head-chef questions, final time change
- Changes: table by window/fireplace -> unsupported room preferences; menu/chef questions -> unconfigured clinic info
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}; actual outcome: escalated
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] fixture-order-mismatch: booked preferredTime="16:00", expected "15:00"
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up."

1. **customer turn 0:** I'd like to book a cleaning for two
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** Friday 4pm please. Ask for the window chair.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
3. **adaptive customer (supplies name, phone):** Quinn Ali 242-555-0148
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Quinn Ali","phone":"+12425550148","service":"Routine cleaning","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
4. **customer turn 2:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
5. **customer turn 3:** Yes, but I'd like the chair near the outdoor fireplace instead.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`
6. **customer turn 4:** Is Dr. Nia doing it? Are there any specials that day?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`
7. **customer turn 5:** Let's make it 3pm instead
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
8. **customer turn 6:** Quinn Ali 242-555-0148
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
9. **customer turn 7:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-0f57a901 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-0f57a901-2757-464f-9613-132bff3ead34 (restaurant-table-2); variant adaptation; seed 1043
- Mechanism: headcount change mid-flow, scenic-view request, failed date then alternative date, venue changes, no unsupported promises
- Changes: water view/sunset -> unsupported amenity; date 24th->23rd -> weekday swap; multiple venue hops -> multiple service hops
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"15:00","name":"Isla Munn","phone":"+12425550149"}; actual outcome: completed

1. **customer turn 0:** Please book me a filling Friday 6pm
   **Receptionist:** 6:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
2. **customer turn 1:** Make sure the room has a stunning view of the water
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
3. **customer turn 2:** Oh I forgot, include my cousin, so that makes two of us
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
4. **customer turn 3:** Let me know ASAP please
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
5. **customer turn 4:** Try Thursday
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday"}`
6. **customer turn 5:** Darn. What about a classy modern clinic instead?
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday"}`
7. **customer turn 6:** Fine, Thursday 3pm here then. Isla Munn 242-555-0149
   **Receptionist:** I have you down for Basic filling on Thursday, August 20 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Isla Munn","phone":"+12425550149","service":"Basic filling","date":"Thursday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 20 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-209856e2 — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-209856e2-3ec2-464c-bbc5-f6013d138ebb (restaurant-table-1); variant adaptation; seed 1044
- Mechanism: assistant is asked to recall a prior preference ('what's that place I told you to remember'); casual banter
- Changes: recall of a stored restaurant -> recall of a stored dentist/service; no memory exists, must not invent
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"16:00","name":"Cole Nash","phone":"+12425550150"}; actual outcome: completed
- ❌ [incomplete] detail-loss @script turn 2: service changed from "Dental consultation / basic exam" to "Routine cleaning" without a customer correction

1. **customer turn 0:** I'm feeling like I should get my teeth checked!
   **Receptionist:** I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** What's that treatment I told you to remember I liked?
   **Receptionist:** Just to confirm — would you like to book Dental consultation / basic exam? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
3. **customer turn 2:** Will you book me tomorrow night at 8 for a cleaning?
   **Receptionist:** And what time? Did you mean 8:00 AM or 8:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
4. **customer turn 3:** Wow, how did you do that so quickly?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
5. **customer turn 4:** Who's your daddy?
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
6. **customer turn 5:** ok book a cleaning Tuesday at 4pm. Cole Nash 242-555-0150
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Cole Nash","phone":"+12425550150","service":"Routine cleaning","date":"Tuesday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-4d9d8a2b — Safe but incomplete (dev-rule-based fallback, adaptive)

- Source dlg-4d9d8a2b-4e6d-4923-b8a5-bc8fd4037286 (restaurant-table-2); variant adaptation; seed 1045
- Mechanism: special occasion request (cake/gift timing), repeated time moves, patio request, two unrelated details
- Changes: anniversary cake -> birthday cake request (unsupported); party of 8 -> not a clinic concept; patio -> unsupported
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hi, I'd like to book a filling
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **adaptive customer (supplies date):** Friday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
3. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
4. **customer turn 2:** Friday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
5. **adaptive customer (supplies name, phone):** Joy Hall 242-555-0151
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Actually, can we do 4:30?
   **Receptionist:** And what time? Did you mean 4:30 AM or 4:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","pendingBareTime":"4:30"}`
7. **customer turn 4:** Let's make it 4pm after all.
   **Receptionist:** I'm still holding this for your answer. I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** It's my husband's birthday, can you bring out a cake at a certain time?
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** Is there outdoor space like a patio? I'd like to book on the patio.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** Joy Hall 242-555-0151
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
11. **customer turn 8:** No, that sounds right.
   **Receptionist:** Just to be sure I get this right — I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`

### TM-55ab43fe — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-55ab43fe-1b96-4b17-9aa3-6d15cf933780 (restaurant-table-2); variant adaptation; seed 1046
- Mechanism: spelling of a name given letter by letter, party-size (3), venue hop, final read-back confirmation
- Changes: spelling correction must be stored as the final name, not the letters
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}; actual outcome: completed
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}) not found in order

1. **customer turn 0:** Hi there, I'm looking to reserve a cleaning
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** Todd Choiniere. It's spelled C-h-o-i-n-i-e-r-e.
   **Receptionist:** Just to confirm — would you like to book Routine cleaning? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** Is Saturday available?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
4. **customer turn 3:** Hmm okay. What about that next Monday around 9am?
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-24","timeClarification":true}`
5. **adaptive customer (supplies time):** 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-24","time":"09:00"}`
6. **customer turn 4:** 242-555-0152
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550152","date":"2026-08-24","time":"09:00"}`
7. **adaptive customer (supplies name):** Todd Choiniere
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Todd Choiniere","phone":"+12425550152","date":"2026-08-24","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** yes, that's correct
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-56325402 — Pass (dev-rule-based fallback, adaptive)

- Source dlg-56325402-8eb3-4765-9a4a-94eee0d0ab41 (restaurant-table-1); variant adaptation; seed 1047
- Mechanism: recommendation-seeking, quality question, then proceeds; seating preference changes; long inconclusive start
- Changes: 'old-school French restaurant with really good wine' -> 'recommend a service'; no clinical advice invented
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"15:00","name":"Rhea Dunn","phone":"+12425550153"}; actual outcome: completed

1. **customer turn 0:** Hello, I'm looking for a good dental service, what do you recommend?
   **Receptionist:** I can't recommend a treatment over chat — that's for the dentist after an exam. We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). A consultation is the usual starting point.
   _state:_ `{}`
2. **customer turn 1:** Which one is really good?
   **Receptionist:** I can't recommend a treatment over chat — that's for the dentist after an exam. We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). A consultation is the usual starting point. Tell me in your own words.
   _state:_ `{}`
3. **customer turn 2:** Excellent, I'll try the cleaning.
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
4. **customer turn 3:** Thursday around 4pm
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
5. **customer turn 4:** What about 3pm?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"15:00"}`
6. **customer turn 5:** Perfect, I'll take that. Rhea Dunn 242-555-0153
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Rhea Dunn","phone":"+12425550153","date":"Thursday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-65958f69-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-65958f69-c7c0-4dd9-931e-eb0497091f50 (auto-repair-appt-1); variant typo; seed 6000; derived from TM-65958f69
- Mechanism: same-day urgency + add-on detail + mid-flow detail correction + name/phone in one message
- Changes: car/shop -> dental filling at Bahamas Dental Service; 'today' replaced by a configured weekday (clock-independent); second complaint becomes a free-text note; no second service invented; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→filing, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"15:00","name":"Alicia Moss","phone":"+12425550111"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** Hi, can I get a filing this week? Any time before you close.
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **adaptive customer (supplies date, time):** Wednesday 3pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Wednesday","time":"15:00"}`
4. **adaptive customer (supplies name, phone):** Alicia Moss 242-555-0111
   **Receptionist:** I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Wendesday 3pm
   **Receptionist:** I'm still holding this for your answer. I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** actually it's the upper left tooth, not the right
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** Now that you mention it another tooth is sensitive too, note that please
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Alicia Moss 242-555-0111
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Alicia Moss","phone":"+12425550111","service":"Basic filling","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-929b59a3-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1); variant typo; seed 6001; derived from TM-929b59a3
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, cleaning→cleaing, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] reply-must-match @script turn 4: 6pm is after the 5pm close and must not be accepted: reply did not match /outside|open|hours|9/ — "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** I'd like to schedule a cleaing
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Thursday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
4. **adaptive customer (supplies phone):** 242-555-0112
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
5. **customer turn 2:** Brent Cole
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** 242-555-0112
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** Thrusday 6pm
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Can I come in at 4pm then?
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** How much will the cleaing be?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
11. **customer turn 8:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-e32859b3-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-e32859b3-88ca-4617-b7ce-1bc9cd4d42cb (auto-repair-appt-1); variant typo; seed 6003; derived from TM-e32859b3
- Mechanism: service + hours question, day-of-week preference, declining an upsell, graceful close
- Changes: oil change/tune-up -> consultation + cleaning request (one service per booking); 'what days are you open' answered from configured hours; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→conslutation
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Dario Finn","phone":"+12425550114"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** Hi, can I schedule a dental conslutation?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **adaptive customer (supplies date, time):** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday","time":"10:00"}`
3. **customer turn 1:** No, I haven't been before.
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday","time":"10:00"}`
4. **adaptive customer (supplies name, phone):** Dario Finn 242-555-0114
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** What days are you open?
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Okay. I can do any time on Mondays actually.
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** Morning would be best, 10am
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Dario Finn 242-555-0114
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 7:** No that's it, thanks!
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-5cb6cabb-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1); variant typo; seed 6004; derived from TM-5cb6cabb
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}; actual outcome: completed

1. **customer turn 0:** I need to book a cleaing please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Tuesday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Erin Hall 242-555-0115
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Tuesdya 8am
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Are there other times available?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** 9am works. What will it cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Erin Hall 242-555-0115
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** Great! Please go ahead
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 7:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-5d1a2f2e-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-5d1a2f2e-63eb-45a4-b18e-71035ef62e8e (auto-repair-appt-1); variant typo; seed 6005; derived from TM-5d1a2f2e
- Mechanism: booking 'for the regular provider', multi-item request, fee question, post-confirmation follow-up
- Changes: tune-up + oil change + stalling -> filling and a cleaning request; inspection fee -> B$75 consultation price only; no invented fee; multiple services: one is booked, the other is flagged, nothing is silently dropped; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, filling→fillign
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}; actual outcome: completed

1. **customer turn 0:** I want an appointment at my regular dentist
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I need a fillign, and a cleanign if possible
   **Receptionist:** I can book one service per appointment — which would you like first: Routine cleaning or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
3. **customer turn 2:** Friday 8am
   **Receptionist:** 8:00 AM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","date":"Friday"}`
4. **customer turn 3:** ok then 9am Friday
   **Receptionist:** Got it, thanks. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"09:00"}`
5. **adaptive customer (supplies service):** a filling
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"09:00","service":"Basic filling"}`
6. **customer turn 4:** Frank Gill, 242-555-0116
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00","service":"Basic filling","pendingAction":"confirm_booking"}`
7. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 6:** If it changes I'll call back.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`

### TM-66c6b5b1-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-66c6b5b1-b41e-441c-bc3f-76e7edb7e5ac (auto-repair-appt-1); variant typo; seed 6006; derived from TM-66c6b5b1
- Mechanism: hard deadline (needs it done before a trip), booking for a family member, price question
- Changes: oil change before a trip -> cleaning before a trip; wife's appointment -> patient is the customer's spouse, booked under the spouse's name; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like a claening
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** I need it done before Wendesday because I'm travelling.
   **Receptionist:** Just to confirm — would you like to book Routine cleaning? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"10:00"}`
4. **adaptive customer (supplies phone):** 242-555-0117
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550117","date":"Monday","time":"10:00"}`
5. **customer turn 3:** It's for my wife, Janet Smith
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 4:** 242-555-0117
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** How much will it cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Janet Smith","phone":"+12425550117","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
9. **customer turn 7:** Sounds great, thank you
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-87484a2b-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-87484a2b-afe9-4d39-8b24-6118576737a9 (auto-repair-appt-1); variant typo; seed 6007; derived from TM-87484a2b
- Mechanism: request is narrowed after a list of problems; customer rejects the first offered time as too late
- Changes: multi-problem car visit -> customer lists three dental concerns then narrows to a filling; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, filling→fillign
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"11:00","name":"Lola Abbott","phone":"+12425550118"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Got it, thanks. What day and time works best for you?"

1. **customer turn 0:** Hello I need an appointment please
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** I have a cavity, my gums bleed and I'd like a cleaing
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Actually I just want the fillign done first
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
4. **customer turn 3:** Name is Lola Abbott, 242-555-0118
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Lola Abbott","phone":"+12425550118","service":"Basic filling"}`
5. **customer turn 4:** Next Thursday is too far, what about Tuesday 11am?
   **Receptionist:** I have you down for Basic filling on Tuesday, August 25 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lola Abbott","phone":"+12425550118","service":"Basic filling","date":"Tuesday","time":"11:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Tuesday, August 25 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-a8533b60-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1); variant typo; seed 6008; derived from TM-a8533b60
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}; actual outcome: completed

1. **customer turn 0:** I need an apointment Monday morning
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **customer turn 1:** A cleanign
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
3. **adaptive customer (supplies time):** 9:30am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning","time":"09:30"}`
4. **customer turn 2:** John Smith
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"John Smith","date":"Monday","service":"Routine cleaning","time":"09:30"}`
5. **customer turn 3:** 2425550119
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 9:30 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","time":"09:30","pendingAction":"confirm_booking"}`
6. **customer turn 4:** yes that works, 9:30
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Monday, August 24 at 9:30 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","time":"09:30","pendingAction":"confirm_booking"}`
7. **customer turn 5:** ok please do
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 9:30 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-b2e78e29-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-b2e78e29-bb98-4a4b-aa72-1dc4296cf2cc (auto-repair-appt-1); variant typo; seed 6009; derived from TM-b2e78e29
- Mechanism: name interrupted/corrected, payment + rental + transport questions with unconfigured answers
- Changes: 'do you accept checks' / 'rental place nearby' -> unconfigured facts must be deferred; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, Friday→Fridya
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Matthew Ross","phone":"+12425550120"}; actual outcome: completed

1. **customer turn 0:** Hi, this is Matt, I need a fillign
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **customer turn 2:** Fridya 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
4. **customer turn 3:** Oh sorry, it's Matthew Ross, 242-555-0120
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Do you accept checks?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 6:** Is there parking nearby?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-da2f3e45-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-da2f3e45-5d76-4e15-8ae9-d7cafe2873b7 (auto-repair-appt-1); variant typo; seed 6010; derived from TM-da2f3e45
- Mechanism: preferred day, duration question, directions request
- Changes: oil change -> cleaning; directions answered from the configured address only; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"10:00","name":"Gina Hart","phone":"+12425550121"}; actual outcome: completed

1. **customer turn 0:** I need to schedule a cleaing
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Tuesday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"10:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"10:00"}`
4. **adaptive customer (supplies name, phone):** Gina Hart 242-555-0121
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Tuesdya 10am
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Gina Hart, 242-555-0121
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** How long will it take?
   **Receptionist:** Routine cleaning takes about 60 minutes. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Can you give me directions?
   **Receptionist:** We're at Shirley St., Nassau, The Bahamas. I can't give turn-by-turn directions, but that address should work in a maps app. I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-db02658a-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-db02658a-e254-4b8a-949e-7cb7ca04800c (auto-repair-appt-1); variant typo; seed 6011; derived from TM-db02658a
- Mechanism: price first, then book; joking aside; add-on symptom raised after contact details
- Changes: oil change price query -> cleaning price query; no source prices; nail in tire -> sudden tooth sensitivity (note only); address joke ignored safely; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, cleaning→cleanign, Wednesday→Wednsday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"10:00","name":"Hugh Ince","phone":"+12425550122"}; actual outcome: completed

1. **customer turn 0:** How much is a cleanign?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes.
   _state:_ `{}`
2. **customer turn 1:** ok let's book the cleanign Wednsday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"10:00"}`
3. **customer turn 2:** Hugh Ince 242-555-0122
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
4. **customer turn 3:** Just kidding about the address, you don't need it
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 4:** Actually one of my teeth has been sensitive, add that to the visit
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Wednesday, August 26 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-136f95ec-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-136f95ec-e309-4246-a6d9-2b4e8beaba7f (auto-repair-appt-1); variant typo; seed 6012; derived from TM-136f95ec
- Mechanism: terse fragments incl. unsupported size/model word, time of day only ('morning'), price after contact
- Changes: car model/size answers -> no-op noise ('XL') that must not corrupt state; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Thursday→Thurday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"10:00","name":"Jon Madden","phone":"+12425550123"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 6: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** Hi I would like to book a claening
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Thursday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"10:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"10:00"}`
4. **adaptive customer (supplies name, phone):** Jon Madden 242-555-0123
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** XL
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Morning
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** 10am Thurday
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Jon Madden
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** 242-555-0123
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** Thanks, can you tell me how much it will cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
11. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 27 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-1671146d-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-1671146d-10be-460d-9f3a-ecb758f8078c (auto-repair-appt-1); variant typo; seed 6013; derived from TM-1671146d
- Mechanism: multi-turn availability negotiation: day refused, 'too early', alternative accepted
- Changes: busy-Thursday and 'too early' negotiation preserved; tire PSI request removed (unsupported); typo variant: content-word misspellings (see typoEdits)
- Typo edits: Thursday→Thrusday, Thursday→Thrusday, Friday→Fridya, Friday→Fridya, Friday→Fridya
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"13:00","name":"Ian Poole","phone":"+12425550124"}; actual outcome: completed

1. **customer turn 0:** I need a dental exam
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Thrusday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Ian Poole 242-555-0124
   **Receptionist:** I have you down for Dental consultation / basic exam on Thursday, August 27 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Thursday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 3:** Sorry, no. I forgot, my schedule is busy on Thrusday.
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","time":"09:00"}`
6. **customer turn 4:** Fridya please
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
7. **customer turn 5:** That's too early. Any other time on Fridya?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Friday"}`
8. **customer turn 6:** Fridya 1pm works
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Friday","time":"13:00","pendingAction":"confirm_booking"}`
9. **customer turn 7:** Ian Poole 242-555-0124
   **Receptionist:** I'm still holding this for your answer. I have you down for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Ian Poole","phone":"+12425550124","date":"Friday","time":"13:00","pendingAction":"confirm_booking"}`
10. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Friday, August 21 at 1:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-29f37e32-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-29f37e32-23e0-4f19-aab7-916a40861608 (auto-repair-appt-1); variant typo; seed 6014; derived from TM-29f37e32
- Mechanism: urgency + successive earlier-time pushes; booking must respect business hours
- Changes: 7am/8am requests are outside configured hours (opens 9); axle/pulling symptom -> mild jaw ache (not an emergency); typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Tuesday→Tuesdya, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Tuesday","preferredTime":"09:00","name":"Jake Bauers","phone":"+12425550125"}; actual outcome: completed

1. **customer turn 0:** I want a consultaton, my jaw has been aching
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **adaptive customer (supplies date):** Tuesday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Tuesday"}`
4. **customer turn 2:** Jake Bauers, 242-555-0125
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
5. **customer turn 3:** This is urgent. Can I come at 7am Tuesdya?
   **Receptionist:** 7:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
6. **customer turn 4:** What about 8am?
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
7. **customer turn 5:** Nothing earlier than that?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday"}`
8. **customer turn 6:** Oh ok, then 9am Tuesdya.
   **Receptionist:** I have you down for Dental consultation / basic exam on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-3d00c7a6-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-3d00c7a6-6556-4954-adcf-97ca7a4f6b77 (auto-repair-appt-1); variant typo; seed 6015; derived from TM-3d00c7a6
- Mechanism: conflict with customer's own meeting, then add-on request, partial contact info over several turns
- Changes: oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed); contact info volunteered as 'maybe my name and phone' fragments; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Wednesday→Wednsday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}; actual outcome: escalated
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] detail-loss @script turn 2: date changed from "2026-08-20" to "Wednesday" without a customer correction

1. **customer turn 0:** I need a claening, tomorrow or later today if you can
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
2. **adaptive customer (supplies time):** 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Maggie Rivera 242-555-0126
   **Receptionist:** I have you down for Routine cleaning on Thursday at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","phone":"+12425550126","service":"Routine cleaning","date":"2026-08-20","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Oh no, I have a meeting at 10am. What about earlier? Wednsday 9am?
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","phone":"+12425550126","service":"Routine cleaning","date":"Wednesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** That is perfect
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 4:** Let me think.
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
8. **customer turn 5:** I also need my tires rotated
   **Receptionist:** That isn't one of the services I can book here — I can book Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). The team can tell you whether they offer it — say "talk to someone" if you'd like them to follow up.
   _state:_ `{}`
9. **customer turn 6:** Maggie Rivera
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do? Tell me in your own words.
   _state:_ `{"unclearTurnCount":1}`
10. **customer turn 7:** yes. 242-555-0126
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
11. **customer turn 8:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-4b9c7860-T — Safe but incomplete (dev-rule-based fallback, adaptive)

- Source dlg-4b9c7860-5de3-40ea-a210-57ecbca80427 (auto-repair-appt-1); variant typo; seed 6016; derived from TM-4b9c7860
- Mechanism: drop-off with shuttle question, 'record is under my personal account' remark, decline of extra help
- Changes: shuttle -> unconfigured amenity; must be deferred, never confirmed; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hello, I want to make an apointment for a cleaing
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Tuesday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Igor Horne 242-555-0127
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Tuesday morning, 9am
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Igor Horne, 242-555-0127. Also my record is under my personal number, please note it. Do you offer a shuttle?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** No thank you, I'll arrange it myself
   **Receptionist:** No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","justDeclined":true,"date":"Tuesday","time":"09:00"}`
8. **customer turn 5:** yes
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Igor Horne","phone":"+12425550127","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`

### TM-4ebc6c62-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-4ebc6c62-8065-46ec-ba02-0766a86bcb8a (auto-repair-appt-1); variant typo; seed 6017; derived from TM-4ebc6c62
- Mechanism: assistant-memory presumptions ('the one I went to last time'), earlier-than-offered push, contact preference
- Changes: 'the shop I went to last time' -> 'same as my last visit': no history exists, must not invent one; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"14:00","name":"Kara Lowe","phone":"+12425550128"}; actual outcome: completed

1. **customer turn 0:** Can you book me for the same thing as last time?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleanign, I guess
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **adaptive customer (supplies date, time):** Thursday 2pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"14:00"}`
4. **customer turn 2:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"14:00"}`
5. **adaptive customer (supplies name, phone):** Kara Lowe 242-555-0128
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Kara Lowe","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Thrusday 2pm
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Thursday, August 20 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Kara Lowe","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** Name is Kara Lowe, use 242-555-0128 not my other number
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Kara Lowe","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 2:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-53cfb4bd-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-53cfb4bd-089b-4d88-9497-e928a7d4eb8c (auto-repair-appt-1); variant typo; seed 6018; derived from TM-53cfb4bd
- Mechanism: weekend request against weekday-only hours; customer relents to a valid weekday morning
- Changes: Saturday March 30 -> Saturday (closed per configured hours); 'ask Jim' -> no staff names; ask for a morning slot; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, cleaning→claening, Friday→Firday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"09:00","name":"Nia Vance","phone":"+12425550129"}; actual outcome: completed

1. **customer turn 0:** Hi, I'd like a claening but I'm busy this week, can we try Saturday?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
2. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
3. **customer turn 2:** Saturday morning 9am
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00"}`
4. **adaptive customer (supplies date):** Friday
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00","date":"Friday"}`
5. **customer turn 3:** 11am won't work, I have brunch. Can you do 9?
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00","date":"Friday"}`
6. **adaptive customer (supplies name, phone):** Nia Vance 242-555-0129
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
7. **customer turn 4:** OK what about Firday 9am then?
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Nia Vance, 242-555-0129
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
9. **customer turn 6:** How much is the claening?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Nia Vance","phone":"+12425550129","service":"Routine cleaning","time":"09:00","date":"Friday","pendingAction":"confirm_booking"}`
10. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-60cceb98-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1); variant typo; seed 6019; derived from TM-60cceb98
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Tuesday→Tusday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}; actual outcome: completed

1. **customer turn 0:** I'd like a cleaing next week
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **adaptive customer (supplies date):** Tuesday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday"}`
4. **customer turn 2:** Tusday 12:30pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
5. **customer turn 3:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
6. **customer turn 4:** Wait, I can't do 12:30, can you change it to 1:30?
   **Receptionist:** And what time? Did you mean 1:30 AM or 1:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","pendingBareTime":"1:30"}`
7. **adaptive customer (supplies time):** 1:30pm
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 1:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"13:30","pendingAction":"confirm_booking"}`
8. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 1:30 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-70bc0cb6-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-70bc0cb6-d391-4f7e-bf11-bcc65e3363f3 (auto-repair-appt-1); variant typo; seed 6020; derived from TM-70bc0cb6
- Mechanism: vague problem, wrong-vehicle correction, same-day pressure, repair-duration question
- Changes: vehicle correction (Ram vs Corolla) -> service correction (filling vs cleaning); 'how long will it take to fix' -> must give only configured procedure duration; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, filling→filing
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"16:00","name":"Suzy Baker","phone":"+12425550131"}; actual outcome: completed

1. **customer turn 0:** Hey, something's wrong with my tooth, can I come in sometime soon?
   **Receptionist:** I'm sorry you're dealing with that. I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** Suzy Baker, 242-555-0131
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Suzy Baker","phone":"+12425550131"}`
3. **adaptive customer (supplies date, time):** Thursday 4pm
   **Receptionist:** I have you down for Dental consultation / basic exam on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
4. **customer turn 2:** Sorry, I meant a filing, not a cleanign
   **Receptionist:** I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
5. **customer turn 3:** Is there anything this afternoon? Thursday 4pm?
   **Receptionist:** I'm still holding this for your answer. I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 4:** How long will it take if there's a problem?
   **Receptionist:** Basic filling takes about 45 minutes. I have you down for Basic filling on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Suzy Baker","phone":"+12425550131","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** ok that works
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 6:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-71cbe988-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-71cbe988-8a26-4217-b466-db33a1840d46 (auto-repair-appt-1); variant typo; seed 6021; derived from TM-71cbe988
- Mechanism: customer repeats name/phone after an after-work time change
- Changes: duplicate contact message must not duplicate or corrupt state; evening time clipped to 5pm close; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, consultation→conslutation
- Expected: outcome `unresolved`, bookings 0; actual outcome: unresolved

1. **customer turn 0:** I'd like to book a general check-up and a fillign
   **Receptionist:** I can book one service per appointment — which would you like first: Dental consultation / basic exam or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A conslutation first
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Tomorrow morning at 10 am would be ideal
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"2026-08-21","time":"10:00"}`
4. **customer turn 3:** Actually I'd prefer after work, do you have 5pm?
   **Receptionist:** 5:00 PM on Friday, August 21 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"2026-08-21"}`
5. **customer turn 4:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`
6. **customer turn 5:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`
7. **customer turn 6:** yes
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Dental consultation / basic exam","date":"2026-08-21"}`

### TM-73b0e503-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-73b0e503-42ec-49e8-839a-1104907f686e (auto-repair-appt-1); variant typo; seed 6022; derived from TM-73b0e503
- Mechanism: pain symptom + immediate availability push + evening fallback accepted reluctantly
- Changes: clutch failing -> loose crown (urgent but not an emergency); 'this evening' is after hours and must not be booked; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"15:00","name":"Mina Shaw","phone":"+12425550133"}; actual outcome: completed

1. **customer turn 0:** Hello, I need to get my tooth looked at, a crown came loose
   **Receptionist:** I'm sorry you're dealing with that. I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** Mina Shaw, 242-555-0133
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133"}`
3. **customer turn 2:** It's a consultaton. Do you have anything today around 2?
   **Receptionist:** And what time? Did you mean 2:00 AM or 2:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"2026-08-20","pendingBareTime":"2:0"}`
4. **customer turn 3:** How about this evening?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"2026-08-20","pendingBareTime":"2:0"}`
5. **customer turn 4:** Okay, Wendesday 3pm then
   **Receptionist:** I have you down for Dental consultation / basic exam on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Mina Shaw","phone":"+12425550133","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
6. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-7a8274ab-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-7a8274ab-8a70-44f3-80df-197601afc7d6 (auto-repair-appt-1); variant typo; seed 6023; derived from TM-7a8274ab
- Mechanism: customer asks the assistant to use an 'online tool', pushes same-day then accepts later time
- Changes: 'online tool' is this chat itself; assistant must not claim to call or text third parties; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→appoitment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Arnold Benjamin","phone":"+12425550134"}; actual outcome: completed

1. **customer turn 0:** Hi, can you set up an appoitment for me?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleanign
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** yes
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **customer turn 3:** I'd like to get it done today if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
5. **customer turn 4:** How's 4:30pm? Thursday
   **Receptionist:** 4:30 PM on Thursday, August 20 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
6. **customer turn 5:** What about 5:30pm?
   **Receptionist:** 5:30 PM on Thursday, August 20 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
7. **customer turn 6:** Arnold Benjamin, 242-555-0134
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Arnold Benjamin","phone":"+12425550134","service":"Routine cleaning","date":"2026-08-20"}`
8. **customer turn 7:** Thursday 4pm is fine then
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Arnold Benjamin","phone":"+12425550134","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 8:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-8e3522af-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-8e3522af-9e99-405b-baa4-737eefbd2c4f (auto-repair-appt-1); variant typo; seed 6024; derived from TM-8e3522af
- Mechanism: frustrated repeated same-day demands, price asked twice, asks assistant to arrange an unrelated third-party service
- Changes: window leak/rain -> chipped tooth; 'rental car' request -> unsupported third-party task; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→filing, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"14:00","name":"Pat Cruz","phone":"+12425550135"}; actual outcome: completed

1. **customer turn 0:** I need a filing today, my tooth chipped
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"2026-08-20"}`
2. **customer turn 1:** Pat Cruz, 242-555-0135
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
3. **customer turn 2:** Is there no way we can have it done today? Nothing is making it change?
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
4. **customer turn 3:** How much was it going to be, you never said?
   **Receptionist:** Basic filling is B$175 and takes about 45 minutes. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
5. **customer turn 4:** This is ridiculous, I can't believe there's nothing today
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"2026-08-20"}`
6. **customer turn 5:** Fine, book Wendesday 2pm. Run it by me again first.
   **Receptionist:** I have you down for Basic filling on Wednesday, August 26 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Pat Cruz","phone":"+12425550135","service":"Basic filling","date":"Wednesday","time":"14:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Basic filling on Wednesday, August 26 at 2:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **customer turn 7:** Also please arrange a ride for me for tomorrow
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-92975e16-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-92975e16-5436-4179-9f4c-e680c623271e (auto-repair-appt-1); variant typo; seed 6025; derived from TM-92975e16
- Mechanism: date negotiated across turns, fee question, add-on mid-flow, final read-back
- Changes: inspection fee -> consultation price; 'add oil change' -> add cleaning note, no silent drops; typo variant: content-word misspellings (see typoEdits)
- Typo edits: appointment→appoitment, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"09:00","name":"Lena Ford","phone":"+12425550136"}; actual outcome: completed

1. **customer turn 0:** Hello, I think I'm due for a check-up, can you set up an appoitment?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **customer turn 1:** Yes that would be great.
   **Receptionist:** What day and time works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **customer turn 2:** Thrusday morning before work would work best
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday"}`
4. **customer turn 3:** Friday 9am is fine then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Friday","time":"09:00"}`
5. **adaptive customer (supplies name, phone):** Lena Ford 242-555-0136
   **Receptionist:** I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lena Ford","phone":"+12425550136","service":"Dental consultation / basic exam","date":"Friday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 4:** Can you ask what the exam fee is?
   **Receptionist:** Dental consultation / basic exam is B$75 and takes about 30 minutes. I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lena Ford","phone":"+12425550136","service":"Dental consultation / basic exam","date":"Friday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** Lena Ford, 242-555-0136
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lena Ford","phone":"+12425550136","service":"Dental consultation / basic exam","date":"Friday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Friday, August 21 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-9f67b33c-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-9f67b33c-4074-4acf-9b9d-17f69bc00073 (auto-repair-appt-1); variant typo; seed 6026; derived from TM-9f67b33c
- Mechanism: multi-item request + fee-up-front question + loaner-vehicle offer (unsupported perk)
- Changes: loaner car -> unconfigured perk; must not accept or promise one; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Michael Gibson","phone":"+12425550137"}; actual outcome: completed

1. **customer turn 0:** Hello, I'm calling to book an apointment
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **adaptive customer (supplies service):** a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 1:** I'm Michael Gibson, 242-555-0137
   **Receptionist:** Got it, thanks. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning"}`
4. **adaptive customer (supplies date, time):** Monday 9am
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** A cleanign, and I also want something checked, a strange pain when I bite
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Do you charge any fee up front?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** See if you can fit me in Monday at 9am
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Do you offer a loaner or ride service?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-e0a60506-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-e0a60506-5c3f-4308-a716-34f02f27e273 (auto-repair-appt-1); variant typo; seed 6027; derived from TM-e0a60506
- Mechanism: customer volunteers extra personal detail (home address) and 'urgent as soon as possible'
- Changes: street address volunteered -> not collected; must not be stored as name/phone; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, appointment→appoitment
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"09:00","name":"Max Reed","phone":"+12425550138"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] repeated-reply @script turn 6: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** I need an appoitment please, my tooth has a loud ache, maybe I need a fillign
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **adaptive customer (supplies date, time):** Tuesday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Tuesday","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Tuesday","time":"09:00"}`
4. **adaptive customer (supplies phone):** 242-555-0138
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00"}`
5. **customer turn 2:** Max Reed
   **Receptionist:** I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** My address is 12 Palm Ave, Nassau
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** 2425550138
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** It's urgent, as soon as possible. Tuesday 9am?
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** Please schedule it. What about the cost?
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Max Reed","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-003677eb-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-003677eb-20f8-4b1e-a396-c0f95a786543 (auto-repair-appt-1); variant typo; seed 6028; derived from TM-003677eb
- Mechanism: driving customer, three requests at once, earliest-slot demand, then a late-time proposal that is invalid
- Changes: 4:45pm for a 60-minute cleaning ends after the 5pm close; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, cleaning→cleaing, filling→filing
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Henry James","phone":"+18885430099"}; actual outcome: completed

1. **customer turn 0:** Hey, I'm driving, set me up for a cleaing and a filing please
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **customer turn 1:** A cleaing first
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** It's pretty urgent. What's the earliest you have, Friday?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
4. **customer turn 3:** I really need it today before my trip tomorrow
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
5. **customer turn 4:** No that's too late. Could I get in at 4:45pm Friday?
   **Receptionist:** 4:45 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
6. **customer turn 5:** Friday 3pm is fine, thanks
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"15:00"}`
7. **customer turn 6:** Henry James, 888 543 0099
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Henry James","phone":"+18885430099","date":"Friday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-078a0f20-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1); variant typo; seed 6030; derived from TM-078a0f20
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}; actual outcome: completed

1. **customer turn 0:** I need an apointment for a claening
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date):** Wednesday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
3. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **customer turn 2:** Wednesday if possible
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
5. **customer turn 3:** Anything sooner than 3pm?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **adaptive customer (supplies name, phone):** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** oh well. book Wednesday 3pm then
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Megan Smith 242-555-0139
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes that's right
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 7:** No thanks
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-17420eb9-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-17420eb9-65ab-46ae-9e6b-f0031d415ea7 (auto-repair-appt-1); variant typo; seed 6031; derived from TM-17420eb9
- Mechanism: question the system cannot answer from configuration ('ask them what I've done in the past'), duration question
- Changes: service-history lookup is unavailable to the receptionist; must not invent history; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, cleaning→cleaing, filling→fillign
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}; actual outcome: completed

1. **customer turn 0:** Can you make an appointment for me? I need a cleaing and a fillign
   **Receptionist:** I can book one service per appointment — which would you like first: Routine cleaning or Basic filling?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaing first. 242-555-0140 is my number, Mike Jones
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 11am
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
4. **adaptive customer (supplies name):** Mike Jones
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Mike Jones","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00","pendingAction":"confirm_booking"}`
5. **customer turn 3:** I have no idea what I've had done before. Ask them what I've had in the past.
   **Receptionist:** No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?
   _state:_ `{"intent":"book_appointment","name":"Mike Jones","phone":"+12425550140","justDeclined":true,"service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
6. **customer turn 4:** How long will it take?
   **Receptionist:** Routine cleaning takes about 60 minutes. I have you down for Routine cleaning on Tuesday, August 25 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Mike Jones","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-1b47bb2b-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-1b47bb2b-61b1-46b2-879a-719e939cf2f5 (restaurant-table-2); variant typo; seed 6032; derived from TM-1b47bb2b
- Mechanism: propose slot -> anything later? -> switch provider -> seat-type request unsupported
- Changes: restaurant/booth/bar seating -> dentist chair preferences (unsupported); no second location exists; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Tanya Rolle","phone":"+12425550141"}; actual outcome: completed

1. **customer turn 0:** Can I make an apointment please?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleanign, Thursday night at 8pm. Anything open?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
3. **customer turn 2:** Anything after 8pm? What about 8:30 or 9pm?
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
4. **customer turn 3:** OK what about another dental office across town?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
5. **customer turn 4:** Thursday 4pm here works. Can I get a window chair too?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
6. **customer turn 5:** Tanya Rolle 242-555-0141
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Tanya Rolle","phone":"+12425550141","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes, all good
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0b5b803f-T — Test-script mismatch (dev-rule-based fallback, adaptive)

- Source dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2); variant typo; seed 6033; derived from TM-0b5b803f
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, filling→fillign
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}; actual outcome: escalated
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] fixture-order-mismatch: booked service="Routine cleaning", expected "Basic filling"

1. **customer turn 0:** I'd like to book a claening for Friday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **adaptive customer (supplies name, phone):** Dina Gray 242-555-0142
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dina Gray","phone":"+12425550142","service":"Routine cleaning","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
3. **customer turn 1:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
4. **customer turn 2:** Actually could we do Monday at 11am instead?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
5. **customer turn 3:** Hm, could I go back to Friday 10am but make it a fillign?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
6. **customer turn 4:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dina Gray","phone":"+12425550142","service":"Basic filling","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** yes
   **Receptionist:** Sorry — I wasn't able to complete that. I've flagged this for the team to follow up with you directly.
   _state:_ `{}` _actions:_ request_appointment (failed), escalate

### TM-1159607c-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-1159607c-85d2-4899-bb3b-9db2ff0933a4 (restaurant-table-2); variant typo; seed 6034; derived from TM-1159607c
- Mechanism: off-topic menu questions, then pivot to a real booking; unsupported items must not be 'ordered'
- Changes: jambalaya/Dr. Pepper/menu questions -> out-of-scope asks (food, drinks); no order is created; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"16:00","name":"Evan Pratt","phone":"+12425550143"}; actual outcome: escalated
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"

1. **customer turn 0:** Hi, I'd like to book for tonight at 8pm. Do you serve jambalaya? Do you have Dr. Pepper?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`
2. **customer turn 1:** Actually I'd like to book a consultaton Wendesday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00"}`
3. **adaptive customer (supplies name, phone):** Evan Pratt 242-555-0143
   **Receptionist:** I have you down for Dental consultation / basic exam on Wednesday, August 26 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Evan Pratt","phone":"+12425550143","service":"Dental consultation / basic exam","date":"Wednesday","time":"16:00","pendingAction":"confirm_booking"}`
4. **customer turn 2:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Wednesday, August 26 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
5. **customer turn 3:** Could we order two miso soups too?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
6. **customer turn 4:** Evan Pratt 242-555-0143
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
7. **customer turn 5:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-3660ae8b-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-3660ae8b-6892-49a4-8e81-7617ed38127a (restaurant-table-3); variant typo; seed 6035; derived from TM-3660ae8b
- Mechanism: repeated alternative probing at one time slot, then customer gives up (abandon with no booking)
- Changes: indoor/outdoor seating probes -> chair/room preferences; customer ends with no booking; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→appoitment
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** I'd like an appoitment for 12:00pm today
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00"}`
2. **customer turn 1:** a cleanign, just me
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
3. **customer turn 2:** Is there anything after that? When is the next availability?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
4. **customer turn 3:** Is there an outdoor room available at 12:00?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-08-20","time":"12:00","service":"Routine cleaning"}`
5. **customer turn 4:** What about Thursday at 12pm?
   **Receptionist:** Got it, thanks. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Thursday","time":"12:00","service":"Routine cleaning"}`
6. **customer turn 5:** Ok. I will book next time.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`

### TM-590f7375-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-590f7375-238c-49d2-b3b8-7e537d210d4d (restaurant-table-1); variant typo; seed 6036; derived from TM-590f7375
- Mechanism: criteria search (cuisine, budget, rating) + hotel location question + group split
- Changes: cuisine/budget/rating criteria -> price/quality filter requests that cannot be served; 'table for six/two tables' -> several patients: one booking per patient, no group booking invented; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Monday→Mondya, Monday→Mondya
- Expected: outcome `completed`, bookings 1, {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Ruth Sims","phone":"+12425550144"}; actual outcome: completed

1. **customer turn 0:** I'm looking to book dental care for my family on Mondya
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **adaptive customer (supplies service):** a consultation
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Dental consultation / basic exam"}`
3. **customer turn 1:** I want the cheapest option under B$100
   **Receptionist:** The lowest-priced service I can book is Dental consultation / basic exam at B$75. Prices for the others: Routine cleaning B$125; Basic filling B$175; Root canal B$950. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Dental consultation / basic exam"}`
4. **adaptive customer (supplies time):** 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Dental consultation / basic exam","time":"10:00"}`
5. **customer turn 2:** Does the clinic have at least four stars on Google? What building is it in?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Dental consultation / basic exam","time":"10:00"}`
6. **adaptive customer (supplies name, phone):** Ruth Sims 242-555-0144
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Ruth Sims","phone":"+12425550144","date":"Monday","service":"Dental consultation / basic exam","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 3:** Can you book six people at once at 8pm?
   **Receptionist:** 8:00 PM on Monday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","name":"Ruth Sims","phone":"+12425550144","date":"Monday","service":"Dental consultation / basic exam"}`
8. **customer turn 4:** Ok then a consultaton for me, Mondya 10am. Ruth Sims 242-555-0144
   **Receptionist:** I'm still holding this for your answer. I have you down for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Ruth Sims","phone":"+12425550144","date":"Monday","service":"Dental consultation / basic exam","time":"10:00","pendingAction":"confirm_booking"}`
9. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 6:** Does the clinic have a dress code?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`

### TM-5e0469c8-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-5e0469c8-0968-40ad-8c22-6c118afaa781 (restaurant-table-2); variant typo; seed 6037; derived from TM-5e0469c8
- Mechanism: alternate provider probing, outdoor/gluten-free/parking questions, headcount change at confirmation
- Changes: gluten-free/parking/outdoor -> unconfigured facts; party size 4 -> 6 change is not a clinic concept; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, filling→fillign, Thursday→Thrusday, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"10:00","name":"Andre Cox","phone":"+12425550145"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** I'd like to find a dentist for a fillign
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **customer turn 1:** Let's try Thrusday at 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"09:00"}`
3. **adaptive customer (supplies name, phone):** Andre Cox 242-555-0145
   **Receptionist:** I have you down for Basic filling on Thursday, August 27 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"09:00","pendingAction":"confirm_booking"}`
4. **customer turn 2:** I'd like 10am then
   **Receptionist:** I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
5. **customer turn 3:** Is there outside seating or a waiting area? Is there parking?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
6. **customer turn 4:** Great, please book the fillign for 10am Thrusday
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** Andre Cox 242-555-0145
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Thursday, August 27 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Andre Cox","phone":"+12425550145","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
8. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 27 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-92fb5414-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-92fb5414-3316-4340-b2a2-18a3c9d43bc8 (restaurant-table-3); variant typo; seed 6038; derived from TM-92fb5414
- Mechanism: customer gives up after repeated slot misses (abandon without booking)
- Changes: restaurant search near me -> no other clinics exist; abandons after slot refusals; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** Hey, can I get a cleanign at a dentist near me tonight?
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** Friday at 7pm then
   **Receptionist:** 7:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
3. **customer turn 2:** Just me. Could I get a chair near the window?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
4. **customer turn 3:** Do you have anything at 8pm?
   **Receptionist:** 8:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
5. **customer turn 4:** What about 9pm?
   **Receptionist:** 9:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
6. **customer turn 5:** Okay, never mind about the apointment then.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`
7. **customer turn 6:** It's alright. Thank you for trying.
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-c4801b6b-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-c4801b6b-3d1a-43b8-97e1-02be355e646d (restaurant-table-3); variant typo; seed 6039; derived from TM-c4801b6b
- Mechanism: frustration after failed attempts, then withdrawal
- Changes: steak/seafood -> cleaning; 'lost my appetite' -> frustrated withdrawal; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening
- Expected: outcome `abandoned`, bookings 0; actual outcome: abandoned

1. **customer turn 0:** Hello, I want a claening tonight at 7pm
   **Receptionist:** 7:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** What about 6pm?
   **Receptionist:** 6:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Ok, let's skip that. Either 6 or 7pm would work.
   **Receptionist:** I haven't set a time yet — I need one exact time (for example, 3:00 pm) and the day. What day, and which exact time?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","timeClarification":true}`
4. **customer turn 3:** Oh no, how frustrating!!!
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","timeClarification":true}`
5. **customer turn 4:** No, I think I'm just going to sit this one out.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`
6. **customer turn 5:** No, not right now, I've got to go, bye
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else. Tell me in your own words.
   _state:_ `{}`

### TM-0341f269-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-0341f269-5d30-4ec7-bd67-672f8a715f89 (restaurant-table-2); variant typo; seed 6040; derived from TM-0341f269
- Mechanism: name two venues in sequence; party-size and day given; 'change my reservation to a different place'
- Changes: 'different restaurant' -> different service; slot corrected to within hours; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, consultation→consultaton
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"10:00","name":"Opal Day","phone":"+12425550146"}; actual outcome: completed

1. **customer turn 0:** Hi, I would like to make an appointment.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** For a consultaton, for 2 people
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingBareTime":"2:0"}`
3. **customer turn 2:** I want 8pm on Saturday.
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"20:00"}`
4. **customer turn 3:** Ok, what about 7pm?
   **Receptionist:** 7:00 PM is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
5. **customer turn 4:** Ok, I would like to change it to a cleaing instead, Friday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
6. **customer turn 5:** Opal Day 242-555-0146
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Opal Day","phone":"+12425550146","service":"Routine cleaning","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0907b949-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-0907b949-f00c-4595-8c1a-8978665bf1b6 (restaurant-table-2); variant typo; seed 6041; derived from TM-0907b949
- Mechanism: tonight slot, then 7?, then back to original time, high-chair special request added late
- Changes: high-chair request -> child-seating/other special request; unconfigured accommodations not promised; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→appoitment
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Zane Moss","phone":"+12425550147"}; actual outcome: completed

1. **customer turn 0:** I'd like an appoitment for a cleanign
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date):** Thursday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
3. **customer turn 1:** Nassau
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
4. **customer turn 2:** Thursday at 8pm
   **Receptionist:** 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday"}`
5. **customer turn 3:** Is there anything at 7?
   **Receptionist:** And what time? Did you mean 7:00 AM or 7:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","pendingBareTime":"7:0"}`
6. **customer turn 4:** Thursday 4pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
7. **adaptive customer (supplies name, phone):** Zane Moss 242-555-0147
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Zane Moss","phone":"+12425550147","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Ok, I forgot to ask: my child needs a booster seat in the chair
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I can only book the exact details below — I can't promise anything beyond them (extra requests would need the team). I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Zane Moss","phone":"+12425550147","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** Zane Moss 242-555-0147
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Zane Moss","phone":"+12425550147","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0ea74929-T — Test-script mismatch (dev-rule-based fallback, adaptive)

- Source dlg-0ea74929-d1b0-4c2a-8465-6fb65bf8a389 (restaurant-table-2); variant typo; seed 6042; derived from TM-0ea74929
- Mechanism: seat preference change, venue switch, tasting-menu / head-chef questions, final time change
- Changes: table by window/fireplace -> unsupported room preferences; menu/chef questions -> unconfigured clinic info; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Friday→Firday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}; actual outcome: escalated
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] fixture-order-mismatch: booked preferredTime="16:00", expected "15:00"
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up."

1. **customer turn 0:** I'd like to book a claening for two
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date):** Friday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
3. **customer turn 1:** Firday 4pm please. Ask for the window chair.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
4. **adaptive customer (supplies name, phone):** Quinn Ali 242-555-0148
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Quinn Ali","phone":"+12425550148","service":"Routine cleaning","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
6. **customer turn 3:** Yes, but I'd like the chair near the outdoor fireplace instead.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`
7. **customer turn 4:** Is Dr. Nia doing it? Are there any specials that day?
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up.
   _state:_ `{}`
8. **customer turn 5:** Let's make it 3pm instead
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
9. **customer turn 6:** Quinn Ali 242-555-0148
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
10. **customer turn 7:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-0f57a901-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-0f57a901-2757-464f-9613-132bff3ead34 (restaurant-table-2); variant typo; seed 6043; derived from TM-0f57a901
- Mechanism: headcount change mid-flow, scenic-view request, failed date then alternative date, venue changes, no unsupported promises
- Changes: water view/sunset -> unsupported amenity; date 24th->23rd -> weekday swap; multiple venue hops -> multiple service hops; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, Thursday→Thrusday, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"15:00","name":"Isla Munn","phone":"+12425550149"}; actual outcome: completed

1. **customer turn 0:** Please book me a fillign Friday 6pm
   **Receptionist:** 6:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
2. **customer turn 1:** Make sure the room has a stunning view of the water
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
3. **customer turn 2:** Oh I forgot, include my cousin, so that makes two of us
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
4. **customer turn 3:** Let me know ASAP please
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
5. **customer turn 4:** Try Thrusday
   **Receptionist:** Got it, thanks. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday"}`
6. **customer turn 5:** Darn. What about a classy modern clinic instead?
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday"}`
7. **customer turn 6:** Fine, Thrusday 3pm here then. Isla Munn 242-555-0149
   **Receptionist:** I have you down for Basic filling on Thursday, August 20 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Isla Munn","phone":"+12425550149","service":"Basic filling","date":"Thursday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 7:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, August 20 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-209856e2-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-209856e2-3ec2-464c-bbc5-f6013d138ebb (restaurant-table-1); variant typo; seed 6044; derived from TM-209856e2
- Mechanism: assistant is asked to recall a prior preference ('what's that place I told you to remember'); casual banter
- Changes: recall of a stored restaurant -> recall of a stored dentist/service; no memory exists, must not invent; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, cleaning→cleanign, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"16:00","name":"Cole Nash","phone":"+12425550150"}; actual outcome: completed
- ❌ [incomplete] detail-loss @script turn 2: service changed from "Dental consultation / basic exam" to "Routine cleaning" without a customer correction

1. **customer turn 0:** I'm feeling like I should get my teeth checked!
   **Receptionist:** I can't diagnose or choose a treatment over chat, but the dentist can assess it — Dental consultation / basic exam (B$75, about 30 minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **customer turn 1:** What's that treatment I told you to remember I liked?
   **Receptionist:** Just to confirm — would you like to book Dental consultation / basic exam? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
3. **customer turn 2:** Will you book me tomorrow night at 8 for a cleanign?
   **Receptionist:** And what time? Did you mean 8:00 AM or 8:00 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
4. **customer turn 3:** Wow, how did you do that so quickly?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
5. **customer turn 4:** Who's your daddy?
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-21","pendingBareTime":"8:0"}`
6. **customer turn 5:** ok book a cleanign Tuesdya at 4pm. Cole Nash 242-555-0150
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Cole Nash","phone":"+12425550150","service":"Routine cleaning","date":"Tuesday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-4d9d8a2b-T — Safe but incomplete (dev-rule-based fallback, adaptive)

- Source dlg-4d9d8a2b-4e6d-4923-b8a5-bc8fd4037286 (restaurant-table-2); variant typo; seed 6045; derived from TM-4d9d8a2b
- Mechanism: special occasion request (cake/gift timing), repeated time moves, patio request, two unrelated details
- Changes: anniversary cake -> birthday cake request (unsupported); party of 8 -> not a clinic concept; patio -> unsupported; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, Friday→Fridya
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed

1. **customer turn 0:** Hi, I'd like to book a fillign
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **adaptive customer (supplies date):** Friday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
3. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday"}`
4. **customer turn 2:** Fridya 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
5. **adaptive customer (supplies name, phone):** Joy Hall 242-555-0151
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** Actually, can we do 4:30?
   **Receptionist:** And what time? Did you mean 4:30 AM or 4:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","pendingBareTime":"4:30"}`
7. **customer turn 4:** Let's make it 4pm after all.
   **Receptionist:** I'm still holding this for your answer. I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** It's my husband's birthday, can you bring out a cake at a certain time?
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** Is there outdoor space like a patio? I'd like to book on the patio.
   **Receptionist:** I don't have that information on hand, and I won't guess — the front desk can confirm it. Say "talk to someone" if you'd like a team member to follow up. I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** Joy Hall 242-555-0151
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
11. **customer turn 8:** No, that sounds right.
   **Receptionist:** Just to be sure I get this right — I have you down for Basic filling on Friday, August 21 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Joy Hall","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`

### TM-55ab43fe-T — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-55ab43fe-1b96-4b17-9aa3-6d15cf933780 (restaurant-table-2); variant typo; seed 6046; derived from TM-55ab43fe
- Mechanism: spelling of a name given letter by letter, party-size (3), venue hop, final read-back confirmation
- Changes: spelling correction must be stored as the final name, not the letters; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Monday→Mondya
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}; actual outcome: completed
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}) not found in order

1. **customer turn 0:** Hi there, I'm looking to reserve a cleaing
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** Todd Choiniere. It's spelled C-h-o-i-n-i-e-r-e.
   **Receptionist:** Just to confirm — would you like to book Routine cleaning? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **customer turn 2:** Is Saturday available?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Saturday"}`
4. **customer turn 3:** Hmm okay. What about that next Mondya around 9am?
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-24","timeClarification":true}`
5. **adaptive customer (supplies time):** 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-24","time":"09:00"}`
6. **customer turn 4:** 242-555-0152
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550152","date":"2026-08-24","time":"09:00"}`
7. **adaptive customer (supplies name):** Todd Choiniere
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Todd Choiniere","phone":"+12425550152","date":"2026-08-24","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** yes, that's correct
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-56325402-T — Pass (dev-rule-based fallback, adaptive)

- Source dlg-56325402-8eb3-4765-9a4a-94eee0d0ab41 (restaurant-table-1); variant typo; seed 6047; derived from TM-56325402
- Mechanism: recommendation-seeking, quality question, then proceeds; seating preference changes; long inconclusive start
- Changes: 'old-school French restaurant with really good wine' -> 'recommend a service'; no clinical advice invented; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"15:00","name":"Rhea Dunn","phone":"+12425550153"}; actual outcome: completed

1. **customer turn 0:** Hello, I'm looking for a good dental service, what do you recommend?
   **Receptionist:** I can't recommend a treatment over chat — that's for the dentist after an exam. We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). A consultation is the usual starting point.
   _state:_ `{}`
2. **customer turn 1:** Which one is really good?
   **Receptionist:** I can't recommend a treatment over chat — that's for the dentist after an exam. We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). A consultation is the usual starting point. Tell me in your own words.
   _state:_ `{}`
3. **customer turn 2:** Excellent, I'll try the cleanign.
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
4. **customer turn 3:** Thrusday around 4pm
   **Receptionist:** I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","timeClarification":true}`
5. **customer turn 4:** What about 3pm?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"15:00"}`
6. **customer turn 5:** Perfect, I'll take that. Rhea Dunn 242-555-0153
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Rhea Dunn","phone":"+12425550153","date":"Thursday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-929b59a3-B — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1); variant bahamian; seed 10001; derived from TM-929b59a3
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 5: identical reply on consecutive turns: "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [incomplete] reply-must-match @script turn 4: 6pm is after the 5pm close and must not be accepted: reply did not match /outside|open|hours|9/ — "Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **customer turn 0:** I wanna book me a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Thursday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
4. **adaptive customer (supplies phone):** 242-555-0112
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
5. **customer turn 2:** Brent Cole
   **Receptionist:** I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** 242-555-0112
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** Thursday 6pm
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Can I come in at 4pm then?
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** how much that one?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Thursday, August 20 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Brent Cole","phone":"+12425550112","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
10. **customer turn 7:** Okay, that's fine.
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, August 20 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
11. **customer turn 8:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-5cb6cabb-B — Pass (dev-rule-based fallback, adaptive)

- Source dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1); variant bahamian; seed 10004; derived from TM-5cb6cabb
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}; actual outcome: completed

1. **customer turn 0:** I need to book a cleaning please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date, time):** Tuesday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Erin Hall 242-555-0115
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Tuesday 8am
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** yinna got other times?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** 9am good, how much that one?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Erin Hall 242-555-0115
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** Great! Please go ahead
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 7:** yes
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-66c6b5b1-B — Pass (dev-rule-based fallback, adaptive)

- Source dlg-66c6b5b1-b41e-441c-bc3f-76e7edb7e5ac (auto-repair-appt-1); variant bahamian; seed 10006; derived from TM-66c6b5b1
- Mechanism: hard deadline (needs it done before a trip), booking for a family member, price question
- Changes: oil change before a trip -> cleaning before a trip; wife's appointment -> patient is the customer's spouse, booked under the spouse's name; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}; actual outcome: completed

1. **customer turn 0:** Hi, I wanna book me a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies time):** 10am
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"10:00"}`
3. **customer turn 1:** I need it done before Wednesday because I'm travelling.
   **Receptionist:** What day works best for you? For example: "Tuesday".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"10:00"}`
4. **customer turn 2:** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"10:00","date":"Monday"}`
5. **adaptive customer (supplies phone):** 242-555-0117
   **Receptionist:** Got it, thanks. Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550117","service":"Routine cleaning","time":"10:00","date":"Monday"}`
6. **customer turn 3:** It's for my wife, Janet Smith
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Janet Smith","phone":"+12425550117","service":"Routine cleaning","time":"10:00","date":"Monday","pendingAction":"confirm_booking"}`
7. **customer turn 4:** 242-555-0117
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Janet Smith","phone":"+12425550117","service":"Routine cleaning","time":"10:00","date":"Monday","pendingAction":"confirm_booking"}`
8. **customer turn 5:** how much that one?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Monday, August 24 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Janet Smith","phone":"+12425550117","service":"Routine cleaning","time":"10:00","date":"Monday","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 7:** Sounds great, thank you
   **Receptionist:** That request is already recorded — a team member will confirm it. Is there anything else I can help with?
   _state:_ `{}`

### TM-a8533b60-B — Pass (dev-rule-based fallback, adaptive)

- Source dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1); variant bahamian; seed 10008; derived from TM-a8533b60
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}; actual outcome: completed

1. **customer turn 0:** I need a appointment Monday morning
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **customer turn 1:** A cleaning
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
3. **adaptive customer (supplies time):** 9:30am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning","time":"09:30"}`
4. **customer turn 2:** John Smith
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"John Smith","date":"Monday","service":"Routine cleaning","time":"09:30"}`
5. **customer turn 3:** 2425550119
   **Receptionist:** I have you down for Routine cleaning on Monday, August 24 at 9:30 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","time":"09:30","pendingAction":"confirm_booking"}`
6. **customer turn 4:** yeah man, 9:30 good
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Monday, August 24 at 9:30 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"John Smith","phone":"+12425550119","date":"Monday","service":"Routine cleaning","time":"09:30","pendingAction":"confirm_booking"}`
7. **customer turn 5:** ok please do
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, August 24 at 9:30 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-3d00c7a6-B — Completed, quality defects (dev-rule-based fallback, adaptive)

- Source dlg-3d00c7a6-6556-4954-adcf-97ca7a4f6b77 (auto-repair-appt-1); variant bahamian; seed 10015; derived from TM-3d00c7a6
- Mechanism: conflict with customer's own meeting, then add-on request, partial contact info over several turns
- Changes: oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed); contact info volunteered as 'maybe my name and phone' fragments; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}; actual outcome: escalated
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] detail-loss @script turn 2: date changed from "2026-08-20" to "Wednesday" without a customer correction

1. **customer turn 0:** I wanna book me a cleaning, tomorrow or later today if yinna can
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20"}`
2. **adaptive customer (supplies time):** 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20","time":"09:00"}`
3. **customer turn 1:** yes
   **Receptionist:** Could I get your name and phone number? For example: "Maria Smith".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-08-20","time":"09:00"}`
4. **adaptive customer (supplies name, phone):** Maggie Rivera 242-555-0126
   **Receptionist:** I have you down for Routine cleaning on Thursday at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","phone":"+12425550126","service":"Routine cleaning","date":"2026-08-20","time":"09:00","pendingAction":"confirm_booking"}`
5. **customer turn 2:** Oh no, I have a meeting at 10am. What about earlier? Wednesday 9am?
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Maggie Rivera","phone":"+12425550126","service":"Routine cleaning","date":"Wednesday","time":"09:00","pendingAction":"confirm_booking"}`
6. **customer turn 3:** That is perfect
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **customer turn 4:** Let me think.
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
8. **customer turn 5:** I also need my tires rotated
   **Receptionist:** That isn't one of the services I can book here — I can book Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). The team can tell you whether they offer it — say "talk to someone" if you'd like them to follow up.
   _state:_ `{}`
9. **customer turn 6:** Maggie Rivera
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do? Tell me in your own words.
   _state:_ `{"unclearTurnCount":1}`
10. **customer turn 7:** yes. 242-555-0126
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
11. **customer turn 8:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-60cceb98-B — Pass (dev-rule-based fallback, adaptive)

- Source dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1); variant bahamian; seed 10019; derived from TM-60cceb98
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}; actual outcome: completed

1. **customer turn 0:** I'd like a cleaning next week
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **customer turn 1:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 12:30pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
4. **customer turn 3:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
5. **customer turn 4:** wait, lemme change that, 12:30 don't work, make it 1:30
   **Receptionist:** And what time? Did you mean 1:30 AM or 1:30 PM? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","pendingBareTime":"1:30"}`
6. **adaptive customer (supplies time):** 1:30pm
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 1:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"13:30","pendingAction":"confirm_booking"}`
7. **customer turn 5:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, August 25 at 1:30 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-078a0f20-B — Pass (dev-rule-based fallback, adaptive)

- Source dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1); variant bahamian; seed 10030; derived from TM-078a0f20
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}; actual outcome: completed

1. **customer turn 0:** I need an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **adaptive customer (supplies date):** Wednesday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
3. **customer turn 1:** yes
   **Receptionist:** And what time? (please include am/pm) For example: "2pm".
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **customer turn 2:** Wednesday if possible
   **Receptionist:** And what time? (please include am/pm) If it's easier, say "talk to someone" and a team member will take over.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
5. **customer turn 3:** got anything sooner than 3pm?
   **Receptionist:** I can't see live openings from here, but we're open Monday–Friday, 9:00 AM–5:00 PM (local time). Tell me a day and a time within those hours and I'll set it up. Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **adaptive customer (supplies name, phone):** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **customer turn 4:** ok, book Wednesday 3pm then
   **Receptionist:** I'm still holding this for your answer. I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
8. **customer turn 5:** Megan Smith 242-555-0139
   **Receptionist:** Still waiting on a yes or a change. If you'd rather talk to a person, say "talk to someone". I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
9. **customer turn 6:** yes that's right
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, August 26 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
10. **customer turn 7:** No thanks
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-0b5b803f-B — Test-script mismatch (dev-rule-based fallback, adaptive)

- Source dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2); variant bahamian; seed 10033; derived from TM-0b5b803f
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}; actual outcome: escalated
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "escalated"
- ❌ [incomplete] fixture-order-mismatch: booked service="Routine cleaning", expected "Basic filling"

1. **customer turn 0:** I'd like to book a cleaning for Friday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **adaptive customer (supplies name, phone):** Dina Gray 242-555-0142
   **Receptionist:** I have you down for Routine cleaning on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dina Gray","phone":"+12425550142","service":"Routine cleaning","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
3. **customer turn 1:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, August 21 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
4. **customer turn 2:** Actually lemme change that, Monday at 11am instead?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
5. **customer turn 3:** Hm, could I go back to Friday 10am but make it a filling?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
6. **customer turn 4:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Dina Gray","phone":"+12425550142","service":"Basic filling","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
7. **customer turn 5:** yes
   **Receptionist:** Sorry — I wasn't able to complete that. I've flagged this for the team to follow up with you directly.
   _state:_ `{}` _actions:_ request_appointment (failed), escalate

### TM-929b59a3 — Safe but incomplete (scripted LLM fixture, fixed)

- Source dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1); variant adaptation; seed 1001
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed
- ❌ [incomplete] repeated-reply @script turn 2: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 6: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 7: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] reply-must-match @script turn 6: configured price: reply did not match /B\$\s?125/ — "Thanks — go on."

1. **customer turn 0:** I'd like to schedule a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Brent Cole
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Brent Cole"}`
4. **customer turn 3:** 242-555-0112
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Brent Cole","phone":"+12425550112"}`
5. **customer turn 4:** Thursday 6pm
   **Receptionist:** 6:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Brent Cole","phone":"+12425550112"}`
6. **customer turn 5:** Can I come in at 4pm then?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Brent Cole","phone":"+12425550112","time":"16:00"}`
7. **customer turn 6:** How much will the cleaning be?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Brent Cole","phone":"+12425550112","time":"16:00"}`
8. **customer turn 7:** Okay, that's fine.
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Brent Cole","phone":"+12425550112","time":"16:00"}`
9. **customer turn 8:** yes
   **Receptionist:** I have you down for Routine cleaning. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Brent Cole","phone":"+12425550112","time":"16:00"}`

### TM-5cb6cabb — Completed, quality defects (scripted LLM fixture, fixed)

- Source dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1); variant adaptation; seed 1004
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 2: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] detail-loss @script turn 4: time changed from "08:00" to "09:00" without a customer correction
- ❌ [incomplete] reply-must-match @script turn 4: configured price: reply did not match /B\$\s?125/ — "Thanks — go on."

1. **customer turn 0:** I need to book a cleaning please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 8am
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"08:00"}`
4. **customer turn 3:** Are there other times available?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"08:00"}`
5. **customer turn 4:** 9am works. What will it cost?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
6. **customer turn 5:** Erin Hall 242-555-0115
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00","phone":"+12425550115","name":"Erin Hall","pendingAction":"confirm_service"}`
7. **customer turn 6:** Great! Please go ahead
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00","phone":"+12425550115","name":"Erin Hall","pendingAction":"confirm_service"}`
8. **customer turn 7:** yes
   **Receptionist:** I've captured your request — a team member will confirm.
   _state:_ `{"bookingJustCompleted":true,"lastCompletedBooking":{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00","name":"Erin Hall","phone":"+12425550115"}}` _actions:_ request_appointment

### TM-a8533b60 — Safe but incomplete (scripted LLM fixture, fixed)

- Source dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1); variant adaptation; seed 1008
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed
- ❌ [incomplete] repeated-reply @script turn 2: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "Thanks — go on."

1. **customer turn 0:** I need an appointment Monday morning
   **Receptionist:** Which service would you like to book?
   _state:_ `{"intent":"book_appointment"}`
2. **customer turn 1:** A cleaning
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** John Smith
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"John Smith"}`
4. **customer turn 3:** 2425550119
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"John Smith","phone":"+12425550119"}`
5. **customer turn 4:** yes that works, 9:30
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"John Smith","phone":"+12425550119","pendingBareTime":"9:30"}`
6. **customer turn 5:** ok please do
   **Receptionist:** I have you down for Routine cleaning. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"John Smith","phone":"+12425550119","pendingBareTime":"9:30"}`

### TM-60cceb98 — Safe but incomplete (scripted LLM fixture, fixed)

- Source dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1); variant adaptation; seed 1019
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}; actual outcome: unresolved
- ❌ [incomplete] eval:tool_safety: expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}) not found in order
- ❌ [incomplete] eval:resolution: expected outcome "completed", actual "unresolved"
- ❌ [incomplete] booking-missing: no successful booking was executed
- ❌ [incomplete] repeated-reply @script turn 2: identical reply on consecutive turns: "Thanks — go on."

1. **customer turn 0:** I'd like a cleaning next week
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Tuesday 12:30pm
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
4. **customer turn 3:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, August 25 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30","phone":"+12425550130","name":"Bob Smythe","pendingAction":"confirm_service"}`
5. **customer turn 4:** Wait, I can't do 12:30, can you change it to 1:30?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","phone":"+12425550130","name":"Bob Smythe","pendingBareTime":"1:30"}`
6. **customer turn 5:** yes
   **Receptionist:** I have you down for Routine cleaning on Tuesday. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","phone":"+12425550130","name":"Bob Smythe","pendingBareTime":"1:30"}`

### TM-078a0f20 — Completed, quality defects (scripted LLM fixture, fixed)

- Source dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1); variant adaptation; seed 1030
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours
- Expected: outcome `completed`, bookings 1, {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 2: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 4: identical reply on consecutive turns: "Thanks — go on."

1. **customer turn 0:** I need an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **customer turn 1:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **customer turn 2:** Wednesday if possible
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **customer turn 3:** Anything sooner than 3pm?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
5. **customer turn 4:** oh well. book Wednesday 3pm then
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **customer turn 5:** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, August 26 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00","phone":"+12425550139","name":"Megan Smith","pendingAction":"confirm_service"}`
7. **customer turn 6:** yes that's right
   **Receptionist:** I've captured your request — a team member will confirm.
   _state:_ `{"bookingJustCompleted":true,"lastCompletedBooking":{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00","name":"Megan Smith","phone":"+12425550139"}}` _actions:_ request_appointment
8. **customer turn 7:** No thanks
   **Receptionist:** Thanks — go on.
   _state:_ `{"bookingJustCompleted":true,"lastCompletedBooking":{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00","name":"Megan Smith","phone":"+12425550139"}}`

### TM-0b5b803f — Completed, quality defects (scripted LLM fixture, fixed)

- Source dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2); variant adaptation; seed 1033
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed
- Expected: outcome `completed`, bookings 1, {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}; actual outcome: completed
- ❌ [incomplete] repeated-reply @script turn 2: identical reply on consecutive turns: "Thanks — go on."
- ❌ [incomplete] repeated-reply @script turn 3: identical reply on consecutive turns: "Thanks — go on."

1. **customer turn 0:** I'd like to book a cleaning for Friday at 10am
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **customer turn 1:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
3. **customer turn 2:** Actually could we do Monday at 11am instead?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"11:00"}`
4. **customer turn 3:** Hm, could I go back to Friday 10am but make it a filling?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
5. **customer turn 4:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** I have you down for Basic filling on Friday, August 21 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00","phone":"+12425550142","name":"Dina Gray","pendingAction":"confirm_service"}`
6. **customer turn 5:** yes
   **Receptionist:** I've captured your request — a team member will confirm.
   _state:_ `{"bookingJustCompleted":true,"lastCompletedBooking":{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00","name":"Dina Gray","phone":"+12425550142"}}` _actions:_ request_appointment
