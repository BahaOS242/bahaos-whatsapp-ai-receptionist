# Local browser test chat (free simulation, optional live Haiku)

A minimal page for personally trying BahaOS without Terminal. **Local development only.**

```bash
npm run chat:web        # then open http://127.0.0.1:3100   (LOCAL_CHAT_PORT changes the port)
```

**What it is:** the real `ReceptionistAgent` + `ConversationManager` (the same logic as `npm run chat` and the webhook) with the **rule-based fallback provider** and the **in-memory simulated booking tools**. Each conversation has its own agent, tools and state; "New conversation" starts a clean one. The page shows the history, a "Free simulation" label and, under "What the app has stored", the booking state and any booking actions.

**What it is not:** it never calls an AI API, the database, Google Calendar or WhatsApp, reads no `.env` or credentials, and keeps nothing after the server stops. It tests the application's own logic (extraction, corrections, confirmation gate, ambiguous-time clarification), **not** real Haiku understanding and **not** WhatsApp delivery.

**Why it cannot reach staging or production** (all covered by `tests/local-chat/`):
- lives under `scripts/`, never imported from `src/`, not mounted in `createApp`/`server.ts`, and **not compiled into `dist/`** (the build only includes `src/`);
- refuses to start when `NODE_ENV=production` or a hosting-platform variable (Render, Railway, Heroku, Fly, Vercel, Kubernetes, Cloud Run, AWS) is present;
- listens on `127.0.0.1` only; requests with a non-loopback `Host` header get 403 (DNS-rebinding defence); cross-site `POST`s (foreign `Origin`) and non-JSON bodies are refused (CSRF defence); strict CSP; message text is rendered as text, never HTML;
- bounded: 500-character messages, 10 KB bodies, 50 conversations (oldest evicted).
Unrelated to any dynamic conversational UI work.

## Optional: Live Haiku / simulated bookings (real model calls, budget-limited)

```bash
npm run chat:web:live   # same page; a mode selector appears. Free simulation stays the default.
```
- **Opt-in only.** Only `chat:web:live` (`LOCAL_CHAT_LIVE=1`) reads the Anthropic key, and only that one variable: from the process environment, or by parsing the git-ignored `.env` (nothing is exported, no other value is read or kept). The key lives in one server closure: never in a response, a page asset or a log line (errors are redacted; tests scan every response and log line).
- **Bookings stay simulated.** The model drives the replies; every booking action still runs on the in-memory simulated tools. No database, Google Calendar or WhatsApp.
- **$1.00 per server session, enforced server-side** with the mechanism of the approved live evaluation (`scripts/live-eval`): an authoritative `count_tokens` before every request, the **full 1024-token output reserved**, refusal when `spent + worst case` would pass 95% of the budget, and a **halt** on unknown usage, a missing token count, a billed-input mismatch or any failed request (charged at the reserved worst case, never retried; SDK retries are off). One global gate serialises every live call, so several tabs cannot overspend. The page cannot change the budget; `LOCAL_CHAT_BUDGET_USD` can only lower it, never above $1.
- **Labelled and metered.** The badge reads "Live Haiku / simulated bookings"; the page shows the estimated session spend, remaining budget and call count. These are **estimates** (reported usage x a price snapshot), not billing receipts. The Anthropic organisation's own monthly limit still applies as a backstop.
- **Switching modes always starts a fresh conversation**; conversations never share state or tools. After a halt, live sends nothing more until the server is restarted; Free simulation keeps working.

