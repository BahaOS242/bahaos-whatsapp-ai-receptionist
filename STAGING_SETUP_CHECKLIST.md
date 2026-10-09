# Staging setup checklist (beginner-friendly)

Goal: a safe copy of BahaOS that only your own test phone talks to. **Nothing here touches production or real customers.**
**Credentials rule:** passwords, tokens and API keys go ONLY into the host's "Environment variables / Secrets" screen (or a password manager). Never paste them in chat, a PR, a commit, or a screenshot. If one leaks, rotate it.

## 1. Staging host (where the app runs)
- [ ] Pick one host that gives you an **https://** address automatically (examples: Render, Railway, Fly.io). Name it clearly, e.g. `bahaos-staging`.
- [ ] Create a service from branch `claude/phase5-jobs-and-receptionist-fixes` (never `main`). Build `npm ci && npm run build`, start `npm start`.
- [ ] In the host's Secrets/Environment screen add the variables listed in `.env.example` (see the staging list below). The names to fill in: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ADMIN_SESSION_SECRET`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. Leave `JOBS_ENABLED` and `MEMORY_ENABLED` **false** until the test plan says otherwise.
- [ ] Confirm `https://<your-staging-address>/health` shows OK in a browser.

## 2. Staging database (separate from everything else)
- [ ] Create a **new** Postgres database on the same provider, named `bahaos_staging`. Never reuse a production or personal database.
- [ ] Copy its connection string straight into the host's `DATABASE_URL` secret (do not paste it anywhere else).
- [ ] Turn on automatic backups, and note the date of the first backup. Run the S0 backup/restore rehearsal in `STAGING_TEST_PLAN.md` before any other step.
- [ ] Run migrations only on this database (`npm run db:migrate`) once S1 says to.

## 3. Meta (WhatsApp) test number
- [ ] Sign in to developers.facebook.com → create an app of type "Business" → add the **WhatsApp** product. Meta gives you a free **test phone number**.
- [ ] Add your own phone as an allowed recipient (Meta sends a code to confirm it).
- [ ] From the WhatsApp → API Setup page, put these into the host's secrets: the access token (a *temporary* one is fine), the phone number ID, the app secret, and a verify token you invent yourself (any long random string).
- [ ] In WhatsApp → Configuration set the **Callback URL** to `https://<your-staging-address>/webhooks/whatsapp` and the Verify token to your invented string; click Verify. Subscribe to the `messages` field.
- [ ] Send "hi" from your phone to the test number. Seeing the message arrive in the staging logs means the pipe works.

## 4. Safety stops
- [ ] Use a **separate Anthropic API key with a low spending limit** for staging only (about $5 is plenty for the plan).
- [ ] Production keys, the real clinic's number, and real customer data are never added to staging.
- [ ] When done, tell Claude which boxes are checked (not the values). Staging does not run until you approve `STAGING_TEST_PLAN.md`.
