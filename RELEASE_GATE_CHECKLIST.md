# Release-gate checklist — remaining evidence (PR #2)

Status: **NOT approved for merge or production.** Updated again for the access/staging/limitations review (§3b, §4a, §6, `STAGING_TEST_PLAN.md`). Updated after the SECOND live Haiku 4.5 run (corrected harness, tested commit `dd47d7f`, 2026-10-09) and Codex's review of `7fb93d7`. Dates and SHAs below identify what was true when each item was done. Completed here: live run (limited observation, §1), harness corrections with offline regressions (§1). **Run 2 (§1b) found two wrong-data bookings (R21 name, R22 phone). FIXED (§1c) and RE-VERIFIED live by a NEW focused run (run 3, §1d): 30/30 clean.** **Still open:** original 27-conversation corpus (replacement now run, §2), real-environment migration history (§3), staging/Meta/TLS/backup/rollback evidence (§4), owner disposition of NL-01 (§5). No merge, deployment, production access or Phase 6 work is authorized by this document.

## 0. Evidence already in hand (not repeated)
Unit 1460/1460 (87 files) · DB 371/371 · lint/typecheck/build clean · fallback eval 37/38 · calendar hash `6e7e48e1…` unchanged · Codex independently re-ran the targeted suites at `de21ad5`. Lanes: fallback provider and scripted-LLM tests exercise **application logic**, not Anthropic's language understanding; DB tests use a disposable local Postgres.

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

## 1b. Live run 2 — corrected harness, REPLACEMENT-27 included (tested commit `dd47d7f6d9edbd705299751f2136be9aa6303118`)
**Lane:** LIVE `claude-haiku-4-5-20251001` (API-reported) · **SIMULATED booking tools only** — no database, no WhatsApp, no real calendar, no durable persistence · business clock frozen per case · clean working tree enforced; the exact commit is recorded in the artifact. Owner-approved: ≤ $5 total, soft stop $4. Spending gate: authoritative `count_tokens` for the exact request before every call + full 1024-token output reservation; never sent unmeasured; billed-vs-counted checked. Artifact: `evidence/live-anthropic-haiku-4-5-dd47d7f.json` (per-step actions with success flags, payloads, state, replies truncated to 240 chars; all synthetic).

| Measure | Value |
|---|---|
| Runs | 126 = (CORRECTED-15 + REPLACEMENT-27) × 3 passes |
| API calls · tokens | 593 · 1,463,966 input · 38,630 output |
| **Estimated cost** | **$1.6571** (usage × named price snapshot; **not** a billing receipt; stop never triggered) |
| Hard failures (wrong data / booking before approval / duplicate) | **6 runs — 2 cases × 3 passes (R21, R22)** |
| Soft shortfalls (no booking completed) | 31 runs |

**CORRECTED-15 (name / date / booking confirmation) — rerun with the corrected oracle:** 45 runs, **0 hard failures**; 44 clean; 1 soft (L11 pass 1: the model asked a follow-up, a second approval turn completed the correct booking). Every booking carried the right name/time; qualified dates `2026-10-16` / `2027-01-04`; no booking before the explicit approval turn (now asserted on every setup turn incl. the final identity input, with per-step actions recorded); ambiguous "at 3" never booked; repeated yes → exactly one booking.

**REPLACEMENT-27 — a REPLACEMENT, NOT the original tests.** The historical "14/27" report remains historical: its transcripts were never recovered and it has **not** been rerun; these results must not be compared to it as a like-for-like score.
- 15 cases clean in all 3 passes: R01 `3 pm`, R04 `2:30pm`, R05 `9am`, R07 `October 14 at 10am`, R15 `yeah man`, R16/R17 appointment inquiries (never started a booking), R18/R19 repeated yes (exactly one booking), R20 `my name is actually Trevon`, R23 service change after details, R24–R26 next-week forms (`2026-10-13`, `2026-10-14`, `2026-10-22`), R27 `sometime next week` (asked for a day).
- **2 cases produced WRONG data in all 3 passes (HARD) — new blocking findings, not regressions of earlier fixes:**
  - **R21 `It's Alisha, not Alicia`** (no "my name is"): the booking is made for **Alicia**. Offline probe: neither the fallback nor the shared LLM pre-extraction replaces the name from an explicit "X, not Y" contrast.
  - **R22 `wrong number, it's 2428019999`**: the booking keeps the **old phone** (`+12428012847`). Offline probe: the fallback path updates it; the shared LLM pre-extraction does **not** (its correction-marker list lacks "wrong number").
