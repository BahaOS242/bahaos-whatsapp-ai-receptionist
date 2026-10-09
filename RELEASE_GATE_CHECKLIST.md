# Release-gate checklist — remaining evidence (PR #2)

Status: **NOT approved for merge or production.** Updated after the live Haiku 4.5 run (2026-10-09) and Codex's review of `5762e25`. Dates and SHAs below identify what was true when each item was done. Completed here: live run (limited observation, §1), harness corrections with offline regressions (§1). **Still open:** original 27-conversation corpus or an approved replacement (§2), real-environment migration history (§3), staging/Meta/TLS/backup/rollback evidence (§4), owner disposition of NL-01 (§5). No merge, deployment, production access or Phase 6 work is authorized by this document.

## 0. Evidence already in hand (not repeated)
Unit 1147/1147 · DB 371/371 · lint/typecheck/build clean · fallback eval 37/38 · calendar hash `6e7e48e1…` unchanged · Codex independently re-ran the targeted suites at `de21ad5`. Lanes: fallback provider and scripted-LLM tests exercise **application logic**, not Anthropic's language understanding; DB tests use a disposable local Postgres.

**NL-01 (open, documented, not a release regression):** typos in both the service name and the weekday ("clening on tusday") are not understood by the deterministic matchers, so the bot asks again or escalates; it never books wrongly. Pre-existing since the first eval; unrelated to the name/date fixes. Decision: accept for release, or schedule fuzzy matching as separate work.

## 1. Live Anthropic validation — EXECUTED 2026-10-09 (owner-approved: Haiku 4.5, cap raised to $10)
**Lane:** LIVE `claude-haiku-4-5-20251001` (model id reported by the API) driving the real `LLMProvider` + `ReceptionistAgent`; **simulated tools only** (no DB, WhatsApp or real calendar). Clock frozen per case (Fri 2026-10-09T16:00Z; L11 Sun 2026-10-11; L12 Wed 2026-12-30). Harness: `scripts/eval-live-corrections.ts` (budget-gated before every call; gate proven to block with a tiny cap and zero calls). Raw synthetic transcripts and payloads: `evidence/live-anthropic-haiku-4-5-2026-10-09.json`.

| Result | Value |
|---|---|
| Case runs | 45 (15 cases × 3 passes) |
| **Hard failures** (wrong name/date/time payload or state, booking before confirmation, duplicate booking) | **0** |
| Soft shortfalls (no booking completed / errors) | 0 |
| API calls / tokens | 207 calls · 508,475 input · 12,083 output |
| **Actual cost** | **$0.5689** (cap $10; first estimate ≈ $2 was ~3.5× too high) |

Per case (all 3 passes identical): L1–L7 corrected time 15:00 and name Trevor/Alicia, never "Actually"/"Nah…"; L8 booked as exactly `Alisha`; L9–L11 `preferredDate 2026-10-16` 14:00; L12 `2027-01-04` 10:00; L13 control `2026-10-16`; L14 ambiguous "at 3" → no booking (clarified); L15 repeated yes → exactly one booking. Every booking occurred only after the explicit "yes".
**Not shown by this run (stated plainly):** it validates one model (Haiku 4.5), 15 synthetic conversations, simulated tools — not Sonnet/Opus, not durable persistence, not WhatsApp. For the correction cases the booked date is the bare weekday label `Tuesday` (pre-existing behaviour: the tool resolves it against "now"); only the qualified-date cases carry ISO dates. Three repeats per case is a small sample of model variance, not a statistical guarantee.

### Harness corrections after review (`5762e25` → this commit) — offline only, NO new paid call
Codex found real weaknesses in the harness that produced the run above. Fixed and covered by offline regressions (`tests/live-eval`, mock SDK + injected provider; no network/key/spend):
- **Pre-confirmation guard (P1):** the old check (`i + 1 < noActionBefore`) skipped the final identity/correction turn, and the old runner skipped sending YES once a booking existed — so a premature booking on the last setup turn could pass. Now every case separates `setup` turns from explicit `approval` turns and a booking attempt (successful or not) on **any** setup turn is a hard failure. Regression: an injected provider that books on the final identity turn with a correct-looking payload is rejected. The scorer also tests each `setup` index 0–4.
- **Spend controls (P2):** `--cap` must be a plain positive decimal ≤ $25 (NaN/Infinity/negative/empty/exponent rejected) and is required (no default authority); `--passes` an integer 1–10; the model must be on an exact allowlist (`claude-haiku-4-5-20251001`) with a named price snapshot (2026-10-06); the input bound is chars/2 (≈2× conservative) and **every settled call is checked against it — an under-estimate halts the run**; missing/garbled usage or a transport failure charges the reserved worst case and halts (no retry). **Budget qualification (explicit):** this is an *estimated budget with stop controls*, **not a proven hard dollar cap**. The chars/2+64 input bound is a heuristic; an under-estimate is only detected *after* that call has already incurred usage, so a single call can exceed the reservation. Before any newly authorized run that needs an inviolable ceiling, use authoritative pre-call token counting (`messages.count_tokens`) or another validated upper bound, and/or an independent provider-side spend limit. Residual uncertainty: the figure is an *estimate from reported usage × price snapshot*, not a billing receipt, and a failed request may be billed in ways the client cannot see.
- **L15** now requires **exactly one** successful booking (zero is a soft shortfall, two a hard failure); the per-step artifact now records every executed action with its success flag.
- Mutation-checked: removing each control (last-turn guard hole, L15 zero-allowed, finite/regex cap checks, model allowlist, gate, under-estimate check, failed-request charge) makes a regression fail.
**Provenance of the saved Haiku evidence:** it was produced by the **pre-correction** harness (no per-turn action records; weaker guard). Codex re-parsed the saved JSON and found it internally consistent (42 single-payload runs, 3 no-booking runs for the ambiguous case, completion only on YES turns), but it remains a **limited, named-model observation by the developer** — not an independent rerun, not a billing receipt, and **not a reliability percentage**. A re-run with the corrected oracle is **not authorized** and may not be needed; decide after reviewing whether existing evidence plus the offline regressions meet the approved scope.

