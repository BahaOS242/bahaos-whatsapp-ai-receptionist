# Focused fix plan — staging findings (PLAN ONLY; nothing implemented)

Scope approved for planning: delivery receipts, booking-backend startup safeguards, app-controlled confirmation prompts, dependency triage. **Out of scope:** the out-of-order name gap (finding 5) and the Meta restriction (owner action). PR #2 stays draft. No deploy, paid call, database change, merge or Phase 6 without a new approval.

**Rules for every item below:** free tests first (write the failing test, show it fails without the change, then implement); each item is its own commit; run the whole free suite (unit, DB on the disposable local database, lint/tsc/build, fallback eval, `tests/live-eval`) after each; staging evidence files are preserved as they are. **Real WhatsApp delivery to a customer phone is BLOCKED by the Meta business restriction. It is not passed, and none of the work below changes that.**

## 1. Delivery receipts (finding 2 — outbox `sent` ≠ delivered)
**Observed shape (staging):** after each reply Meta posts a `messages`-field delivery with `statuses: [{ id: <wamid>, status: "failed", timestamp, recipient_id, errors: [{ code: 131031, title, message, error_data: { details } }] }]`; today the parser yields 0 messages and ignores it.
**Design (small, additive):**
- `src/whatsapp/webhook-payload.ts`: also parse `statuses[]` into `{providerMessageId, status ∈ sent|delivered|read|failed, timestamp, recipient, error?{code,title}}`. Never throws; unknown statuses ignored.
- New migration **0013** (additive, nullable; applied only on the disposable local DB in tests): `outbox_messages.delivery_status` (`unknown`→`delivered`→`read`, or `failed`), `delivered_at`, `delivery_error_code`, `delivery_error_title`. Match by `provider_message_id` **and** tenant; unknown id → ignored and counted in a log line; duplicate/out-of-order receipts are monotonic (`read` never regresses to `delivered`; `failed` recorded with its code and not overwritten by a later `sent`).
- Receipts are handled only after the existing signature and `phone_number_id` checks, inside the existing idempotent webhook path; they enqueue **no** AI call and **no** reply. A failed receipt is surfaced to staff (inbox badge "not delivered: <code>") and logged; no automatic resend (policy decision for the owner).
**Free tests first:** parser unit tests from sanitised captured payloads (sent/delivered/read/failed/unknown/malformed); DB tests for matching, tenant isolation, out-of-order and duplicate receipts, unknown id; route test with a signed receipt (200, no reply queued, no LLM call); inbox presentation test; migration test on a fresh database and on the existing 13-migration state.
**Acceptance:** a `failed` receipt for a `sent` row is visible as "not delivered" with its Meta code; no behaviour change for message handling.

## 2. Booking-backend startup safeguards (finding 3)
**Design:**
- New pure function `resolveRuntimeProfile(env)` returning `{ aiProvider, bookingBackend: database|clinic_simulator|google_calendar|demo_in_memory, messaging: whatsapp|mock, flags }` (no secrets). `server.ts` logs it once at startup ("bookingBackend=database messaging=whatsapp ai=anthropic").
- **Production guard:** when `NODE_ENV=production` and the backend would be `demo_in_memory`, or WhatsApp inbound is configured while messaging is `mock`, startup **fails with a clear message** unless `ALLOW_DEMO_TOOLS_IN_PRODUCTION=true` is set explicitly. (Staging on Render runs `NODE_ENV=production`, so the exact mistake we made would have been caught at deploy.)
**Free tests first:** table-driven unit tests for every env combination (including `DB_BOOKING_ENABLED` unset/false/true, simulator flag, Google vars, token present/absent); guard tests (throws / warns / override); a boot test through `createApp` showing no secrets in the profile string.
**Acceptance:** the staging mistake (production + missing `DB_BOOKING_ENABLED`) fails fast; local dev and tests unchanged.