- 10 cases never completed a booking in any pass (SOFT, safe — the bot kept asking or restated the summary): R02 `15:00`, R03 `noon`, R06 ISO date `2026-10-14 at 10:00`, R08 `Oct 20th 14:00` (formats the flow did not accept), R09–R11 service typos (NL-01, expected), R12–R14 dialect (`wanna`, `tryna`, `tmrw`). These are findings about coverage, not wrong bookings.

**What this does NOT show:** one model (Haiku 4.5), synthetic conversations, simulated tools — not durable booking, WhatsApp, other models, or a production reliability percentage. 3 passes is a small variance sample. R21/R22 have not been fixed; no application code changed for this run.

## 1c. R21 / R22 fixes — free tests only (no paid call)
- **R21 `It's Alisha, not Alicia`:** new `extractNameContrast` (`src/ai/correction-language.ts`) replaces the stored name **only when the rejected name equals the name on file**; wired into the fallback provider (including the confirmation-summary stage) and the shared LLM pre-extraction. "Tuesday not Wednesday", "Alicia, not Alisha", "not Alicia" change nothing.
- **R22 `wrong number, it's 2428019999`:** "wrong number/phone/name/date/time" and "not the right number" are now correction language, so the shared LLM pre-extraction overwrites the phone (the fallback already did).
- **Regressions** (`tests/regressions/name-phone-correction.test.ts`, fallback + scripted-LLM, simulated tools, frozen clock): stored state replaced; **no booking on the correction turn**; **a fresh confirmation is re-armed** and the booking after "yes" carries the corrected name/phone exactly once; a "yes" bundled with the correction never books the old name; negative controls; pure-function table. 30 of them fail on the previous code. The R21 known-gap pin was removed from the REPLACEMENT-27 offline smoke, which now asserts **zero hard failures for all 42 cases** on the fallback provider.
- **Follow-up (Codex review of `b833274`, fixed, free tests only):** "yes, Alisha not Alicia" then "yes" booked **"Yes Alisha"**, and "It\u2019s Alisha, not Alicia" (curly apostrophe) then "yes" booked **"It\u2019s Alisha"**, in both lanes. Cause: the contrast parser did not treat confirmation words as lead-ins and did not normalize apostrophe variants. Fixed (confirmation/filler lead-ins; curly/modifier/backtick apostrophes normalized on the message **and** the stored name). Tests now assert the **exact stored name and the exact final booking payload**, and the bundled-confirmation test requires **zero booking attempts on the correction turn, then exactly one booking with the corrected details after a separate confirmation** (name and phone, both lanes). 36 fail on the previous parser; 4 parser mutations are killed.
- Observation (unchanged, pre-existing): the confirmation summary lists service/date/time but does **not echo name or phone**, so the customer re-approves without seeing the corrected contact details. Owner may want that changed (UX/safety); not done here.
- **What this does NOT prove:** the live Haiku model has not been re-run on R21/R22 — the live evidence in §1b still shows the failures at `dd47d7f`. A confirming live re-run needs a new explicit approval.

## 1d. Live run 3 — FOCUSED R21/R22 re-verification (a NEW run; run 2's failing evidence is preserved untouched in §1b)
**Lane:** LIVE `claude-haiku-4-5-20251001` (API-reported), **SIMULATED booking tools only** (no database, WhatsApp, calendar or persistence). **Tested commit `4fcec1a5740f6a08b74a85a1e842fdaa4c65e072`** (clean tree enforced, recorded in the artifact). Owner-approved: ≤ **$1** additional; gate = authoritative `count_tokens` + full output reservation before every request; `--stop-on-hard` (stop at the first wrong-data/safety failure). Artifact: `evidence/live-anthropic-haiku-4-5-focused-r21-r22-4fcec1a.json`.

