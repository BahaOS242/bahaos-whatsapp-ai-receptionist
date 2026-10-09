# Human Handoff & Staff Inbox (Phase 3)

A staff member can take over a customer conversation; while a human owns it the AI sends **nothing**.

## Ownership states

Persisted in `conversations.status` (enum `conversation_status`):

| Product name | DB value | Meaning | AI replies? |
|---|---|---|---|
| AI_ACTIVE | `ai_active` | AI handles the customer | yes |
| HUMAN_PENDING | `human_pending` | handoff requested (AI escalation / unsupported message); waiting for staff | **no** |
| HUMAN_ACTIVE | `staff_owned` | a staff member owns it (`assigned_staff_user_id`) | **no** |
| CLOSED | `resolved` | finished | n/a — see below |

Transitions (all in `src/inbox/ownership.ts`; rules live in `src/inbox/permissions.ts`, the single source used by the server **and** to disable UI buttons):

- AI escalation: `ai_active → human_pending` (the only transition the AI can make; it can never overwrite a human/closed state).
- **accept**: `human_pending → staff_owned` (actor becomes owner).
- **takeover**: `ai_active | human_pending → staff_owned`; from another staff member's ownership, **admin only**.
- **assign**: admin → anyone in the tenant; staff → themselves only. Result is `staff_owned`. Not allowed on closed.
- **release** (return to AI): `human_pending | staff_owned → ai_active` (owner or admin; any staff for a pending one).
- **close**: any non-closed state → `resolved` (owner/admin if owned).
- **reopen**: `resolved → staff_owned`, reopening staff member owns it. AI stays off until released. Refused if the customer already has another open conversation.
- A customer message to a **closed** conversation starts a fresh AI conversation (existing behaviour); staff may instead reopen the old one.

Every transition runs in one transaction under the conversation row lock, is tenant-scoped, optionally rejects a stale `expectedVersion` (`ownership_version`), and writes an append-only `audit_events` row (also for refusals; ids/states/reasons only — never message bodies).

## How the AI is kept silent

1. **Inbound gate** (`webhook-processing.ts`): if the conversation is human-owned, the customer's message is persisted (dedupe by WhatsApp id still applies), `last_activity_at`/`waiting_since` are updated, **no LLM call, no reply, no outbox row**. The webhook still answers 200 (the message is safely stored; Meta must not redeliver).
2. **Race gate**: an AI turn that began before a takeover re-reads ownership under the *same row lock* (`FOR NO KEY UPDATE`) immediately before enqueueing. If a human took over meanwhile, the generated reply is stored as `suppressed` (excluded from future LLM history) and **never queued**. The gate also compares `ownership_version` with the value read when the turn started, so a takeover **and** release during the model call (a round trip back to `ai_active`) is detected too. Staff transitions take the same lock but not the per-customer advisory lock, so the UI never waits on LLM latency.
3. **Already-queued AI replies**: takeover/accept/assign/close **withdraw** unsent (`pending`/`retry_wait`) AI-origin outbox rows (`cancelled`). The worker additionally never claims an AI-origin row for a `staff_owned` conversation, re-checks right before sending, and sweeps stranded AI rows (including a `processing` row whose worker died) so they cannot block staff replies queued behind them.
   **Truthfulness:** a withdrawn row that had earlier send attempts (timeout, 5xx, crashed worker) may in fact have reached WhatsApp. It is still cancelled, but the inbox shows *"Withdrawn — an earlier attempt may have been delivered"* (`error_metadata.withdrawn.priorAttempts`) instead of *not sent*. Delivery remains **at-least-once**; nothing here claims exactly-once.
4. **Unavoidable boundary**: a message already handed to WhatsApp (`processing` and past the pre-send check, or `sent`) cannot be recalled. This is at most one in-flight AI message at the instant of takeover.
5. The AI's own escalation reply in the *same turn* that creates `human_pending` is the customer-facing handoff acknowledgement and is allowed.

## Staff replies

