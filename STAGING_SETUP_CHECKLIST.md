# Staging setup on Render (beginner-friendly)

**Host:** the repo's docs name Railway, but the owner created staging on **Render**; this file is now Render-specific. Nothing in the app is host-specific. **Nothing below has been run.** No deployment, paid AI calls, database changes, merge or production access are authorised until the owner approves the sequence at the bottom.

**Secret rules.** Secrets are typed only into Render's Environment screen, Meta's dashboard, or hidden terminal prompts (`read -s`), never into chat, a PR, a commit or a screenshot. When a step involves a secret, report "done", not the value.

## A. Settings check (names only; tick each)
Render → your web service → *Environment*. Required:

| Name | Must be |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the staging database's **Internal** URL (the service runs inside Render) |
| `DB_BOOKING_ENABLED` | `true` (otherwise bookings never touch the database) |
| `ANTHROPIC_API_KEY` | the staging-only key (the *only* AI key that matters; OpenAI/Gemini/OpenRouter keys are ignored) |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` |
| `ADMIN_SESSION_SECRET` | long random value (Render can generate one) |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | all four set (without the app secret, signatures are not checked) |
| `WHATSAPP_API_VERSION` | `v21.0` |

Must be **absent**: `JOBS_ENABLED`, `MEMORY_ENABLED`, `KNOWLEDGE_ENABLED`, Google Calendar, SMTP, Voyage, and `PORT` (Render supplies it). Also check: the Meta access token is the *temporary* one (expires in about 24 h; regenerate on test day), and your own phone is on Meta's allowed-recipient list.

Possible gaps I cannot see from here: service build command, auto-deploy, plan (free web services sleep and free databases expire/have no backups), database region, and whether the database is empty.

## B. Web service settings (create/edit, but do **not** deploy yet)
- Repo `BahaOS242/bahaos-whatsapp-ai-receptionist`, branch `claude/phase5-jobs-and-receptionist-fixes` (never `main`).
- **Build command: `npm ci --include=dev && npm run build`** (the compiler is a dev dependency; with `NODE_ENV=production` plain `npm ci` would skip it and the build would fail).
- **Start command: `npm start`.** Health check path: `/health`. **Auto-Deploy: off.** Same region as the database.

## C. Initialize the database (laptop, one step at a time; needs approval)
Why the laptop: the migration tool is a dev dependency and Render shells need a paid plan. The laptop talks to the database's **External** URL.
1. Render → database → *Access Control*: temporarily allow your own IP. (Remove it at the end.)
2. In a Terminal in the repo, enter the External URL without showing it:
```bash
read -rs "DATABASE_URL?External database URL (hidden): "; export DATABASE_URL PGSSLMODE=require
```
3. Read-only sanity check that it is empty and is the right database:
```bash
psql "$DATABASE_URL" -X -A -t -c "select current_database(), (select count(*) from information_schema.tables where table_schema='public')"
```
Expect `0` tables. Anything else: stop.
4. Apply the migrations (changes the staging database only):
```bash
npm run db:migrate
```
5. Compare with the committed migration files (must show 13 rows, hashes match `STAGING_TEST_PLAN.md` S1 notes):
```bash
psql "$DATABASE_URL" -X -A -t -f scripts/staging/compare-db.sql
```
Expect 22 tables, 82 indexes, 70 constraints, 25 enums, 13 migration rows.

## D. Test clinic and admin login
The single test clinic is "Bahamas Dental Service". Create its record now (otherwise the first WhatsApp message does it):
```bash
STAGING_INIT_CONFIRM=yes npx tsx scripts/staging/init-tenant.ts
```
Then the admin login (choose your own email; the password is generated and shown once, so save it in your password manager, not in chat):
```bash
npx tsx scripts/staff.ts bahamas-dental-service you@example.com "Your Name" admin
```

## E. Backup and restore check (S0)
```bash
pg_dump -Fc "$DATABASE_URL" -f /tmp/staging.dump
createdb bahaos_staging_restore_check
pg_restore --no-owner -d bahaos_staging_restore_check /tmp/staging.dump
psql "$DATABASE_URL" -X -A -t -f scripts/staging/compare-db.sql > /tmp/src.txt
psql bahaos_staging_restore_check -X -A -t -f scripts/staging/compare-db.sql > /tmp/restored.txt
diff /tmp/src.txt /tmp/restored.txt && echo IDENTICAL
dropdb bahaos_staging_restore_check; rm /tmp/staging.dump
```
Local `pg_dump` is v16; it must be at least the Render database's version (check the version on the database page). The restore goes to a throwaway **local** database, so no second paid database is needed. `IDENTICAL` is the pass condition.

## F. Deploy (after approval)
Manual deploy of the service (auto-deploy stays off) → `GET /health` returns 200 → in Meta set Callback URL `https://<service>.onrender.com/webhooks/whatsapp` and the verify token → *Verify and save* → subscribe to **messages**. Then S2–S12 of `STAGING_TEST_PLAN.md`.

## G. Clean up when finished
Remove your IP from the database access list, unset the terminal variable (`unset DATABASE_URL`), delete or revoke the temporary Meta token, and suspend the service.

## Proposed AI budget: $1 maximum
Haiku 4.5 costs about $0.004 per conversation turn (≈3k input and ≈150 output tokens). The plan's AI steps (S3–S9) are about 80 turns ≈ $0.35; a hard ceiling of 200 turns ≈ $0.80 stays under $1. Controls: (1) the Anthropic console spend limit on the staging key set as low as the console allows, (2) I count turns and stop at 150, (3) no automated or looped traffic, only manual messages from your phone. The app itself has no spend cap; the console limit is the backstop. Render's own charges are separate and shown on the plan page.
