# PROJECT_CONTEXT.md

Status: **Pre-implementation.** No application code, dependencies, or credentials exist yet. This document exists to align on scope and architecture before any build work begins.

Repository state at time of writing: single `README.md`, one commit, no code, no config, no CI, no infrastructure.

---

## 1. Project Goal

Build **BahaOS WhatsApp AI Receptionist**: an AI-driven receptionist that communicates with customers over WhatsApp to handle inbound inquiries and manage appointment bookings and cancellations automatically, without requiring a human to be available in real time.

> **Assumption:** The goal is to reduce missed inquiries/bookings and staff overhead for a service-based business by automating first-line WhatsApp communication. This is inferred from the repo name and has not been confirmed by the project owner.

## 2. Intended Users

Two distinct user groups, each with different needs:

- **End customers** — people messaging the business's WhatsApp number to ask questions, book, reschedule, or cancel an appointment.
- **Business operators/staff** — the people who need visibility into bookings, the ability to override/escalate, and (likely) some configuration surface for hours, services, and policies.

> **Open question:** Is this being built for a single business (BahaOS's own business) or as a multi-tenant product intended to serve multiple client businesses? This materially changes the architecture (single-tenant vs. multi-tenant data model, auth, billing) and is not yet decided. See §14.

## 3. Core Problem We're Solving

- Businesses lose revenue and customer trust when WhatsApp messages go unanswered outside business hours or during busy periods.
- Manual booking/cancellation handling via chat is slow, error-prone (double-booking, missed cancellations), and doesn't scale with staff availability.
- Customers increasingly expect instant, conversational responses rather than phone calls or web forms.

> **Assumption:** The primary success metric is faster response time and higher booking completion rate, not lead generation or sales. Not yet confirmed.

## 4. High-Level System Architecture

Conceptual flow (no implementation decisions made yet):

```
WhatsApp Customer
      │
      ▼
WhatsApp Business Platform (Meta Cloud API or BSP)
      │  (webhook: inbound messages, status callbacks)
      ▼
Webhook Receiver / API Gateway  ──────────────► Admin/Staff Dashboard
      │                                                 │
      ▼                                                 │
Conversation Orchestrator (AI receptionist logic)        │
  - intent detection                                     │
  - conversation state / session memory                  │
  - escalation-to-human logic                             │
      │                                                 │
      ▼                                                 │
Business Logic Layer                                     │
  - booking engine (availability, conflicts, policies)   │
  - cancellation/reschedule engine                       │
      │                                                 │
      ▼                                                 │
Data Layer                                               │
  - CRM / customer records                               │
  - appointments/bookings store                          │
  - conversation/message history                          │
      │                                                 │
      ▼                                                 │
Calendar Integration (external calendar/scheduling system)
      │
      ▼
Notification/Reminder Service (outbound WhatsApp templates, reminders, confirmations)
```

> **Assumption:** This is a fairly standard "webhook → orchestrator → business logic → data store → external calendar" shape. No specific architecture (monolith vs. microservices, serverless vs. long-running server) has been chosen. See §14.

## 5. Proposed Technology Stack

**Nothing has been selected or installed.** Below are candidate options only, for discussion — not decisions.

| Layer | Candidate options |
|---|---|
| WhatsApp connectivity | Meta WhatsApp Cloud API (direct), or a BSP such as Twilio, 360dialog, or WATI |
| Backend/runtime | Node.js (TypeScript) or Python |
| AI/LLM | Claude (Anthropic) via API, given this is being built in a Claude Code environment |
| Conversation/session state | Redis or a database-backed session table |
| Primary database | PostgreSQL (relational, good fit for bookings/CRM data) |
| Calendar integration | Google Calendar API, Cal.com, or Calendly API |
| Hosting/infra | Not decided — options include a managed PaaS (Render, Railway, Fly.io) or cloud provider (AWS/GCP) |
| Admin dashboard | Not decided — could be a simple web app (Next.js) or deferred to a later phase |

> **Assumption:** These are reasonable defaults for this type of system, not commitments. Every row is an open decision. See §14.

## 6. Major Components/Services (Eventual)

- **WhatsApp Gateway Service** — sends/receives messages, handles webhook verification, media, and template messages.
- **Conversation Orchestrator** — the AI receptionist "brain": intent recognition, dialogue state, response generation.
- **Booking Engine** — availability checks, slot holds, conflict prevention, confirmation logic.
- **Cancellation/Reschedule Engine** — policy enforcement (cutoff windows, fees, etc.), calendar updates.
- **CRM/Customer Data Service** — customer profiles, contact history, preferences, consent status.
- **Calendar Sync Service** — two-way sync with external calendar/scheduling system.
- **Notification/Reminder Scheduler** — appointment reminders, confirmations, follow-ups.
- **Human Escalation/Handoff Layer** — routes conversations to a human when the AI can't handle them.
- **Admin Dashboard** (likely later phase) — staff-facing view of bookings, conversations, and configuration.
- **Auth/Access Control** — for staff/admin access; not needed for the customer-facing WhatsApp side.
- **Logging/Observability** — conversation logs, error tracking, delivery status tracking.

## 7. WhatsApp Integration Requirements

- A verified WhatsApp Business Account (Meta Business Manager) and a registered phone number.
- Webhook endpoint for inbound messages and message status callbacks (delivered/read/failed).
- Compliance with WhatsApp's 24-hour customer service window (free-form replies only within 24 hours of the customer's last message; outside that window requires pre-approved **message templates**).
- Message template creation and approval process for proactive messages (reminders, confirmations).
- Handling for text, and potentially media (images, location pins for business address), and quick-reply/button interactions.
- Opt-in/consent handling before sending any proactive/marketing-style messages.
- Rate limits and messaging tiers imposed by Meta based on account quality/history.