| Measure | Value |
|---|---|
| Cases × passes | 10 variants × 3 = **30 runs** |
| API calls · tokens | 150 · 370,797 input · 10,295 output |
| **Estimated cost** | **$0.4223** (usage × named price snapshot; not a billing receipt; budget gate never triggered) |
| Hard failures · soft shortfalls | **0 · 0** (the run was not stopped early) |

Variants (each 3×): R21 `It's Alisha, not Alicia` · `yes, Alisha not Alicia` · curly `It’s Alisha, not Alicia` · `yes, it’s Alisha, not Alicia` (bundled + curly) · `Yes Alisha not Alicia` · R22 `wrong number, it's 2428019999` · curly `wrong number, it’s …` · bundled `yes, wrong number, it's …` · bundled + curly · `that’s the wrong phone number, 2428019999`.
Per run (oracle + an independent re-parse of the saved JSON, 0 mismatches): the stored name/phone after the correction turn are **exact** (`Alisha` / `+12425550100`, or `Trevor` / `+12428019999`); the correction turn made **zero booking attempts**; **exactly one** approval turn (a separate "yes"); **exactly one** successful booking, its payload carrying the exact corrected name and phone, time 14:00, Routine cleaning.
**Not shown:** one model, 10 synthetic phrasings × 3, simulated tools — not durable booking, WhatsApp, other models, or a reliability percentage. It re-verifies the R21/R22 family only; the other run-2 soft shortfalls (formats, NL-01 typos, dialect) were not re-run and remain open findings.

## 2. Missing historical 27-conversation corpus
**Original: still not found** (searched repo, git history, two Aug-21 archives, local transcripts). The historical "14/27" result is **historical only — not rerun, not reproducible**.
**Replacement: authored and RUN (§1b)** as `REPLACEMENT-27` (`scripts/live-eval/replacement27.ts`; owner-approved). Proposed categories: natural time formats ×5, ISO/24-hour dates ×3, service typos ×3, Bahamian dialect ×4, appointment inquiry ×2, repeated YES ×2, corrections ×4, next-week ×4. It is a replacement; do not report its numbers as the original.
**DECISION still open:** accept REPLACEMENT-27 as the permanent substitute, or supply the original transcripts.

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

### 3b. Read-only migration-hash check — what was actually reachable (done)
**Real environments reachable from here: NONE.** There is no Railway/remote host configured (README says Railway is not configured), no hosting CLI is installed or logged in, and `.env` holds only local keys: its `DATABASE_URL` names `bahaos_dev` on localhost, which **does not exist** (the local server lists only `bahaos_concurrency_test` — the disposable test DB — plus unrelated `brandforge_*` databases that were not touched). So **no real-environment migration history could be checked**; that remains open and needs the owner (see `STAGING_TEST_PLAN.md`, "What I need").
The one reachable database (disposable, read-only comparison of all 13 `drizzle.__drizzle_migrations` rows against the repo files and journal): **11 match; 2 mismatch, both explained by pre-commit edits, neither matching any committed text:**
| Migration | DB hash | Repo hash (HEAD) | Explanation |
|---|---|---|---|
| 0008 `durable_outbox` | `5b2d4a63739d` | `66437feb031f` | the test DB ran the first draft (backfill without `id`); committed texts are `aae128a2a8ce` (`9365683`) and `66437feb031f` (`0bb6106`+) |
| 0010 `human_inbox` | `8fa1b6164c83` | `e176dcbb0856` | the test DB ran the draft **before** the audit added the `last_activity_at` backfill; the single committed text is `e176dcbb0856` |
Journal `when` timestamps all match. Implication for a real environment: **0008 has two committed texts, 0010 one**; any real DB must be compared against those (commands above). A real DB whose stored hash matches none of them ran an uncommitted draft and must be inspected, not assumed fine. No database was modified.

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

