# Staging setup checklist (beginner-friendly, Railway)

**Host choice:** this repo already names **Railway** as its hosting platform (`PROJECT_CONTEXT.md`, `IMPLEMENTATION_PLAN.md`; no Dockerfile or other host config exists). Staging uses Railway too, in its **own project** so it can never share anything with production.

**Rules**
- Secrets (tokens, keys, passwords) are typed ONLY into Railway's *Variables* screen, Meta's dashboard, or a password manager. Never into chat, a PR, a commit or a screenshot. If one leaks, rotate it.
- Nothing is created, deployed or run until you approve each step. Setup guidance only so far: no paid resources, no deploy, no paid AI calls, no staging tests.
- Staging never gets production keys, the real clinic's number, or real customer data.

## Step order (one at a time)
1. **Railway project.** New project named `bahaos-staging` (separate from any production project). Check the plan/price shown before confirming; paid resources need your say-so.
2. **Postgres.** In that project add the Postgres plugin. Railway generates `DATABASE_URL`; the app will reference it, so you never copy it anywhere.
3. **App service.** Add a service from GitHub, repo `BahaOS242/bahaos-whatsapp-ai-receptionist`, branch `claude/phase5-jobs-and-receptionist-fixes` (never `main`). Build `npm ci && npm run build`, start `npm start`. Turn **off** auto-deploy on push until the test plan starts. Generate the public domain (gives the https:// address; Railway does the TLS).
4. **Variables** (service → Variables). Names and staging values:

| Variable | Staging value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | reference the Postgres plugin's `DATABASE_URL` (Railway "Add reference") |
| `DB_BOOKING_ENABLED` | `true` (real database booking path) |
| `ANTHROPIC_API_KEY` | a **new staging-only key** created in the Anthropic console with a low monthly spend limit |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` |
| `ADMIN_SESSION_SECRET` | long random string you generate in your own terminal (`openssl rand -base64 48`) and paste straight into Railway |
| `WHATSAPP_APP_SECRET` | from Meta App settings → Basic → App secret |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | any long random string you invent (reuse it in Meta in step 6) |
| `WHATSAPP_ACCESS_TOKEN` | Meta API Setup page (temporary token is fine; expires in ~24h) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta API Setup page (the numeric id, not the phone number) |
| `WHATSAPP_API_VERSION` | `v21.0` |
| `JOBS_ENABLED`, `MEMORY_ENABLED`, `KNOWLEDGE_ENABLED` | leave **unset** (off) until the plan reaches S9/S10 |
| `PORT` | do not set (Railway supplies it) |
| OpenAI/Gemini/OpenRouter keys, Google Calendar, SMTP, Voyage | leave **unset** |

5. **Meta test number.** developers.facebook.com → My Apps → Create App → type *Business* → add the **WhatsApp** product. Use the free test number Meta provides. Under *API Setup*, add your own phone as an allowed recipient (enter Meta's code). Keep Meta in *development* mode.
6. **Webhook.** WhatsApp → Configuration → Callback URL `https://<your-railway-domain>/webhooks/whatsapp`, Verify token = the string from step 4, click *Verify and save*, then subscribe to the **messages** field. Verification only succeeds after the app is deployed, so this is done during the approved run.
7. **Readiness report to Claude** (check boxes only, never values): project created · Postgres added · variables entered · Anthropic limit set (and the limit amount) · Meta app + test number ready · your phone added.

## Facts the plan relies on
- The first inbound message auto-creates the single tenant row. A staff login (`scripts/staff.ts`) can only be created after that, so the inbox test (S7) runs after S3.
- The app checks every inbound `phone_number_id` against `WHATSAPP_PHONE_NUMBER_ID`; a mismatch rejects all messages.
- Migrations are run explicitly with `npm run db:migrate` against the staging database only (plan step S1), never automatically.
- Rollback: set the flags off, or scale the service to zero; the database is disposable and a backup is taken first (S0).
