# Staging report for Codex review — PR #2 (draft)

Branch `claude/phase5-jobs-and-receptionist-fixes`. Evidence files: `evidence/staging-part1-database-2026-10-09.md`, `evidence/staging-part2-small-test-2026-10-09.md`. Runbook: `STAGING_SETUP_CHECKLIST.md`; plan: `STAGING_TEST_PLAN.md`; gates: `RELEASE_GATE_CHECKLIST.md` (§7, §8).

## What was done (owner-approved, staging only)
- **Part 1 (database only):** fresh Render Postgres 18.6 (`bahaos_staging_db`, free, expires 2026-11-08): migrations 0000–0012 applied, migration fingerprint equals the committed `drizzle/*.sql` files, clinic tenant + one admin login created, backup restored into a local PG 18.6 and verified (full schema definitions + row counts + per-table content hashes identical).
- **Part 2 (small test):** deployed to Render free web service; health 200; wrong verify token 403; unsigned webhook 401; Meta-signed real delivery accepted; one booking conversation from the owner's phone → exactly one correct appointment (Routine cleaning, 2026-10-13 14:00 Nassau, `booked`) after the app's own confirmation and a separate "yes".
- Deployed commits: `3a8561c`, then `9113880` (secret-free webhook logging). Anthropic Haiku 4.5, a few dozen turns, inside the owner's $5 org spend limit. No production access, no merge, no Phase 6.

## Findings, most important first
| # | Finding | Type | Severity for pilot | Suggested action |
|---|---|---|---|---|
| 1 | **Meta business restriction.** Business Manager restricted ("verify your business"; 131031 "Business Account locked"). Replies are **accepted by Meta's API (outbox `sent`) but never reached the phone.** Real customer delivery is unproven. | Meta account (not code) | **Blocker** for any pilot | Owner decides on Meta business verification/appeal; re-run S8 after |
| 2 | **Outbox `sent` ≠ delivered.** Meta status webhooks (`statuses`, e.g. failed) arrive as "0 message(s)" deliveries and are ignored. | Code gap (known limitation, now confirmed live) | High | Persist/act on delivery receipts; surface failures to staff |
| 3 | **`DB_BOOKING_ENABLED` missing → app silently used in-memory demo booking tools**, replied "request captured", stored nothing. Nothing at startup says which backend is active. | Config + missing safeguard | High | Log the active backend at startup; in `NODE_ENV=production` refuse or warn loudly when demo tools would be used |
| 4 | **Model-written confirmation prose not backed by app state.** With the name missing the model produced "I have you down… Reply YES to confirm"; the customer's "yes" correctly did **not** book (app asked for the name). Confusing, not unsafe. | Code (LLM path) | Medium | Override/suppress model text that looks like a confirmation prompt unless `pendingAction` is armed |
| 5 | **Out-of-order name dropped:** "Trevor 2428012847" before a date stored the phone but not the name (name is only taken when asked, or alongside a time/phone in the right state). | Known limitation | Medium | Accept the name+phone message when name is missing, or ask for the name immediately |
| 6 | **Invisible 401 on bad webhook signature** (no log line) hid a mis-copied secret. | Fixed in `9113880` (+ test) | — | Review the log lines (never include secret/signature/body) |
| 7 | **Setup gap:** the WhatsApp account was not subscribed to the app (`GET /{waba}/subscribed_apps` listed only Meta's test-events app) so real messages never reached the service. Fixed with `POST /{waba}/subscribed_apps`. | Setup runbook | — | Added as a step in `STAGING_SETUP_CHECKLIST.md` §2.2b |
| 8 | **`npm audit` during the Render build: 8 vulnerabilities (5 moderate, 2 high, 1 critical).** Not triaged. | Dependencies | Medium–High | Triage and fix before a pilot |
| 9 | Outbound replies to a number not on Meta's allowed list → outbox `dead_letter` after 1 attempt (`meta_131030`), no retry storm. | Good behaviour | — | Keep as S8 evidence |
| 10 | Configuration mistakes that cost time (all owner-side, all recoverable): a 17-character account ID pasted as an access token; a double-pasted DB URL whose refusal message echoed the password (credential rotated; guard now prints only plain host/db names, tested); app secret mis-copied once. | Process | — | Runbook now says: tokens start `EAA`, paste once, check length |

## Test status
- Free suites at `9113880`/head: unit 1467/1467, DB 371/371, lint/tsc/build clean, fallback eval 37/38 (NL-01 only).
- Live (staging): small test above only. **Not run:** S4 corrections, S5 duplicate replay, S6 ambiguous times (the time-qualifier fix is still not live-verified), S7 takeover, S8 real delivery limits, S9–S12.

## Please review / decide
1. Is finding 3 (backend visibility + refuse demo tools in production) worth a small code change before the next staging run? Proposed: log line at startup + `NODE_ENV=production` guard.
2. Finding 2: should a receipts handler be in scope before a pilot, or documented as an accepted gap for a supervised pilot?
3. Finding 4: preferred fix — post-process model text vs. prompt change?
4. Finding 8: triage plan for the audit findings.
5. Any objection to treating the Meta restriction as an external blocker (owner action) rather than something to engineer around.

## State left behind (staging)
App secret restored; the `9113880` service is running on Render free (sleeps when idle); one unfinished simulated customer conversation (`+1 242 555 0100`); the owner's laptop IP is still on the database allow-list and a temporary Meta token is outstanding (both to be removed after testing). Owner's phone number is not recorded here.
