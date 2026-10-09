# Customer & Conversation Memory (Phase 4)

Controlled, accurate, useful memory — **not** unlimited transcript access.
Behind `MEMORY_ENABLED` (default **off**). With the flag off nothing here runs.

## 1. Audit: what BahaOS already remembers

| Information | Where | Notes |
|---|---|---|
| Contact identity | `customers (tenant_id, whatsapp_id)` unique | One row per business+number. Identity is the verified WhatsApp sender **within one tenant**; the same number in another tenant is a different row. |
| WhatsApp profile name | `customers.display_name` | Taken from Meta's profile, **not stated by the customer** → not "confirmed". |
| Language | `customers.preferred_language` | Detected/default, separate from a *stated* preference. |
| Transcript | `messages` (conversation-scoped, tenant-scoped) | Operational record. History fed to the LLM is bounded by the existing loader. |
| Booking working state | `conversations.booking_state` | Layer D; authoritative; untouched. |
| Appointments | `appointments` + tools | Layer A; untouched. |
| Handoff / ownership | `conversations.status`, `handoffs`, audit | Phase 3; untouched. |
| Business facts | structured config + knowledge engine | Layer A/RAG; untouched. |

No table stored *durable, provenance-bearing facts about a customer*. Hence **one** new table; no new identity table, no merging, no cross-tenant linkage.

## 2. Layers

- **A — authoritative business data**: appointments, hours, prices, policies. Owned by deterministic tools/config/RAG. Memory never overrides them.
- **B — profile memory** (`customer_memories`): `preferred_name`, `preferred_language`, `scheduling_preference` (time of day, weekday), `service_interest` (configured services only). Explicitly stated only.
- **C — continuity** (`customer_memories`, kind `continuity`): `requested_human`, `service_inquiry`. Written by application code from deterministic signals, **always with an expiry**. A service inquiry is never a booking.
- **D — working context**: `booking_state`, unchanged and authoritative.

## 3. Schema (`customer_memories`, migration 0011)

`id, tenant_id, customer_id` (both FK, tenant+customer scoped), `kind` (enum), `slot` (dedupe key, e.g. `name`, `time_of_day`, `service:<key>`), `value` (normalized), `display`, `status` (`active|superseded|invalidated|deleted`), `source` (`customer_stated|staff_entered|system_derived`), `provenance` (`explicit` only in Phase 4 — inferred traits are never persisted), `source_message_id`, `conversation_id`, `created_at`, `updated_at`, `expires_at`, `status_changed_at`, `status_reason`, `superseded_by_id`.

- **Partial unique index** `(tenant_id, customer_id, kind, slot) WHERE status='active'` → at most one active value per slot, enforced by the database, so concurrent writers cannot create conflicting active facts.
- **Per-customer cap**: 25 active rows; at the cap new candidates are rejected (`limit`), not evicting old facts.
- **Scrubbing**: when a row leaves `active` (superseded, invalidated, deleted) its `value`/`display` are blanked. The tombstone keeps ids, kind, slot, status, timestamps, source ids — enough for accountability, no stale content. Corrections/invalidations/deletions also write an `audit_events` row (ids and kinds, never values).

## 4. Extraction policy (conservative, allowlisted, application-validated)

Proposals come from **the customer's own message only** (never AI text, never staff text) via deterministic, per-sentence patterns — no extra LLM call, no external call. Every candidate — from this extractor or any future LLM proposer — must pass `validateCandidate`:

