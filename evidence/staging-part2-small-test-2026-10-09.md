# Staging Part 2 — small initial test (deploy, webhook security, one booking) — 2026-10-09

Target: Render **free** web service `bahaos-whatsapp-ai-receptionist` (Oregon) on the verified staging database; Meta test number (+1 555 643 6134) in a **restricted** Meta business account. Deployed commits: `3a8561c` (first), then `9113880` (adds secret-free webhook logging). Anthropic Haiku 4.5; no spend recorded beyond a few dozen turns (well inside the $5 organisation limit). No production access; no paid Render/Meta resources.

## Result: PASS for the application path, with Meta-side blockers
| Check | Result |
|---|---|
| `GET /health` | 200 `status: ok` |
| Webhook verification with a wrong token | 403 |
| Unsigned webhook POST | 401 (also after the secret was restored) |
| Meta-signed real delivery with the app secret set | accepted and processed (signature verified in production conditions) |
| One booking conversation from the owner's phone | after the app's own confirmation summary and a separate "yes": **exactly one** appointment — Routine cleaning, 2026-10-13 14:00 Nassau, `booked`, customer "Trevor"; conversation state `bookingJustCompleted`; no duplicate |
| Backend in use | database tools (no `[simulated tool]` line after the fix) |
| Replies to a recipient not on Meta's allowed list | outbox `dead_letter` after 1 attempt, `meta_131030` (no retry storm) |

## Findings (ordered by importance for a pilot)
1. **Meta business restriction (not code).** The Business Manager is restricted ("verify your business", error 131031 "Business Account locked" on template sends). Replies are **accepted by Meta's API (outbox `sent`) but were never received on the phone.** Needs the owner's decision on Meta business verification/appeal. Real delivery to customers is unproven.
2. **Outbox `sent` ≠ delivered.** Delivery/status webhooks (`statuses`, e.g. failed) arrive as "0 message(s)" deliveries and are ignored by the app. Pilot-relevant gap.
3. **Setup gap: the WhatsApp account was not subscribed to the app.** `GET /{waba}/subscribed_apps` listed only Meta's own test-events app, so real messages never reached us. Fixed with `POST /{waba}/subscribed_apps` (now a step in the setup checklist).
4. **`DB_BOOKING_ENABLED` was missing on Render**, so the app silently used in-memory demo booking tools: it replied "request captured" but stored nothing (appointments = 0). Fixed by setting it to `true`. Follow-up: log the active booking backend at startup and refuse/loudly warn when production uses demo tools.
5. **A bad webhook signature was invisible** (401, no log). Added secret-free logging in `9113880` (+ test). The app secret and access token had also been mis-copied once each (a 17-character account ID pasted as a token).
6. **Out-of-order name dropped:** "Trevor 2428012847" before a date stored the phone but not the name (known limitation); the model then wrote a confirmation-style message the app did not back. The app correctly refused to book without a name and asked for it. Follow-up: guard against model-written confirmation prose when the app has not armed a confirmation.
7. **Dependency audit** during the Render build: 8 vulnerabilities (5 moderate, 2 high, 1 critical) — review before a pilot.
8. Autocorrect changed "Tuesday" to "Trevor" once; the bot asked for the date (safe).

## Not covered
S4 corrections, S5 duplicate replay, S6 ambiguous times, S7 takeover, S8 real delivery limits, S9–S12; real customer delivery; Meta business verification. The free web service sleeps when idle; the free database expires 2026-11-08.

State left behind: the app secret is set again; one simulated test customer (`+1 242 555 0100`) has an unfinished conversation; the owner's laptop IP is still on the database allow-list (remove after testing); the owner's temporary Meta token should be revoked.
