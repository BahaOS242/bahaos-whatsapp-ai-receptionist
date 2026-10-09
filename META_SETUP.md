# Meta WhatsApp Cloud API — Live Setup & Smoke Test

**Status of this document: the code and this checklist are ready. No live
Meta connection has been established or tested in this environment — no
`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_APP_SECRET`/etc. are configured here.
Everything below is what a real operator needs to do to run the first
live test; nothing in it has been executed against Meta's actual API.**

Do not paste real secrets into this file, into chat, or into any
committed file. `.env` (git-ignored) is the only place they belong.

---

## 1. Meta app requirements

- A Meta Developer account (business.facebook.com / developers.facebook.com).
- A Meta App of type **Business**, with the **WhatsApp** product added to it.
- Access to the app's dashboard to configure the webhook and read the
  temporary/permanent access token.

## 2. WhatsApp Business setup

- A WhatsApp Business Account (WABA) linked to the Meta App above.
- Meta provides a **free test phone number** automatically when you add
  the WhatsApp product to a new app — sufficient for the smoke test
  below. A real production number requires business verification,
  separate from this checklist.

## 3. Test phone number requirements

- The Meta-provided test number can only message phone numbers you've
  explicitly added to its **recipient allow-list** (WhatsApp > API Setup
  > "To" field in the Meta dashboard) — add your own phone there before
  attempting the smoke test.
- Test numbers are rate-limited and reset periodically; this is a Meta
  platform constraint, not something this codebase controls.

## 4. Webhook URL

- This app's webhook endpoint is `POST/GET /webhooks/whatsapp` (see
  `src/routes/whatsapp-webhook.ts`).
- Meta requires an **HTTPS** URL it can reach from the public internet.
  For local development, use a tunnel (e.g. `ngrok http 3000`) and
  register the tunnel's HTTPS URL + `/webhooks/whatsapp` as the callback
  URL in the Meta dashboard's WhatsApp > Configuration > Webhook section.
- For a real deployment, use the deployed app's own public HTTPS URL.

## 5. Verification-token setup

- Choose any random string yourself (e.g. `openssl rand -hex 32`) — this
  is NOT provided by Meta, you invent it.
- Set it as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in `.env`.
- Enter the SAME value into the Meta dashboard's webhook configuration
  "Verify token" field when registering the callback URL.
- See §11 for the exact verification procedure this triggers.

## 6. App-secret setup

- Meta App dashboard > Settings > Basic > "App Secret" (click "Show").
- Set it as `WHATSAPP_APP_SECRET` in `.env`.
- This is what `src/whatsapp/webhook-signature.ts` uses to verify the
  `X-Hub-Signature-256` header on every inbound POST — **without it,
  signature verification is silently skipped** (a loud startup warning
  fires in production if this happens — see
  `src/routes/whatsapp-webhook.ts`). Set this before going live.

## 7. Access-token setup

- Meta App dashboard > WhatsApp > API Setup shows a **temporary access
  token** (valid ~24 hours) — fine for the smoke test below.
- For anything longer-lived, generate a **permanent token** via a System
  User (Meta Business Settings > Users > System Users) with the
  `whatsapp_business_messaging` permission.
- Set it as `WHATSAPP_ACCESS_TOKEN` in `.env`.

## 8. Phone-number-ID setup

- Meta App dashboard > WhatsApp > API Setup shows the test number's
  **Phone number ID** (a numeric string, NOT the phone number itself).
- Set it as `WHATSAPP_PHONE_NUMBER_ID` in `.env`.
- This is also what `src/routes/whatsapp-webhook.ts` checks every
  inbound message's `metadata.phone_number_id` against, rejecting
  anything that doesn't match (see the "TENANT/ACCOUNT ARCHITECTURE"
  comment there) — get this exactly right or every real message will be
  rejected.

## 9. Required environment variables

Add to `.env` (never commit real values — `.env` is git-ignored):

```
WHATSAPP_ACCESS_TOKEN=<from step 7>
WHATSAPP_PHONE_NUMBER_ID=<from step 8>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<invented in step 5>
WHATSAPP_APP_SECRET=<from step 6>
WHATSAPP_API_VERSION=v21.0
```

Classification (see `src/config/env.ts` for the exact validation):