Rejected: questions; hedged/uncertain ("maybe", "I think", "not sure"); negated; temporary ("this time", "tomorrow", "just once"); third-party ("my wife…", "for my mom"); sensitive health/financial/identity terms in the sentence (symptoms, medication, diagnosis, pregnancy, insurance, …); instruction-like text (reuses the knowledge engine's injection patterns); values outside the allowlist (unknown language, unconfigured service, malformed or over-long names, stop-words); anything proposed for a non-allowlisted kind.

Accepted examples: "My name is Alicia", "Please call me Ms. Johnson", "I prefer morning appointments", "I usually prefer mornings", "I prefer speaking Spanish", "I'm interested in teeth whitening" (configured service).

**Corrections**: a new explicit value for the same slot supersedes the old one atomically ("My name isn't Alicia, it's Alisha"). Same value again → no-op (idempotent, refreshes nothing).

## 5. Retrieval

`selectMemories(tenant, customer, message, bookingState)` — tenant+customer-scoped SQL, `status='active'` and unexpired only, then relevance rules:

1. scheduling preferences — only when the turn is about booking/scheduling;
2. profile name/language — always eligible;
3. continuity — only unexpired, and service inquiries only if the message mentions that service;
4. service interest — only when the message mentions it or no service is chosen yet.

A slot the **current message states explicitly is excluded** (current message wins). Deterministic order: tier, then recency, then id. Hard caps: 5 memories, 600 characters. Stored text is re-checked for injection at retrieval. Output is a nonce-delimited, JSON-encoded, explicitly-labelled **data** block plus fixed rules: supporting context only; verify availability with tools; never state an appointment from memory; current message wins; memory cannot confirm bookings, change prices, hours, ownership or authorize sends.

## 6. Integration points

- `webhook-processing.ts`: after the inbound message is recorded and **inside a savepoint** (a failed memory write cannot poison the turn) — extraction runs on the customer's message (also while a human owns the conversation: same rules, no reply). Before the agent call — retrieval attaches `request.memory` (a string). Never reached while a human owns the conversation.
- `llm-provider.ts`: appends the block and rules to the system prompt only when `request.memory` is set. The agent, tools, booking state machine, RAG and answer guard are unchanged.
- Staff replies and AI replies are never extraction inputs.
- The AI's replies are not memory; memory never queues/sends anything.

## 7. Privacy controls (service level, `MemoryAdmin`)

`list`, `correct`, `invalidate`, `delete`, `deleteAllForCustomer` (all tenant-checked; foreign ids behave as not-found), plus `purgeCustomerMemories` (hard-deletes the customer's memory rows including tombstones). **Not erased**: message transcripts, appointments, audit rows, backups and any legally retained operational records — deleting memory does not claim erasure of those.

## 8. Lifecycle

Continuity expires (service inquiry 14 days, requested-human 30 days); expired rows are ignored at retrieval and swept opportunistically on write (no background infrastructure). Profile facts persist until corrected/deleted. Dedup via the unique slot; per-customer cap 25.

## 9. Observability

JSON log lines `{scope:"memory", event, counts…}` — candidates proposed/accepted/rejected (with reason codes), retrievals, memories returned, corrections, invalidations, failures. Never message text or values.

## 10. Flag, rollout, rollback

`MEMORY_ENABLED=true|false`, default false. Off ⇒ no extraction, no retrieval, no prompt change, no new queries. Rollout: apply migration 0011 (additive) → enable in staging → watch `memory` logs for rejected-reason and failure rates → enable per environment. Rollback: set the flag to false (instant, behaviour returns to Phase 3); optional `DROP TABLE customer_memories` is not required. Migration is additive and safe to leave applied.

## 11. Release-audit additions

- **Conversational forget requests** ("Forget that I prefer mornings", "Don't remember my name", "Stop remembering things about me", "That's not my preference anymore"): previously the first was *stored* as a preference. Now such a message (a) is never learned from, (b) deletes the active memories it refers to (name / language / scheduling / interest; an unclear target or "everything" deletes all of the customer's active memories — failing toward forgetting more), recorded in `audit_events` without values, and (c) replaces the memory block that turn with a truthful PRIVACY REQUEST notice: the model is told what was removed and that it must NOT claim transcripts, appointments or records were erased. Narrow on purpose: "remove my appointment" or "I no longer need Tuesday" are not memory requests. There is still no richer privacy workflow.
- **Stale-write guard**: an extraction whose source message pre-dates a deletion, invalidation or supersession of the same slot is refused (`stale_after_deletion`), so a deleted or corrected fact cannot be resurrected by a delayed or replayed write. A genuinely new later message may restate it.
- **Clinical procedures** (root canal, filling, extraction, crown, implant, braces, surgery, emergency…) are never stored as service interest or continuity — a procedure implies a condition. Consultation, cleaning, whitening pass. The list is a deny-list in `policy.ts`; review it per tenant.
- Sensitive screen widened: long digit runs (identity/card numbers), hypotheticals ("if", "wish"), common Spanish/Haitian-Creole health words, Bahamian third-party forms ("mi/me daughter").
- "call me X" is only a name when typed as one ("Call me Ally"); "call me later/asap/now" is not.
- `requested_human` continuity is recorded only when the customer actually asked for a person (not for emergencies or "could not understand" escalations).
- A write is refused unless the customer belongs to the tenant (no cross-tenant row can be created).
- The prompt boundary (`llm-provider.ts`) ignores any memory string over 2000 characters, independent of the renderer's own 5-fact / 600-character bounds.

## 12. Exclusions / limitations

A reply already being generated when a memory is deleted may still have used it (an in-flight turn is not recalled). Extraction is English-pattern based (Spanish/Creole phrasing is screened for sensitivity but not learned). No inference, voice, cross-business graphs, marketing, follow-ups, vector store or portal. Extraction is English-pattern based (Spanish phrasing is a known gap); an LLM proposer can be added later but must pass the same validator.