## 3. App-controlled confirmation prompts (finding 4)
**Problem:** with the name missing, the model wrote "I have you down… Reply YES to confirm" itself; the app (correctly) refused to book on "yes".
**Design (LLM path only, `llm-provider.ts`):** a conservative detector `looksLikeConfirmationPrompt(text)` (YES/confirm/book combinations, e.g. "reply yes", "shall I book", "confirm the booking", "I have you down for"). Rules on every turn without a completing action:
  - if `pendingAction` is **not** armed → discard the model text and use the app's deterministic next-field question (`fallbackReplyForEmptyContent`);
  - if `pendingAction` **is** armed → the reply is always the app's `composeConfirmationPrompt` when the model text looks like a confirmation prompt (so the words always match the stored state); other model text (FAQ answers etc.) is untouched.
**Free tests first (scripted LLM, adversarial):** model emits a confirmation prompt with the name missing → reply is "Could I get your name?" and no state change; armed + model emits a different time → reply is the app's summary; benign texts containing "confirm" ("we'll confirm by email") are untouched; booking still requires the app's own prompt + separate "yes" (reuse the time-clarification tests). Add fallback-provider parity check (it never had model prose).
**Acceptance:** a customer can never see "Reply YES" unless the app has armed a confirmation for exactly the values shown.

## 4. Dependency triage (`npm audit`, 8 findings)
Checked 2026-10-09 with `npm audit --omit=dev` (production only) and `npm audit`. **Production dependencies (3):**
| Package | Severity | Reached via | Reachable in this app? | Plan |
|---|---|---|---|---|
| `proxy-addr` 2.0.7 | critical | `express` | Only matters when `trust proxy` is configured with subnets and client IPs are used. This app sets no `trust proxy` and never reads `req.ip`/`x-forwarded-for` (grep-verified). **Not exploitable today** | patch via `npm audit fix` |
| `qs` 6.15.3 | moderate | `express`/`body-parser`, `googleapis-common` | Crafted query strings/bracket keys (DoS). Express 5 uses the simple parser by default and the app takes JSON bodies; low | patch |
| `brace-expansion` (in `glob`) | high | `googleapis` → `gaxios` → `rimraf` → `glob` → `minimatch` | Only loaded for the optional Google Calendar client (unused on staging); patterns are not attacker-controlled | patch |
**Development tools only (5):** `esbuild` (dev-server request issue; no dev server runs), `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader` and `drizzle-kit` (migration CLI; chain above), `source-map-js` (high; stylesheet/source-map parsing in test tooling). They affect developer machines and the build image, not request handling.
**Actions (each its own commit, lockfile only where possible):** (a) `npm audit fix` (non-breaking; **never `--force`**), then the whole free suite; (b) for anything left, bump `drizzle-kit` within its minor and re-run the migration tests; (c) on Render change the build to `npm ci --include=dev && npm run build && npm prune --omit=dev` so dev tools are not on the running service; (d) re-run `npm audit` and record the result. Dev-only residue may be accepted with a written reason.

## 5. Order, approvals and evidence
1. Dependencies (a)–(b) and the prune build line (lowest risk) → 2. startup safeguards → 3. confirmation prompts → 4. delivery receipts (largest; needs migration 0013).
**Needs a separate approval each:** applying migration 0013 to the staging database (a database change), any redeploy, any staging re-run, any paid AI call. After deploy, the S3–S8 staging sequence is re-run **only** with that approval; **S8 real delivery stays BLOCKED until Meta lifts the restriction.**
**Evidence is preserved:** `evidence/staging-part1-…`, `staging-part2-…` and the live-run JSONs are not edited except for status labels.

## 6. Owner-side items (not code)
- Meta business restriction / verification — guided separately, one step at a time, no workarounds.
- Remove temporary access after testing: delete the laptop IP rule on the Render database; remove `WHATSAPP_ACCESS_TOKEN`'s temporary value when finished (Meta temporary tokens expire in under 24 hours and no revoke button is documented); `unset` the Terminal variables; delete the old backup dumps when no longer needed.
