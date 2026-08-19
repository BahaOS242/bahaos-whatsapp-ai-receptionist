# BahaOS WhatsApp AI Receptionist — MVP Implementation Plan

Status: **Planning only.** This plan authorizes no application code, dependency installation, credentials, API connection, or deployment by itself. Development begins only after explicit approval.

## MVP Outcome

Deliver a demo-ready, multi-tenant WhatsApp AI receptionist for dental practices, initially configured for Bahamas Dental Service. It will receive WhatsApp messages, converse in English, Spanish, or Haitian Creole, answer approved practice FAQs, create and manage dental appointments through Google Calendar, maintain a simple CRM, and hand complex or clinical requests to staff while remaining available 24/7.

## Approved Baseline

| Area | Decision |
|---|---|
| WhatsApp | Official Meta WhatsApp Cloud API |
| AI | OpenAI API; exact model selected at implementation start |
| Scheduling | Google Calendar, source of truth for availability |
| Database | PostgreSQL, proposed pending implementation approval |
| Hosting | Railway |
| CRM | Simple internal customer, appointment, and conversation records |
| Handoff | Staff dashboard inbox plus email notification |
| Demo tenant | Bahamas Dental Service, `America/Nassau` |
| Demo scheduling setup | One practice calendar; 30-minute buffer after every appointment |
| Reminder cadence | Night before, day of, and one hour before; exact night-before/day-of send times pending |
| Lead follow-up | Recontact an unconverted lead five days after their last inquiry, subject to consent and WhatsApp template rules |

## MVP Scope

Included:

- Multi-tenant data isolation for practices.
- WhatsApp inbound webhooks, verified before processing.
- AI conversation flows for FAQs, booking, cancellation, rescheduling, and handoff.
- English, Spanish, and Haitian Creole responses.
- Calendar availability lookup and appointment creation in Google Calendar.
- Consultation (30 min), cleaning (60 min), and check-up (30 min) booking flows.
- Cancellation before the two-hour cutoff.
- Customer, booking, and conversation records in an internal CRM.
- Staff inbox, email alert, and manual takeover/return-to-AI controls.
- Basic confirmation and cancellation messages.

Excluded from MVP:

- Payments, deposits, insurance, and billing.
- Medical diagnosis, treatment advice, and clinical triage beyond approved safe handoff language.
- External CRM integrations.
- Automated booking of emergency appointments.
- SaaS billing, self-service tenant signup, and advanced analytics.

## Proposed Implementation Sequence

### Phase 1 — Technical Foundation

Create the approved project structure, TypeScript backend/web application, database schema/migrations, environment-variable validation, local development configuration, and baseline tests.

Acceptance criteria:

- The service starts locally with only documented placeholder configuration.
- Secrets are excluded from version control.
- Database migrations create the required tenant-aware tables.
- Automated formatting, linting, and test commands run successfully.

### Phase 2 — Tenant, CRM, and Staff Access

Implement tenant-aware records for practices, staff users, customers, conversations, messages, services, and appointments. Add staff authentication and scoped access so one practice cannot access another practice's data.

Acceptance criteria:

- Bahamas Dental Service can be configured as a demo tenant.
- A customer is uniquely associated with a tenant and WhatsApp identity.
- Staff can view only their tenant’s data.
- Appointment changes retain an audit trail.

### Phase 3 — Meta WhatsApp Integration

Implement Meta webhook verification, webhook signature validation, inbound message normalization, outbound text replies, message-status tracking, duplicate-event protection, and observability.

Acceptance criteria:

- Meta webhook verification completes using configured values.
- A signed inbound test message creates a conversation/message record and produces one outbound reply.
- Replayed webhook events do not duplicate messages, bookings, or notifications.
- Tokens and message content are not written to unsafe logs.

### Phase 4 — AI Receptionist and Safety Controls

Implement the conversation orchestrator, language detection/response selection, approved FAQ retrieval, intent classification, structured information collection, and safe escalation rules. The AI must call server-side booking tools rather than invent booking outcomes.

Acceptance criteria:

- The assistant responds in the customer’s supported language.
- It accurately answers approved demo FAQ content for hours, address, services, and placeholder prices.
- It never gives diagnosis, treatment recommendations, or unapproved emergency advice.
- Clinical, emergency, complaint, low-confidence, and explicit-human requests become staff handoffs with context.
- A demo handoff sends the approved generic acknowledgement without promising a specific response time.