### 4a. Staging inputs — available vs missing (verified, names only; no secret values read)
| Input | Available? | Detail |
|---|---|---|
| Isolated staging database | **MISSING** | only the local disposable DB; `bahaos_dev` in `.env` does not exist |
| Hosting target with HTTPS/TLS | **MISSING** | Railway not configured; no CLI/login |
| Meta test number, token, App Secret, verify token, webhook target | **MISSING** | no `WHATSAPP_*` variable exists anywhere |
| Anthropic key | local key exists; **no staging key / no staging spend approval** | `.env` also holds GEMINI/OPENROUTER names (unused by this plan) |
| Test phone numbers | **MISSING** | owner-controlled numbers needed |
| Backup/restore **procedure** | **PROVEN LOCALLY** | `pg_dump -Fc` → restore into a scratch DB → identical (22 tables, 13 migration rows, 25 enums, 82 indexes, 70 constraints, all sampled row counts equal); dump 1 s / restore < 1 s on the tiny test DB. This proves the commands and the check, **not** production-size timing or provider-snapshot behaviour |
| Backup/restore on real infrastructure | **NOT TESTED** | needs the staging DB |
Concrete sequence for approval (not run): **`STAGING_TEST_PLAN.md`** — S0 backup/restore · S1 migration rehearsal · S2 flags-off deploy + signed/unsigned webhook + TLS · S3 booking · S4 corrections (R21/R22 variants) · S5 duplicate/replayed messages · S6 ambiguous-time check · S7 takeover · S8 WhatsApp window/delivery limits · S9 memory · S10 jobs (SIGTERM, DB blip, standalone worker) · S11 soak · S12 rollback drill.

## 5. Decisions needed from the owner
0. **Class-A time qualifiers (§6):** approved and implemented offline in `0bfa3c7` (clarify instead of guess). Still needs the S6 staging check; not live-verified.
0b. **R21/R22:** fixed and live-reverified (§1d). Decide whether the confirmation summary should echo name/phone (pre-existing UX/safety gap).
1. Approve (or decline) the live Anthropic run: model(s), cap (suggest $10), harness.
2. Corpus: supply the original 27, or approve `REPLACEMENT-27` (labelled as such).
3. Run the §3 read-only SQL against each real environment and report the result.
4. Provide/approve a staging environment, a Meta test number, and a tested backup; then authorize the §4 sequence.
5. Accept or schedule NL-01.

## 6. Remaining time-format / typo / slang limitations and release recommendation
Evidence: live run 2 soft shortfalls plus a free offline probe of the application layer (fallback and shared LLM pre-extraction agree on every row; clock Mon 2026-10-12). "Safe" = the bot re-asks and never stores a wrong value.
| Class | Examples (probe result) | Behaviour | Recommendation |
|---|---|---|---|
| **A. Silent WRONG time (qualifier ignored)** | `quarter to 3 pm`→15:00 (should be 14:45); `half past 3pm`/`quarter past 3pm`/`10 to 3pm`→15:00; **`not 3pm`→15:00**; `before/after/around 3pm`→15:00; `3pm or 4pm`→15:00, `3 or 4pm`→16:00; `from 2pm to 4pm`→14:00; `3pm tomorrow` takes 3pm | wrong data stored; mitigated only because the summary shows the time and needs a separate yes | **FIXED OFFLINE in `0bfa3c7`; live verification pending (S6).** Qualified times now store no time, keep any existing time but mark it unresolved (nothing can be confirmed or booked), ask for ONE exact time, and require a fresh, separate confirmation. 84 free regression tests (parser, fallback, scripted-LLM) assert stored state and final booking payloads and fail without the fix. Normal single times unchanged. (`3pm tomorrow` is an ordinary single time, not a defect.) |
| **B. Unsupported but SAFE (re-asked)** | `15:00`, `1500`, `14h`, `noon`, `midnight`, `half past two`, `2 o'clock`, `around 3`, `at 2 in the afternoon`, `mornin 10`, bare `9`/`3` (am/pm asked by design), ISO `2026-10-14`, `the 20th` (no month), `Oct 20th 14:00` (date taken, time not) | conversation stalls or loops; no wrong data. Live run: R02 `15:00`, R03 noon, R06 ISO, R08 never completed in 3/3 passes | **Do not block** staging. Block a *broad public launch* only if the owner's customers commonly type 24-hour times (`15:00`/ISO are cheap to add: a strict parser for `HH:MM` and `YYYY-MM-DD`). Ask the owner. |
| **C. Service typos (NL-01)** | `clening`, `fillin`, `rootcanal`, `cleening`, `I want my teeth cleaned` → no service | re-asks "which service?"; never books a wrong service | **Do not block.** Accepted limitation; schedule fuzzy matching later. |
| **D. Slang / dialect** | `I wanna book a cleanin` (intent, no service), `tryna`, `gimme`, `tmrw 3pm` | mixed: intents often recognised; live R12–R14 stalled in 3/3 passes | **Do not block.** Pilot with a human-handoff-friendly script; collect real transcripts for a corpus. |
Also not blocking, but note: the confirmation summary does not echo name/phone (product decision); status/delivery receipts are ignored; free-form WhatsApp text only.
**Bottom line:** Class A is fixed offline; keep it as a pilot gate until S6 passes on staging. Everything else is safe-failure coverage to monitor.

