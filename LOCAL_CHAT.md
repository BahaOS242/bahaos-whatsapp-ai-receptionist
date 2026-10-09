# Local browser test chat (free simulation)

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