> **Open question:** Direct Meta Cloud API integration vs. a BSP (Twilio/360dialog/etc.)? This affects cost, setup complexity, and available features. Not decided. See §14.

## 8. AI/Receptionist Responsibilities

The AI receptionist is expected to:

- Greet customers and answer common questions (hours, location, services, pricing) — content source not yet defined (FAQ doc? structured knowledge base?).
- Determine intent: general inquiry vs. booking vs. reschedule vs. cancellation vs. complaint.
- Collect the information needed to book (service type, preferred date/time, contact details).
- Check availability and propose/confirm slots.
- Execute cancellations and reschedules according to business policy.
- Send confirmations and reminders.
- Recognize when it cannot handle a request and escalate to a human, with context handed off.
- Maintain a consistent tone/persona appropriate to the business.

> **Open question:** What is the business's tone/brand voice, and what languages must be supported? Not yet defined. See §14.

## 9. Booking and Cancellation Requirements

Requirements gathering is incomplete. Known unknowns to resolve before implementation:

- What exactly is being booked — appointments, tables, rooms, service slots? (Depends on the business type, which is not yet specified.)
- Source of truth for availability — a specific calendar system, or a custom scheduling database?
- Cancellation policy — cutoff windows, fees, no-show handling.
- Double-booking prevention strategy (locking/holds during the booking conversation).
- Timezone handling (single timezone vs. multi-location).
- Buffer time between appointments, per-service duration rules.
- Confirmation and reminder timing (e.g., 24h and 1h before).
- Who can override/manually adjust bookings, and how.

> **Assumption:** None of the above should be assumed — this section is intentionally left as open questions rather than guessed defaults. See §14.

## 10. CRM/Database Integration Requirements

- Customer profile data: name, phone number (WhatsApp ID), contact history, preferences, consent/opt-in status.
- Appointment/booking history per customer.
- Full conversation/message history for context continuity and auditability.
- Whether this integrates with an **existing** CRM/booking system the business already uses, or whether the CRM is being built from scratch as part of this project.
- Data retention policy — how long conversation and customer data are kept.
- Export/reporting needs for business owners.

> **Open question:** Does the business already use a CRM, calendar, or booking tool that needs to be integrated with, or is this greenfield? Unknown — critical to resolve before choosing a data architecture. See §14.

## 11. Security Considerations

To be addressed during design, before any credentials or code are introduced:

- **Webhook signature verification** — validate that inbound webhook calls genuinely originate from Meta/the WhatsApp provider (e.g., `X-Hub-Signature-256`).
- **Secrets management** — API tokens and keys must never be committed to the repo; use environment variables and a secrets manager appropriate to the hosting platform.
- **PII handling** — customer names, phone numbers, and conversation content are personal data; encryption at rest and in transit is required.
- **Access control** — staff/admin dashboard access must be authenticated and authorized; principle of least privilege for any internal tooling.
- **Rate limiting/abuse prevention** — protect the webhook endpoint and AI layer from spam or abuse (e.g., prompt injection attempts via customer messages, flooding).
- **Prompt injection awareness** — since the AI reads free-form customer messages, the system prompt/business logic must not treat customer message content as trusted instructions (e.g., a customer should not be able to talk the AI into cancelling other customers' bookings or revealing internal data).
- **Compliance** — data protection regulations relevant to the business's operating region (e.g., GDPR if serving EU customers) need to be identified. Not yet determined.
- **Audit logging** — bookings/cancellations made or modified by the AI should be logged with enough detail to investigate disputes.

> **Assumption:** None of these are implemented yet; this is a checklist for design/implementation phases, not a statement of current state.

## 12. Environment Variables/Secrets We Will Eventually Need

**No credentials exist yet. Nothing listed here has been created, requested, or stored.** This is a forward-looking inventory only, to be filled in during implementation:

| Variable (placeholder name) | Purpose |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Auth token for WhatsApp Cloud API / BSP |
| `WHATSAPP_PHONE_NUMBER_ID` | Sending phone number identifier |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Token used during webhook subscription handshake |
| `WHATSAPP_APP_SECRET` | Used to verify inbound webhook signatures |
| `ANTHROPIC_API_KEY` (or chosen LLM provider key) | AI/LLM access |
| `DATABASE_URL` | Primary database connection string |
| `CALENDAR_API_CLIENT_ID` / `CALENDAR_API_CLIENT_SECRET` | Calendar provider OAuth credentials |
| `ADMIN_SESSION_SECRET` | Session/auth signing secret for admin dashboard |
| `NOTIFICATION_PROVIDER_KEY` | If a separate service is used for reminders/SMS fallback |

> Exact names/providers depend on decisions in §5, §7, and §10 — this list will change once those are resolved.

## 13. Development Phases (Proposed)

> **Assumption:** This phasing is a reasonable default sequence, not an agreed plan. Open for revision once the open questions in §14 are answered.

- **Phase 0 — Discovery & Context (this document).** Confirm scope, users, and architecture direction.
- **Phase 1 — WhatsApp Connectivity Skeleton.** Webhook receiver, message send/receive round-trip, no AI logic yet.
- **Phase 2 — Conversation Engine.** AI-driven intent detection and free-form Q&A over static business info.
- **Phase 3 — Booking Engine.** Availability checks, slot booking, calendar integration.
- **Phase 4 — Cancellation/Reschedule Flows.** Policy enforcement, calendar updates.
- **Phase 5 — CRM/Data Layer Hardening.** Customer records, history, reporting.
- **Phase 6 — Notifications/Reminders.** Proactive confirmation and reminder messages via approved templates.
- **Phase 7 — Admin Dashboard.** Staff-facing visibility and manual override tools.
- **Phase 8 — Security Review & Hardening.** Before any production/live traffic.
- **Phase 9 — Launch & Monitoring.**

## 14. Open Questions Requiring Decisions Before Implementation

These must be answered before writing application code — implementation should not proceed on assumed answers:

1. **Single business vs. multi-tenant product?** Is this for one specific business, or a product meant to serve multiple client businesses (BahaOS as a SaaS vendor)?
2. **What business/industry?** (Salon, clinic, restaurant, consultancy, etc.) This drives what "booking" even means (appointment vs. table vs. service slot).
3. **WhatsApp provider:** Meta Cloud API direct, or a BSP (Twilio, 360dialog, WATI, etc.)? Cost/complexity tradeoffs need a decision.
4. **LLM/AI provider:** Confirm Claude (Anthropic) as the intended model provider, and which model tier.
5. **Calendar/scheduling system:** Google Calendar, Cal.com, Calendly, a custom-built scheduler, or an existing tool the business already uses?
6. **Existing CRM/booking tools:** Does the business already have systems in place that need integration, or is this greenfield?
7. **Hosting/infrastructure preference:** Cloud provider, PaaS, or self-hosted? Any existing infra to align with?
8. **Human escalation process:** Who receives escalated conversations, and how (another WhatsApp number, email, internal tool)?
9. **Languages required:** English only, or multilingual support needed?
10. **Business hours/timezone(s):** Single location/timezone, or multi-location?
11. **Cancellation policy specifics:** Cutoff windows, fees, no-show handling.
12. **Compliance/regulatory requirements:** Data protection regime(s) applicable (e.g., GDPR, local equivalents) based on where customers are located.
13. **Budget/cost constraints:** For WhatsApp messaging fees, LLM usage, hosting — none specified yet.
14. **Admin dashboard scope and timing:** Required from day one, or can it be deferred past MVP?
15. **Payment processing:** Does booking/cancellation involve deposits or payments, requiring a payment provider integration?
16. **Branding/tone:** What persona/voice should the AI receptionist have?

---

*This document should be revisited and updated as decisions are made — it is a living reference, not a frozen spec.*
