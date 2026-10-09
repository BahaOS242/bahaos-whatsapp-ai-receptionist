# Staging setup on Render (beginner-friendly)

**Host:** the repo's older docs name Railway, but the owner created staging on **Render**. Nothing in the app is host-specific. **Nothing below has been run.**

**Two separate approvals.**
- **Part 1 — database only** (initialize, test clinic/admin, backup + restore verification). No web service, no deploy, no WhatsApp, no AI key use, no paid calls.
- **Part 2 — deploy and paid WhatsApp testing.** Not requested yet; it is presented for approval only after Part 1 is verified.

**Secret rules.** Secrets are typed only into Render's screens, Meta's dashboard, or hidden terminal prompts (`read -s`); never into chat, a PR, a commit or a screenshot. When a step involves a secret, report "done", not the value.

---
# PART 1 — Database only (EXECUTED and verified 2026-10-09; see `evidence/staging-part1-database-2026-10-09.md`)

## 1.0 Approved database identity
The scripts will only touch the one database you approve, identified by its **host name** and **database name** (neither is a secret; copy them from the Render database page, "Hostname" and "Database"). Write them into your approval message. Every script checks both, plus asks the server which database it is connected to, and refuses on any mismatch. There is no override flag.

## 1.1 Prepare (Render page, then Terminal)
1. Render → database → note the **plan** (free databases expire and have no backups) and the **Postgres version**. Local `pg_dump` is v16; it must be at least the server's version (the script checks this).
2. Render → database → *Access Control*: temporarily add your own IP. (Removed in 1.7.)
3. In Terminal, in the repo folder, enter the identity and the External URL (hidden), once per Terminal window:
```bash
export STAGING_DB_HOST="<approved host name>" STAGING_DB_NAME="<approved database name>"
read -rs "DATABASE_URL?External database URL (hidden): "; export DATABASE_URL PGSSLMODE=require
```
4. Confirm identity (read-only; prints only host/database):
```bash
npx tsx scripts/staging/db-identity.ts
```
Expect `approved staging database confirmed: <host>/<name>`. Anything else: stop.

## 1.2 Check the database is empty (read-only)
```bash
psql "$DATABASE_URL" -X -A -t -c "select count(*) from information_schema.tables where table_schema='public'"
```
Expect `0`. Anything else: stop and report.

## 1.3 Apply the migrations (changes the staging database only)
```bash
npx tsx scripts/staging/db-identity.ts && npm run db:migrate
```
Then the read-only fingerprint (expect 22 tables, 82 indexes, 70 constraints plus 201 `not_null_constraints` on PostgreSQL 18, 25 enums, 13 migration rows, migration fingerprint `b008423228a63dd4c5386b14895d8c0b`):
```bash
psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -f scripts/staging/compare-db.sql | head -6
```
Migration hashes are compared with the committed files per `STAGING_TEST_PLAN.md` S1 (0008 has two committed texts, 0010 one). A mismatch means stop and report; do not "fix".

## 1.4 Test clinic and admin login
The single test clinic is "Bahamas Dental Service" (slug `bahamas-dental-service`). The script re-checks the approved identity itself:
```bash
npx tsx scripts/staging/init-tenant.ts
npx tsx scripts/staff.ts bahamas-dental-service you@example.com "Your Name" admin
```
(Use your own email. The password is generated and shown once; save it in your password manager, not in chat.)

## 1.5 Backup and restore verification
One command; it **stops at the first error** (`set -euo pipefail`):
```bash
./scripts/staging/backup-verify.sh
```
It (a) re-checks the approved identity and the client/server versions, (b) writes the backup to `~/bahaos-staging-backups/` (folder mode 700), checks it is non-empty and readable, (c) restores it into a throwaway **local** database with `--exit-on-error`, (d) diffs the **schema** (full `pg_dump -s`) and (e) diffs the **data**: row counts plus a per-table content hash of every row. The only difference ignored is pg_dump's random `\restrict` token line. Pass = the last line says `VERIFIED`.
- **The backup file is never deleted by the script.** Delete it yourself only after you see `VERIFIED` and I confirm; on any failure both the backup and the scratch database are kept for inspection.
- Rehearsed offline on the local disposable database: passes on an untouched copy; fails (exit 1, differing table hash) when one restored row is changed.

## 1.6 Report back (ticks only)
Identity confirmed · database was empty · migrations applied and counts match · clinic + admin created · backup `VERIFIED`.

## 1.7 Clean up
Remove your IP from *Access Control*, run `unset DATABASE_URL STAGING_DB_HOST STAGING_DB_NAME PGSSLMODE`.

---
# PART 2 — Deploy and paid WhatsApp testing (NOT requested yet)

Presented for approval only after Part 1 is verified.

## 2.1 Settings (Render → web service → Environment; names only, tick each)
| Name | Must be |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the staging database's **Internal** URL |
| `DB_BOOKING_ENABLED` | `true` |
| `JOBS_ENABLED` | **`false`** (explicit) |
| `MEMORY_ENABLED` | **`false`** (explicit) |
| `KNOWLEDGE_ENABLED` | **`false`** (explicit) |
| `ANTHROPIC_API_KEY` | the staging-only key (the only AI key that matters; other providers' keys are ignored) |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` |
| `ADMIN_SESSION_SECRET` | long random value |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | all four set |
| `WHATSAPP_API_VERSION` | `v21.0` |

Must be absent: Google Calendar, SMTP, Voyage, and `PORT` (Render supplies it). The Meta token should be the temporary one (about 24 h); your phone must be on Meta's allowed-recipient list.

## 2.2 Web service settings
Repo branch `claude/phase5-jobs-and-receptionist-fixes` (never `main`). **Build:** `npm ci --include=dev && npm run build` (the compiler is a dev dependency). **Start:** `npm start`. Health check `/health`. **Auto-Deploy off.** Same region as the database.

## 2.3 Deploy, then test
Manual deploy → `GET /health` 200 → in Meta set Callback URL `https://<service>.onrender.com/webhooks/whatsapp` + verify token → *Verify and save* → subscribe to **messages** → `STAGING_TEST_PLAN.md` S2–S12 (S0/S1 are covered by Part 1). Cleanup: remove the IP, revoke the temporary Meta token, suspend the service.

## 2.4 AI budget — an ESTIMATE, not a cap (decision for Part 2)
Estimate: Haiku 4.5 at roughly $0.004 per message turn (about 3k input and 150 output tokens), the plan's AI steps are about 80 turns ≈ $0.35, so **≈ $1 is a planning estimate, not a guarantee**. A turn-count limit is a discipline, not a dollar limit: the app has **no spend cap**, and the length of a turn varies.
A hard cap exists only if an **Anthropic-side control is verified** by you in the console and reported to me, for example (a) a workspace/organization spend limit on the staging key's workspace, or (b) prepaid credit of about $1–5 with auto-reload off, so the balance is exhausted before more can be spent. Until one is verified, treat any dollar figure as an estimate and the run as **not** hard-capped. Render's own charges are separate.
