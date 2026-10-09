# Release-gate checklist — remaining evidence (PR #2, head at time of writing: `de21ad5`)

Status: **NOT approved for merge or production.** Planning document only: no paid API call, no staging/production access, no new code was run for it. Existing test evidence is reused, not re-run (see the PR ledger). Items marked **DECISION** need the owner.

## 0. Evidence already in hand (not repeated)
Unit 1147/1147 · DB 371/371 · lint/typecheck/build clean · fallback eval 37/38 · calendar hash `6e7e48e1…` unchanged · Codex independently re-ran the targeted suites at `de21ad5`. Lanes: fallback provider and scripted-LLM tests exercise **application logic**, not Anthropic's language understanding; DB tests use a disposable local Postgres.

**NL-01 (open, documented, not a release regression):** typos in both the service name and the weekday ("clening on tusday") are not understood by the deterministic matchers, so the bot asks again or escalates; it never books wrongly. Pre-existing since the first eval; unrelated to the name/date fixes. Decision: accept for release, or schedule fuzzy matching as separate work.

## 1. Live Anthropic validation (NOT RUN — needs spend approval)
**Goal:** show that the corrected name/date behaviour holds with a real model in the loop (the model proposes tool calls; app code still owns extraction/validation). Simulated tools only; no database, no WhatsApp, no real calendar.

**Harness (to write after approval, ~1 small script):** reuse `tests/torture/helpers.ts` `TortureConversation` with the real `AnthropicChatClient` (`ANTHROPIC_MODEL`, default `claude-haiku-4-5-20251001`) + `createSimulatedReceptionistTools`; freeze only `Date` at `2026-10-09T16:00:00Z` (Fri noon Nassau) per case; log model id/version, clock, tool backend, per-turn state and every `request_appointment` payload to a JSON file (no customer data — all synthetic).

**Cases (15 conversations; each asserts stored state AND final payload):**
| # | Transcript (customer turns) | Must hold |
|---|---|---|
| L1 | cleaning → yes → Tuesday 2pm → actually 3pm → Trevor 2428012847 → yes | time 15:00; name Trevor (never "Actually"); 1 request, none before the final yes |
| L2 | … → nah make it 3pm instead → Alicia 2425550100 → yes | name Alicia |
| L3–L5 | "no, 3pm instead" / "make it 3pm" / "change it to 3pm please" at the correction turn | time 15:00, no name set |
| L6 | … → actually 3pm → 2428012847 → Trevor → yes | phone before name works |
| L7 | name+phone known → actually 3pm | name preserved |
| L8 | … Alicia → "My name is Alisha not Alicia" → yes | payload name exactly `Alisha` |
| L9 | cleaning → next week Friday at 2pm → Trevor 2428012847 → yes | `preferredDate 2026-10-16`, 14:00 |
| L10 | "Friday next week at 2pm" | 2026-10-16 |
| L11 | clock Sun 2026-10-11: next week Friday | 2026-10-16 |
| L12 | clock Wed 2026-12-30: next week Monday | 2027-01-04 |
| L13 | control: "next Friday at 2pm" | 2026-10-16 (unchanged rule) |
| L14 | ambiguous "at 3" | clarifies; no action |
| L15 | "yes" repeated twice | at most one action |

**Pass bar (RELEASE_GATES hard blocker):** zero incorrect identity/date payloads across all runs; any miss is reported with the exact transcript, not averaged away. Run each case 3× (model variance).

**Estimated cost** (measured prompt: system ≈ 4.8k chars, tools ≈ 2.7k chars ≈ 2.2k input tokens/call; ~3k with history; ≈ 200 output tokens; ~1.3 calls/turn; 15 cases × ~8 turns × 3 repeats ≈ 470 calls → ≈ 1.4M input + 0.1M output tokens). Prices from the cached model table (2026-10-06; re-check before approving):
| Model | Input/Output per MTok | Estimate (3× repeats) | Single pass |
|---|---|---|---|
| `claude-haiku-4-5` (current default) | $1 / $5 | **≈ $2** | ≈ $0.70 |
| `claude-sonnet-5-5` | $2 / $10 | ≈ $4 | ≈ $1.40 |
| `claude-opus-5-5` | $4 / $20 | ≈ $8 | ≈ $2.70 |
Budget cap suggestion: **$10 hard stop** (≈ 2× headroom on the most expensive row). The API key is present in the local `.env` and has **not** been used.
**DECISION:** (a) approve spend and cap; (b) which model(s) — the production model is the one that matters; (c) approve writing/running the harness.

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
If an environment already lists 0008: nothing to do (no rerun; no checksum check; semantics identical). If it lists only ≤0007: it will apply the corrected text. Either way no history rewrite is needed; do **not** edit 0008 again. Test evidence: `tests/db/migrations-fresh.test.ts` (fresh install; Phase 4→5 upgrade with data snapshot; rollback SQL).

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
4. **WhatsApp:** inbound text, duplicate delivery (same message id ⇒ one effect), outbound inside the 24-hour window, an outbound **outside** it (expect a visible "Failed to send", retry works), status callbacks, rate limits.
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
