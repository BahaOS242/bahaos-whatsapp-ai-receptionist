# WhatsApp AI Receptionist — Portfolio Demo

A working, front-end-only demo of an AI receptionist for WhatsApp-style business
messaging. Modeled here on a fictional dental clinic ("BrightSmile Dental"), but
built so the conversation logic is portable to any appointment-based business.

**This is a portfolio demonstration, not a production system.** No real
WhatsApp messages, appointments, or leads are created — see
[What's real vs. simulated](#whats-real-vs-simulated) below.

## What it does

- Greets visitors and answers FAQs (hours, location, pricing, insurance,
  payment options, new-patient info, emergency visits) from a hardcoded
  business-knowledge object.
- Explains services and pricing.
- Walks a visitor through booking an appointment (service → date → time →
  name → phone), remembering anything already provided so it never re-asks.
- Handles reschedule and cancellation requests.
- Detects likely leads and "captures" them (in memory only).
- Recognizes when to escalate to a human instead of guessing.
- Shows a "Behind the scenes" panel with the live conversation state, so a
  technical reviewer can see exactly what the engine is tracking.

## Architecture

The project intentionally separates concerns so real integrations can be
swapped in later without touching the conversation logic:

```
index.html        Portfolio page: hero, capability flow, architecture
                   diagram, economics section, and the phone/chat frame.

js/engine.js       The "brain" — a framework-free intent matcher and
                   stage-based state machine (ReceptionistEngine). Has
                   zero DOM dependencies, so it's unit-testable and
                   reusable behind a real webhook later.

js/chat.js         The UI layer — renders messages, typing indicator,
                   quick-reply chips, and the state panel. Talks to the
                   engine only through handleMessage() / getStateSnapshot().

css/styles.css     All styling and design tokens (CSS custom properties
                   at the top of the file).
```

Target production architecture (not built yet):

```
WhatsApp Cloud API → Webhook/API → AI Agent → Business Knowledge
                                            → Business Actions → CRM / Booking / Notifications
```

In this demo, `AI Agent`, `Business Knowledge`, and `Business Actions` are
implemented (as `ReceptionistEngine`, `BUSINESS_KNOWLEDGE`, and the simulated
confirmations respectively). The WhatsApp Cloud API webhook, calendar, and
CRM integrations are not built — `engine.js` is structured so each one can
replace a stubbed step without changing the others.

## What's real vs. simulated

| Real today | Simulated today |
|---|---|
| Conversation logic, intent detection, state machine | WhatsApp message delivery |
| "Memory" within a conversation (won't re-ask known info) | Appointment creation (no calendar write) |
| UI states: typing indicator, quick replies, loading | Cancellations / reschedules (no real record changed) |
| | Lead storage (kept in browser memory only) |

## Local setup

No build step or dependencies — it's static HTML/CSS/JS using ES modules.

```bash
# from the project folder
python3 -m http.server 8080
# then open http://localhost:8080
```

(Opening `index.html` directly via `file://` will not work because ES module
imports require an HTTP server.)

## Environment variables

None yet. A `.env.example` is included as a placeholder for when a real LLM
provider or WhatsApp Cloud API key is introduced — never commit real keys.

## Embedding in a portfolio site (e.g. Headless Wix)

The whole page is self-contained static output, so it can be:
- Linked to directly as a standalone page, or
- Embedded via an `<iframe>` pointing at the hosted `index.html`.

If iframing, give the iframe a fixed height of at least `900px` on desktop
(the phone mockup plus supporting sections) and allow it to scroll.

## Demo limitations

- Intent detection is keyword-based, not a real LLM — good enough to
  demonstrate the product experience and architecture, not production NLU.
- Date/time parsing is intentionally simple ("tomorrow", "Friday", "2pm")
  rather than a full calendar-aware parser.
- Single conversation/session only; state resets on page reload.

## What's next for production

1. Real WhatsApp Cloud API webhook receiving/sending messages.
2. Swap the keyword matcher in `engine.js` for an LLM call (e.g. Claude),
   keeping the same `handleMessage()` interface.
3. Replace simulated booking/cancel/reschedule with real Google
   Calendar / booking-system writes.
4. Persist leads and conversation history to a real database.
5. Add human hand-off (Slack/email notification) on escalation.
6. Multi-tenant config so `BUSINESS_KNOWLEDGE` loads per business instead of
   being hardcoded.