## 2. Missing historical 27-conversation corpus
**Searched:** the repository (`tests/eval` holds only the 38-scenario corpus), `git log`, the Desktop/Downloads project archives (two Aug-21 snapshots of this repo: same 38-scenario eval, no 27-set), all local Claude session transcripts (the string "14/27" appears only in the pasted Codex text). **Not found.** I cannot see the chat attachment the report came from.
**Options (DECISION):** (1) owner/Codex supplies the original transcripts; (2) approve the clearly-labelled replacement below.
**Proposed `REPLACEMENT-27` (NOT the original — results must never be reported as "the 14/27 rerun")**, authored from TEST_FINDINGS.md categories: natural time formats ×5 (3pm, 3 pm, 15:00, "half three", noon), ISO/24-hour dates ×3, service typos ×3 (overlaps NL-01), Bahamian dialect ×4, appointment inquiry (must not start a booking) ×2, repeated YES ×2, identity corrections ×4 (L1–L8 family), next-week ×4 (L9–L12). Run on the fallback provider first (free, deterministic), then — only if approved — live. Expect some failures; they are findings, not regressions.

## 3. Migration history — what is known and unknown
Migrations 0008–0012 (outbox, requeue, inbox, memory, jobs) are all additive.
**Known (from git and local databases):**
- `origin/main` = `ba3671d`; it contains **none** of 0008–0012. They exist only on the PR branch.
- 0008 text history: (a) the first draft omitted `id` in the legacy-retry backfill and failed on any database holding a legacy `retry_pending` message — fixed **before** the first commit; (b) first committed in `9365683` with the enum literal `'retry_pending'`; (c) changed in `0bb6106` to `status::text = 'retry_pending'` so a fresh install can run the whole chain in one transaction. (c) is semantically identical wherever the enum value was committed long ago.
- Drizzle's migrator compares only the newest applied `created_at`; it never verifies the stored hash, so editing text after the fact raises no error and an already-applied migration is not re-run.
- On this machine the only database that ever received them is the disposable `bahaos_concurrency_test` (plus scratch databases the tests create and drop). The `bahaos_dev` database named in `.env` does not exist on the local server, and its configured role does not exist, so it was not inspected.
**Unknown (cannot be determined from here):** whether Railway/staging/production or any other database ever applied the pre-`::text` text of 0008. This is **unverified**, not "no".
**How to close it (owner, read-only, per environment):**
```sql
SELECT id, hash, to_timestamp(created_at/1000.0) AS applied_ts FROM drizzle.__drizzle_migrations ORDER BY created_at;
-- count rows and compare the newest created_at with drizzle/meta/_journal.json "when" values for 0008..0012
```
**A migration row alone does not prove which DRAFT ran.** Drizzle stores `sha256` of the migration file text. Compare each environment's stored 0008 hash with the candidates:
```bash
git show 9365683:drizzle/0008_durable_outbox.sql | shasum -a 256   # first committed text (enum literal)  = aae128a2a8cef52a…
git show 0bb6106:drizzle/0008_durable_outbox.sql | shasum -a 256   # current text (status::text)         = 66437feb031f5b82…
```
Real example of why this matters: the disposable local test database recorded `5b2d4a63…` for 0008, which matches **neither** committed text — it ran an earlier, uncommitted draft (the one missing the backfill `id`; it passed there only because the database held no legacy `retry_pending` rows). For any unknown environment also inspect the actual state rather than trusting the row: `\d outbox_messages` (columns/indexes present), `SELECT count(*) FROM outbox_messages WHERE idempotency_key LIKE 'legacy-retry:%'` versus `SELECT count(*) FROM messages WHERE status = 'retry_pending'`, and compare message/outbox counts. An environment whose hash matches neither candidate, or whose backfill state is inconsistent, is **not cleared** — report it rather than assuming.
If an environment already lists 0008 with a matching hash: nothing to do (no rerun; no checksum check; semantics identical). If it lists only ≤0007: it will apply the current text. Either way no history rewrite is needed; do **not** edit 0008 again. Test evidence: `tests/db/migrations-fresh.test.ts` (fresh install; Phase 4→5 upgrade with data snapshot; rollback SQL).