`POST /api/inbox/conversations/:id/reply {body, clientMessageId}` → `sendStaffReply`: authenticated, tenant-checked, requires `staff_owned` and (owner or admin); in **one transaction** inserts the `messages` row (`sender_type=staff`, `author_staff_user_id`) and the outbox row (`origin=staff`), under the conversation lock. Delivery then uses the existing durable outbox (retries, ordering, dead-letter). Idempotency key `staff:<conversation>:<clientMessageId>`: a double-submit yields one message (HTTP 200 `deduplicated`); the same id with different text is a 409 conflict. 202 means *accepted into the outbox*, not delivered — the UI shows the real state (Queued / Sending / Retrying / Sent / Failed to send / Withdrawn) from the outbox row. A failed staff message offers **Retry** (`requeueDeadLetter`, same logical message) to the owner/admin.

## Inbox UI & API

- UI: `/inbox` (dependency-free static ES modules in `public/inbox/`, strict CSP, all dynamic text escaped). Polls every 5 s while the tab is visible (no push/paid services); polling stops on sign-out/page hide.
- API (`/api/inbox`, `Cache-Control: no-store`): `POST /login`, `POST /logout`, `GET /me`, `GET /staff`, `GET /conversations?filter=all|pending|human|ai|closed&q=`, `GET /conversations/:id`, `POST /conversations/:id/{accept,takeover,assign,release,close,reopen,reply}`, `POST /conversations/:id/messages/:messageId/retry`.
- Search covers customer name, phone and message text of the actor's tenant only (`ILIKE`, wildcards escaped).
- Action buttons are disabled from the server-provided `allowedActions`; the UI re-fetches after every action and never shows success before the server confirms.

## Auth & tenant isolation

Staff log in with tenant slug + email + password (scrypt). Opaque 256-bit bearer tokens; only the SHA-256 is stored (`staff_sessions`), 12 h TTL, revocable, 5 failures → 5 min lockout, indistinguishable login failures (constant-work dummy hash). The tenant comes **only** from the session; every query filters `tenant_id`. A conversation id from another tenant behaves exactly like a nonexistent one (404). Create users with:

```bash
STAFF_PASSWORD='<>=10 chars' npx tsx scripts/staff.ts <tenant-slug> <email> "<Name>" admin|staff
```
(Omit `STAFF_PASSWORD` to have one generated and printed once.) The bearer token is kept in `sessionStorage`; serve `/inbox` over HTTPS only.

## Operations

- Upgrade path: `0008` cuts legacy `retry_pending` messages over into the outbox (idempotent, per-conversation order kept); `0010` backfills `last_activity_at` from each conversation's latest message. Verified on a disposable database seeded with pre-Phase-2 data (see the release audit).
- Migration `drizzle/0010_human_inbox.sql` adds enum values/columns/`staff_sessions`. New enum values can't be used in the same migration transaction, so no data update is included. **Legacy rows** with `status='staff_owned'` and no assignee remain human-owned (AI stays off) but unassigned — staff can `accept`/`assign` them; to normalise run: `UPDATE conversations SET status='human_pending', waiting_since=now() WHERE status='staff_owned' AND assigned_staff_user_id IS NULL;`
- Find stuck work: `human_pending` conversations with old `waiting_since` (the inbox sorts waiting first).

## Security notes

- Login lockout is per account, counted atomically (parallel guesses cannot dodge it). There is **no per-IP throttle**: put one at the proxy/WAF. A lockout also lets someone lock a known account for 5 minutes.
- No CSRF surface: auth is an `Authorization: Bearer` header, never a cookie, and no CORS headers are sent. XSS is the real risk; the UI escapes all dynamic text and the CSP forbids inline script/style.
- HTTPS is **environment-dependent**: the app sends HSTS on `/inbox` but cannot enforce TLS itself. Terminate TLS at the proxy; never expose `/api/inbox` over plain HTTP.
- Unexpected server errors are logged with `console.error`; database errors can include query parameters (customer/staff message text). Restrict log access accordingly.

## Known limitations

- Release-to-AI does not auto-answer customer messages received while a human owned the conversation; the AI answers the next inbound message.
- Polling latency up to 5 s; no push notifications.
- Staff-reply text only (no media/templates); outside WhatsApp's 24 h window the provider may reject the send — shown as *Failed to send* with the provider error.
- Roles are `admin`/`staff` only; no per-team routing.
- One in-flight AI message at the instant of takeover cannot be recalled (see above).