| Variable | Code-level requirement | Real go-live requirement |
|---|---|---|
| `DATABASE_URL` | **Required always** — app fails to start without it | Required |
| `ANTHROPIC_API_KEY` | Optional — falls back to a deterministic rule-based provider with no key | Recommended (the deterministic fallback is functional but not conversational) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Optional — GET verification always returns 403 without it | **Required** — nothing else lets Meta verify the webhook at all |
| `WHATSAPP_APP_SECRET` | Optional — signature verification is silently skipped without it | **Required before real traffic** — without it, ANY request (not just Meta's) is trusted; a loud startup warning fires in production if this gap is detected |
| `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` | Optional as a pair — outbound falls back to an in-memory mock transport (logs only, no real send) without both | **Required** — this is what makes a reply actually reach a real phone |
| `WHATSAPP_API_VERSION` | Optional, defaults to `v21.0` | Optional — bump only if Meta deprecates the default version |
| `OUTBOUND_RETRY_POLL_INTERVAL_MS` | Optional, defaults to 5000 (how often the durable outbox worker polls — see `OUTBOX.md`) | Optional |

None of the `WHATSAPP_*` variables are ever required for `npm test`, `npm run test:db`, or `npm run chat` — every automated test and the local dev CLI work with zero WhatsApp configuration (mock transport, no signature check). This is intentional, not a gap: real credentials are opt-in, only needed for an actual live connection.

## 10. Exact startup command

```bash
npm run build
npm start
```

or for local development with the dev server already running via
`npm run dev`-equivalent (`npx tsx src/server.ts`), whichever this
project's actual process manager expects. Confirm `DATABASE_URL` points
at a migrated database first (`npm run db:migrate`).

## 11. Exact webhook verification procedure

1. In the Meta dashboard, WhatsApp > Configuration, enter the callback
   URL (`https://<your-public-url>/webhooks/whatsapp`) and the verify
   token from step 5, then click "Verify and save."
2. Meta sends `GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<your token>&hub.challenge=<random string>`.
3. This app responds `200` with the raw challenge string as plain text
   (see the GET handler in `whatsapp-webhook.ts`) — Meta considers the
   webhook verified once it receives its own challenge value back.
4. **Expected result:** the Meta dashboard shows a green "Verified"
   status next to the webhook. If it shows an error, see Troubleshooting
   (§15) — the most common cause is a verify-token mismatch or the URL
   not being reachable/HTTPS.

## 12. Exact inbound-message smoke test

1. From the allow-listed test phone (§3), send a plain text WhatsApp
   message to the test number — e.g. "book a cleaning."
2. **Expected server-side result:** within a few seconds, this app's
   logs show something like:
   ```
   [mock WhatsApp] -> +<sender number>: <the AI's reply text>
   ```
   (or, once real credentials are configured, no `[mock WhatsApp]` log —
   the reply is sent via the real Graph API instead — see §13).
3. **Expected database result:** a new row in `customers` (keyed by the
   sender's WhatsApp id), a new row in `conversations`, and a new
   `messages` row with `direction='inbound'` and a non-null
   `whatsapp_message_id`.
4. Send a follow-up message ("Tuesday at 2pm") and confirm the reply
   correctly remembers the service from message 1 (proves persistence —
   see `tests/db/whatsapp-webhook-integration.test.ts` for the automated
   equivalent of this exact check).

## 13. Exact outbound-message smoke test

1. Once `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` are both set
   (§7–8), repeat the inbound smoke test above.
2. **Expected result:** the reply arrives as an ACTUAL WhatsApp message
   on the test phone, not just a server log line — this is the one step
   that proves outbound Graph API authentication actually works.
3. Check the outbox: the reply's `outbox_messages` row should be
   `status = 'sent'` with a `provider_message_id` (a `wamid...` string);
   the matching `messages` row mirrors it (`status = 'sent'`).
4. If it shows `retry_wait`, the durable outbox worker
   (`src/messaging/outbox-worker.ts`, polling every
   `OUTBOUND_RETRY_POLL_INTERVAL_MS`, default 5s; retries on a 30s / 1m /
   2m / 4m schedule) will attempt it again automatically. To see why,
   look at the row's `last_error`, `error_code` and `error_metadata`, or
   use `inspectOutbound` (`src/messaging/outbox-inspection.ts`), which
   explains the state in one sentence. A `dead_letter` row means automatic
   delivery has given up and the message needs a human to look at it.

## 14. Expected logs/results summary

| Step | Expected log/DB signal |
|---|---|
| Webhook verification | Meta dashboard shows green "Verified" |
| Inbound message received | `messages` row with `whatsapp_message_id` set |
| Reply generated | Server log shows the reply text (mock) or nothing unusual (real send) |
| Reply delivered (real creds) | Message actually arrives on the test phone; `messages.status = 'sent'` |
| A booking completes | New row in `appointments` with `status = 'booked'` |
| Duplicate webhook delivery | Second identical `whatsapp_message_id` produces NO new row, NO second reply |

## 15. Troubleshooting the most likely failures

- **Webhook verification fails immediately:** verify-token mismatch
  between `.env` and the Meta dashboard field, or the URL isn't
  reachable over HTTPS from the public internet (a tunnel that isn't
  running, or a firewall blocking Meta's servers).
- **Verification succeeds but no inbound messages ever arrive:** the
  test phone number sending the message isn't on the allow-list (§3), or
  the webhook subscription's "messages" field toggle wasn't enabled in
  the Meta dashboard (WhatsApp > Configuration > Webhook fields).
- **Inbound arrives but every message is silently rejected (never
  reaches the agent):** check server logs for `rejected message for
  unexpected phone_number_id` — `WHATSAPP_PHONE_NUMBER_ID` doesn't match
  what the test number actually reports; re-copy it from the dashboard.
- **Inbound arrives but signature verification rejects it (`401`):**
  `WHATSAPP_APP_SECRET` doesn't match the app's real secret, or was
  regenerated in the dashboard after `.env` was last set — re-copy it.
- **Outbound send fails with a 401/"Invalid OAuth access token":** the
  temporary token (§7) expired (~24h) — generate a new one, or set up a
  permanent System User token.
- **Outbound send fails with 400 "recipient phone number not in
  allowed list":** the target phone isn't allow-listed (§3) — this is
  the test-number restriction, not a bug.
- **A message is processed twice / appears to book twice:** this should
  never happen (see `tests/db/whatsapp-webhook-integration.test.ts`'s
  idempotency tests) — if observed against real Meta traffic, capture
  the exact `whatsapp_message_id` and the server logs around it; this
  would be a genuine regression worth investigating immediately, not an
  expected/known limitation.

## 16. How to safely stop/disable the integration

If the first live test goes wrong (unexpected replies reaching a real
customer, a booking loop, anything alarming), stop it in this order:

1. **Fastest, safest stop — unsubscribe the webhook in the Meta
   dashboard** (WhatsApp > Configuration > Webhook > toggle off, or
   delete the callback URL entirely). Meta immediately stops delivering
   anything; this app keeps running but receives nothing. Reversible in
   seconds by re-registering the same URL/token.
2. **Stop outbound sends without touching the webhook:** unset
   `WHATSAPP_ACCESS_TOKEN` (or `WHATSAPP_PHONE_NUMBER_ID`) and restart
   the process — `createMessagingProvider` (see
   `src/messaging/create-messaging-provider.ts`) falls back to the mock
   transport the instant either is missing, so inbound messages are
   still received/processed/persisted, but nothing is ever actually sent
   to a real phone. Useful for debugging conversation logic live without
   risking further outbound messages. **Caution:** the mock transport
   *accepts* everything, so replies already queued in the outbox are
   consumed by it and marked `sent` without ever reaching a phone. Only
   use this for throwaway debugging, never to "pause" real traffic.
3. **Full stop:** `npm stop` / kill the process, or scale the deployment
   to zero instances. The outbox worker (§13, running in-process)
   stops with it — queued (`pending` / `retry_wait`) replies simply wait,
   durably, in Postgres until a process is running again; a claim that was
   in flight when the process died is recovered once its lease (2 minutes)
   expires. Nothing is lost.
4. There is no "pause and resume automatically" switch beyond the above
   — this app has no separate kill switch/feature flag layer, by design
   (no unnecessary infrastructure for a V1). Steps 1–3 cover every
   realistic "stop now" need using controls that already exist.

## 17. Verified locally vs. verified against live Meta — the honest line

**Verified locally** (automated tests, run via `npm test` /
`npm run test:db`, no Meta contact):
- Webhook payload parsing against Meta's documented schema (text,
  unsupported types, reactions, statuses, malformed/oversized/multi-entry
  payloads) — `tests/whatsapp/webhook-payload.test.ts`
- GET verification logic, including Express's actual query-string
  parsing of Meta's dotted `hub.mode` params (checked empirically, not
  assumed) — `tests/whatsapp/webhook-route.test.ts`
- Signature computation correctness against a published, independent
  HMAC-SHA256 test vector (RFC 4231) — `tests/whatsapp/webhook-signature.test.ts`
- Outbound Graph API request construction (endpoint, auth header, body
  shape, digits-only recipient format, timeout, retryable-error
  classification) against mocked HTTP responses —
  `tests/messaging/messaging-providers.test.ts`
- End-to-end idempotency, concurrency, retry, rate limiting, tenant
  isolation, and failure recovery against a REAL Postgres —
  `tests/db/*.test.ts`

**NOT verified, and not claimed as verified:**
- That Meta's real webhook delivery matches these fixtures byte-for-byte
- That a real `X-Hub-Signature-256` header from Meta verifies against
  this implementation
- That `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` successfully
  authenticate against `graph.facebook.com`
- That an outbound send actually reaches a physical device
- Any real-world Meta rate-limiting, throughput restriction, or account
  quality/health behavior

**Live Meta traffic remains untested** in this environment — no
`WHATSAPP_*` credentials are configured. This document is what closes
that gap; it has not yet been executed against Meta's actual API.