## 4. Staging validation and rollback plan
**Preconditions:** staging is a *copy* of production data (or a realistic seed), isolated from production credentials; a point-in-time backup/snapshot exists and a restore was **tested**; Meta uses a **test** phone number/WABA, never the production number.

**Configuration checklist (all flags default OFF in code and `.env.example`):**
| Setting | Required value / note |
|---|---|
| `DATABASE_URL` | staging DB only |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | both set — **without the app secret the webhook skips signature verification** (the app only warns) |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` | test number; absent ⇒ mock transport |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | as production intends |
| `KNOWLEDGE_ENABLED`, `MEMORY_ENABLED`, `JOBS_ENABLED` | start `false`; enable one at a time (§ order below) |
| `JOBS_POLL_INTERVAL_MS`, `JOBS_CONCURRENCY`, `JOBS_SHUTDOWN_TIMEOUT_MS` | defaults unless load-testing |
| Practice configuration | tenant row/slug, services, hours, staff users (`scripts/staff.ts`) created for staging |

**Order of validation (stop at the first failure; each step has its own rollback below):**
1. **Migrate rehearsal** on a restored snapshot: apply 0008→0012 in one run; record duration/locks; verify row counts of messages/appointments/conversations/memories/outbox unchanged except the 0008 backfill; run the §3 SQL; run the legacy-staff_owned follow-up SQL from `INBOX.md`.
2. **Deploy with all flags off.** Smoke: `GET /health`; Meta webhook GET verification; one signed POST from the Meta test number → reply via the outbox; an **unsigned** POST must be rejected.
3. **TLS:** terminate at the proxy/platform; certificate valid; HTTP→HTTPS redirect; `curl -I https://…/inbox/` shows `Strict-Transport-Security`; `/api/inbox` unreachable over plain HTTP; no mixed content; login from a real device.
4. **WhatsApp** (know the current limits first): the adapter sends **free-form text only**; there is no template-message support. Webhook processing **ignores status-only events** (`value.statuses`), so delivered/read receipts are **not reconciled** — a message marked `sent` means *accepted by the Meta API*, nothing more. Test: inbound text; duplicate delivery (same message id ⇒ one effect); outbound inside the 24-hour customer-service window ⇒ `sent`; outbound **outside** the window ⇒ Meta rejects it, the outbox shows **Failed to send** with the provider error, and **retrying will not fix it**. Expected, documented recovery: the customer sends a new inbound message (opening a fresh window) and staff replies, or — only if the owner approves building it — an approved template path. Do not rely on receipts; keep "no delivery confirmation" visible in the staging sign-off.
5. **Human takeover:** pending handoff appears in `/inbox`; accept/takeover suppresses AI replies; staff reply is delivered once; return-to-AI.
6. **Enable `MEMORY_ENABLED`** → run the memory scenarios incl. "forget" requests; watch `{scope:"memory"}` logs. **Enable `JOBS_ENABLED`** → `npm run jobs -- enqueue-memory-sweep <tenant>`; watch `{scope:"jobs"}`; kill -TERM the process during a job.
7. **Soak** ≥ 24 h with real-shaped traffic; alert on dead-lettered outbox rows, `failed` jobs, `poll_error`s.
**Abort criteria:** any wrong identity/date payload; any duplicate durable booking; any AI reply after takeover; webhook accepting unsigned requests; migration data diff.

**Rollback (by layer — fastest first):**
| Layer | Action | Notes |
|---|---|---|
| Flags | set `JOBS_ENABLED`/`MEMORY_ENABLED`/`KNOWLEDGE_ENABLED=false`, restart | instant; data stays |
| Application | redeploy previous image | safe back to the **last build that includes 0008–0012**; older builds predate the outbox |
| 0012 (jobs) | `DROP TABLE background_job_attempts; DROP TABLE background_jobs; DROP TYPE job_status;` | tested in `migrations-fresh.test.ts` |
| 0011 (memory) | `DROP TABLE customer_memories; DROP TYPE memory_kind, memory_source, memory_status;` | memory content is lost by design |
| 0008–0010 (outbox/inbox) | **no clean down-migration** (enum values cannot be removed, legacy retry rows were copied into the outbox) | restore the pre-migration snapshot; this is why step 1 requires a tested restore |
Also: remove the migration rows from `drizzle.__drizzle_migrations` only when re-applying after a manual drop.

## 5. Decisions needed from the owner
1. Approve (or decline) the live Anthropic run: model(s), cap (suggest $10), harness.
2. Corpus: supply the original 27, or approve `REPLACEMENT-27` (labelled as such).
3. Run the §3 read-only SQL against each real environment and report the result.
4. Provide/approve a staging environment, a Meta test number, and a tested backup; then authorize the §4 sequence.
5. Accept or schedule NL-01.