### Phase 5 — Google Calendar Booking Engine

Connect the tenant’s calendar, read availability, enforce service duration and business hours, hold/confirm a chosen slot, write the calendar event, and save the internal appointment record. Implement concurrency protection to prevent double booking.

Acceptance criteria:

- Available slots respect the practice timezone and 9 AM–5 PM hours.
- A confirmed appointment exists exactly once in both internal records and Google Calendar.
- Concurrent requests cannot reserve the same time.
- Consultation, cleaning, and check-up flows use their approved durations.
- A 30-minute buffer is enforced after every confirmed appointment.
- Emergency requests do not auto-book and instead hand off.

### Phase 6 — Cancellation, Rescheduling, and Notifications

Implement cancellation and rescheduling flows, including the two-hour cancellation cutoff, synchronized Google Calendar updates, customer confirmations, and staff visibility of exceptions. Add approved WhatsApp templates only when proactive messages are required outside Meta's customer-service window.

Acceptance criteria:

- A customer can cancel their own appointment before the cutoff.
- A cancellation updates both the internal record and calendar.
- A customer inside the cutoff is informed that staff will review the request; no automatic policy exception is made.
- Rescheduling preserves a clear audit history and prevents slot conflicts.
- An unconverted lead may receive one five-day follow-up only when consent and WhatsApp template requirements permit it; cancellations and no-shows do not trigger this follow-up.

### Phase 7 — Staff Dashboard and Handoff

Build the minimum staff dashboard: inbox, conversation detail, customer/appointment context, handoff state, and manual controls. Send an email notification for new escalations.

Acceptance criteria:

- Staff can see the complete conversation and relevant customer/appointment context.
- A handoff alerts the configured staff email without exposing other tenants' information.
- Staff can claim, resolve, or return a conversation to AI control.
- AI stops automated replies while staff owns the conversation.

### Phase 8 — Security, Quality, and Demo Readiness

Perform threat-focused testing, permissions review, rate limiting, prompt-injection tests, failure-path testing, and end-to-end demo validation. Configure Railway deployment and non-production secrets only after approval.

Acceptance criteria:

- Webhook signatures, authentication, tenant authorization, and rate limits are covered by automated tests.
- Malicious customer messages cannot invoke unauthorized booking actions or expose tenant data.
- The full WhatsApp → AI → Calendar → CRM → staff-handoff flow works in a controlled test environment.
- A release checklist identifies every placeholder that must be replaced before production.

## Core Data Model (Planned)

| Entity | Purpose |
|---|---|
| `tenants` | Dental practice identity and configuration |
| `staff_users` | Tenant-scoped dashboard users and roles |
| `whatsapp_accounts` | Per-tenant Meta connection identifiers; secrets remain outside the database where possible |
| `customers` | Tenant-scoped WhatsApp customer profile and consent state |
| `conversations` / `messages` | History, language, assignment, and handoff state |
| `services` | Bookable services, duration, displayed price, and availability rules |
| `appointments` | Internal appointment record linked to customer, calendar event, and audit state |
| `handoffs` | Reason, notification status, staff owner, and resolution record |
| `audit_events` | Immutable record of booking, cancellation, assignment, and privileged actions |

## Required Pre-Development Inputs

Before Phase 1 code begins, confirm or provide:

1. Exact OpenAI model and a monthly usage budget/limit.
2. Exact send times for the night-before and day-of reminders.
3. Rules for late cancellations, no-shows, and staff overrides.
5. The staff email address to replace the `.example` placeholder.
6. The complete practice address, weekend/holiday policy, and approved FAQ content.
7. Required privacy/compliance obligations and data-retention period.
8. Meta Business/WhatsApp ownership and Google Workspace/Calendar account ownership for each tenant.

## Pre-Launch Checklist

- Replace all demo prices, address, email, and policy placeholders.
- Obtain actual Meta and Google credentials through secure channels; never commit them.
- Configure production-approved WhatsApp message templates.
- Validate consent and privacy notices for the target market.
- Complete penetration/security review and backup/restore check.
- Obtain tenant acceptance of language, safety, and escalation behavior.

## Approval Gate

When you approve implementation, the first build action will be **Phase 1 only**. Meta, OpenAI, Google Calendar, email, and Railway connections will remain unconfigured until their respective credentials and account authorization are supplied.