## 7. Staging Part 1 result (2026-10-09, database only)
A fresh Render staging database (PostgreSQL 18.6) was initialised with the 13 committed migrations; its migration fingerprint equals the committed files exactly, the clinic and an admin login were created, and a backup was restored into a local PostgreSQL 18.6 and verified (schema definitions, counts and per-table content hashes identical). Evidence: `evidence/staging-part1-database-2026-10-09.md`. This is a **new staging database, not a production or pre-existing environment**, so the "real-environment migration history" blocker (§3) is still open for production. Deploy, WhatsApp and the S2–S12 tests have not run.

## 8. Staging Part 2 — small initial test (2026-10-09)
Deployed `9113880` to Render (free) and ran: health, webhook security (wrong token 403, unsigned 401, Meta-signed delivery accepted), and one booking conversation from the owner's phone — exactly one correct appointment after the app's confirmation and a separate "yes". Evidence and findings: `evidence/staging-part2-small-test-2026-10-09.md`. **Open blockers surfaced:** the Meta business restriction (replies accepted but not delivered), delivery receipts ignored (`sent` ≠ delivered), no startup indication of the booking backend (a missing `DB_BOOKING_ENABLED` silently used demo tools), out-of-order name dropped plus model-written confirmation prose, 8 npm audit findings. S4–S12 not yet run.

**Real WhatsApp delivery to a customer phone: BLOCKED (Meta business restriction) — not passed.** The fix plan for the findings above (delivery receipts, backend startup guard, app-controlled confirmation prompts, dependency triage) is `FIX_PLAN_STAGING_FINDINGS.md`; nothing in it is implemented yet.

## 9. Fixes for the staging findings (implemented offline; not deployed)
| Finding | Fix | Commit | Status |
|---|---|---|---|
| Dependency audit (8) | `npm audit fix` (non-breaking): production 3 → 0; 4 moderate dev-tooling findings remain (`drizzle-kit` chain; needs a breaking `--force`, not applied). Reachability notes are assessments, not guarantees. Record: `evidence/dependency-audit-2026-10-09.md` | `4f9ff05` | done offline |
| Silent demo booking tools in production | startup runtime-profile log + production guard (`ALLOW_DEMO_TOOLS_IN_PRODUCTION` override) | `4c2afc2` | done offline |
| Model-written confirmation prose | model text can only invite a confirmation when it is the app's own prompt for the stored values | `8053431` | done offline |
| `sent` ≠ delivered | delivery receipts: ledger + `delivery_*` columns (migration 0013), early/duplicate/out-of-order/tenant-isolated | `a78c1e0` | done offline; **0013 not applied to staging** |
| Real WhatsApp delivery to a customer phone | none possible in code | — | **BLOCKED** by the Meta restriction (not passed) |
Remaining blockers: Meta business restriction (owner action); applying 0013 and redeploying staging (needs approval); live re-verification of these fixes and of the time-qualifier fix; S4–S12; production migration history; NL-01 acceptance (safe clarification accepted for staging; pilot acceptance undecided); out-of-order name gap (not in this scope); remaining 4 dev-tooling audit findings.

