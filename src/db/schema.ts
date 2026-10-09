import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { BookingState } from "../ai/types";
import type { KnowledgeClaim, RetrievalLogConflict, RetrievalLogEvidence } from "../knowledge/types";

/** What a handoff's `context` snapshot carries — everything a human
 * needs to act on the escalation without reconstructing it from raw
 * messages (see PHASE1_PROGRESS.md's Objective 7). Type-only import from
 * src/ai — the DB layer never executes any AI-layer code, only shares
 * this one structural type. */
export interface HandoffContext {
  bookingState: BookingState;
  /** What the customer was actually asking for when this handoff fired,
   * in the app's own words — not the customer's raw message (that's
   * already in `messages`). Omitted for a plain "talk to a person"
   * request with nothing else in progress. */
  requestedAction?: string;
  /** Set when the escalation was triggered by the app being unable to
   * confidently understand the customer, rather than an explicit
   * request/emergency — see Objective 4. */
  unresolvedQuestion?: string;
}

/**
 * Phase 1 scope: schema and migrations only, for every tenant-aware entity
 * named in IMPLEMENTATION_PLAN.md's "Core Data Model". No query/service
 * layer, auth, or external integrations are implemented yet — those land
 * in later phases per the approved plan.
 *
 * Every table except `tenants` carries a `tenantId` column so tenant
 * isolation can be enforced at the query layer in Phase 2.
 */

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// --- Enums ----------------------------------------------------------------

export const languageEnum = pgEnum("language", ["en", "es", "ht"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["demo", "active", "inactive"]);
export const staffRoleEnum = pgEnum("staff_role", ["admin", "staff"]);
export const consentStatusEnum = pgEnum("consent_status", ["unknown", "opted_in", "opted_out"]);
// Conversation OWNERSHIP (Phase 3 — see INBOX.md). The persisted names
// predate the inbox; the mapping to the product's state names is:
//   ai_active     = AI_ACTIVE      the AI may reply normally
//   human_pending = HUMAN_PENDING  handoff requested, awaiting staff; AI suppressed
//   staff_owned   = HUMAN_ACTIVE   a staff member owns it; AI suppressed
//   resolved      = CLOSED         closed; the customer's next message starts a new one
export const conversationStatusEnum = pgEnum("conversation_status", [
  "ai_active",
  "staff_owned",
  "resolved",
  "human_pending",
]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const senderTypeEnum = pgEnum("sender_type", ["customer", "ai", "staff", "system"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  // Outbound retry mechanism (see src/messaging/outbound-retry-worker.ts):
  // set when a send attempt failed with a RETRYABLE error and the retry
  // budget (outboundAttempts) isn't exhausted yet — distinct from
  // "failed", which means either a non-retryable error or the budget IS
  // exhausted (no further attempts will ever be made). A message never
  // sits in "queued" for outbound sends in practice (the webhook route
  // always attempts a send synchronously before this status could ever
  // be observed at rest) — "retry_pending" is the state that actually
  // matters for anything durable/restart-safe.
  "retry_pending",
  // An AI reply that was generated but deliberately NOT delivered because
  // a human took the conversation over first (kept for history, never sent,
  // never fed back to the AI as something it said).
  "suppressed",
]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "booked",
  "cancelled",
  "completed",
  "no_show",
]);
export const handoffStatusEnum = pgEnum("handoff_status", ["open", "claimed", "resolved"]);
export const leadStatusEnum = pgEnum("lead_status", ["new", "contacted", "converted", "closed"]);
// Objectives 5/6's explicit state progression: OBSERVED -> CUSTOMER_CONFIRMED
// -> REPEATED -> APPROVED. "rejected" is not in the mission's diagram but
// is the obvious counterpart a human reviewer needs (there is no admin UI
// yet to act on it, but the schema/state machine must have somewhere for
// "a human looked at this and said no" to go, rather than leaving a
// rejected observation looking identical to one nobody has reviewed).
export const languageObservationStatusEnum = pgEnum("language_observation_status", [
  "observed",
  "customer_confirmed",
  "repeated",
  "approved",
  "rejected",
]);
export const actorTypeEnum = pgEnum("actor_type", ["ai", "staff", "system"]);
export const whatsappAccountStatusEnum = pgEnum("whatsapp_account_status", [
  "not_connected",
  "connected",
  "error",
]);

// Durable outbound delivery lifecycle (see src/messaging/outbox.ts):
//   pending -> processing -> sent
//                         -> retry_wait -> processing -> ...
//                         -> dead_letter
export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "processing",
  "retry_wait",
  "sent",
  "dead_letter",
  // Withdrawn BEFORE any provider call (e.g. an AI reply superseded by a
  // human takeover). Terminal; never delivered; history preserved.
  "cancelled",
]);

// --- Knowledge engine enums (see KNOWLEDGE_ENGINE.md) ---------------------

export const knowledgeSourceKindEnum = pgEnum("knowledge_source_kind", [
  "manual",
  "document",
  "website",
  "import",
]);
export const knowledgeDocTypeEnum = pgEnum("knowledge_doc_type", [
  "faq",
  "policy",
  "article",
  "document",
]);
// draft -> pending_review -> approved -> superseded. Only "approved" is ever
// retrievable for a customer answer. "pending_review" is also where a
// document is quarantined when injection-style content is detected.
export const knowledgeDocStatusEnum = pgEnum("knowledge_doc_status", [
  "draft",
  "pending_review",
  "approved",
  "superseded",
  "rejected",
  "archived",
]);
// Authority tiers a STORED document can hold. Application/database truth and
// structured business configuration outrank all of these but are not
// documents (see src/knowledge/authority.ts). "unreviewed" can never be
// served to a customer.
export const knowledgeAuthorityEnum = pgEnum("knowledge_authority", [
  "human_approved",
  "approved_document",
  "unreviewed",
]);
export const knowledgeConflictStatusEnum = pgEnum("knowledge_conflict_status", [
  "open",
  "resolved",
  "dismissed",
]);
export const knowledgeOutcomeEnum = pgEnum("knowledge_outcome", [
  "grounded",
  "no_evidence",
  "conflict",
]);

// --- Tenants ----------------------------------------------------------------

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    slug: varchar("slug", { length: 63 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    defaultLanguage: languageEnum("default_language").notNull().default("en"),
    status: tenantStatusEnum("status").notNull().default("demo"),
    ...timestamps,
  },
  (table) => [uniqueIndex("tenants_slug_key").on(table.slug)],
);

// --- Staff users --------------------------------------------------------

export const staffUsers = pgTable(
  "staff_users",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: staffRoleEnum("role").notNull().default("staff"),
    // Auth (password/hash, sessions) lands in Phase 2. Nullable until then.
    passwordHash: varchar("password_hash", { length: 255 }),
    isActive: boolean("is_active").notNull().default(true),
    // Brute-force throttling for staff login (see src/inbox/auth.ts).
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("staff_users_tenant_email_key").on(table.tenantId, table.email),
    index("staff_users_tenant_id_idx").on(table.tenantId),
  ],
);

// --- Staff sessions ---------------------------------------------------------
//
// Opaque bearer tokens for the staff inbox. Only the SHA-256 of a token is
// stored (a database leak does not leak usable sessions). tenant_id is
// copied from the staff user at login and is the ONLY tenant a session can
// ever act in — it is never taken from a request.

export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("staff_sessions_token_hash_key").on(table.tokenHash),
    index("staff_sessions_staff_user_idx").on(table.staffUserId),
  ],
);

// --- WhatsApp accounts ----------------------------------------------------

export const whatsappAccounts = pgTable(
  "whatsapp_accounts",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // Non-secret identifiers only. Access tokens are never stored here —
    // per IMPLEMENTATION_PLAN.md, secrets stay outside the database where
    // possible (env vars / secrets manager, configured in a later phase).
    phoneNumberId: varchar("phone_number_id", { length: 64 }),
    displayPhoneNumber: varchar("display_phone_number", { length: 32 }),
    wabaId: varchar("waba_id", { length: 64 }),
    status: whatsappAccountStatusEnum("status").notNull().default("not_connected"),
    ...timestamps,
  },
  (table) => [uniqueIndex("whatsapp_accounts_tenant_id_key").on(table.tenantId)],
);

// --- Customers --------------------------------------------------------------

export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    whatsappId: varchar("whatsapp_id", { length: 32 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    preferredLanguage: languageEnum("preferred_language").notNull().default("en"),
    consentStatus: consentStatusEnum("consent_status").notNull().default("unknown"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customers_tenant_whatsapp_id_key").on(table.tenantId, table.whatsappId),
    index("customers_tenant_id_idx").on(table.tenantId),
  ],
);

// --- Conversations ------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: conversationStatusEnum("status").notNull().default("ai_active"),
    assignedStaffUserId: uuid("assigned_staff_user_id").references(() => staffUsers.id),
    language: languageEnum("language").notNull().default("en"),
    // The application-owned BookingState (src/ai/types.ts) as of the last
    // processed turn — what makes a conversation actually resumable after
    // a process restart, not just identifiable. Nullable/defaults to `{}`
    // rather than a dedicated empty-state sentinel, matching how
    // ConversationManager already treats "nothing in progress".
    bookingState: jsonb("booking_state").notNull().default({}).$type<BookingState>(),
    // --- ownership metadata (Phase 3) -------------------------------------
    // Why the conversation was handed to a human (AI's escalation reason).
    handoffReason: text("handoff_reason"),
    handoffRequestedAt: timestamp("handoff_requested_at", { withTimezone: true }),
    // When status/assignee last changed, and a counter bumped on EVERY
    // ownership change — lets a UI/API reject a stale action ("this
    // conversation changed since you loaded it").
    ownershipChangedAt: timestamp("ownership_changed_at", { withTimezone: true }),
    ownershipVersion: integer("ownership_version").notNull().default(0),
    // Last message in either direction / any ownership change (inbox sort).
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    // Set while a customer is waiting on a human (cleared by a staff reply,
    // returning to the AI, or closing). The inbox "waiting" indicator.
    waitingSince: timestamp("waiting_since", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByStaffUserId: uuid("closed_by_staff_user_id").references(() => staffUsers.id),
    closeNote: text("close_note"),
    ...timestamps,
  },
  (table) => [
    index("conversations_tenant_id_idx").on(table.tenantId),
    index("conversations_tenant_status_idx").on(table.tenantId, table.status),
    index("conversations_tenant_activity_idx").on(table.tenantId, table.lastActivityAt),
    index("conversations_customer_id_idx").on(table.customerId),
  ],
);

// --- Messages -------------------------------------------------------------

export const messages = pgTable(
  "messages",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    direction: messageDirectionEnum("direction").notNull(),
    senderType: senderTypeEnum("sender_type").notNull(),
    content: text("content").notNull(),
    whatsappMessageId: varchar("whatsapp_message_id", { length: 128 }),
    // Which staff member wrote it (sender_type = 'staff' only).
    authorStaffUserId: uuid("author_staff_user_id").references(() => staffUsers.id),
    status: messageStatusEnum("status"),
    // Outbound retry mechanism — deliberately columns on THIS table
    // rather than a separate "failed outbound"/"retry metadata" table:
    // a retry is fundamentally "attempt to send THIS row again," not a
    // distinct entity with its own lifecycle, and every one of these is
    // meaningless (stays at its default) for inbound messages. Minimum
    // safe design given the existing schema — see
    // src/messaging/outbound-retry-worker.ts for the state machine these
    // drive.
    outboundAttempts: integer("outbound_attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_tenant_id_idx").on(table.tenantId),
    uniqueIndex("messages_whatsapp_message_id_key").on(table.whatsappMessageId),
    // The retry worker's own access pattern: "every row due for another
    // attempt, oldest-due first" — a plain btree on the column the WHERE
    // clause filters and the ORDER BY sorts on, scoped implicitly by
    // `status='retry_pending'` at query time (a partial index on that
    // predicate would be marginally more efficient but isn't worth the
    // extra migration complexity at this table's expected volume).
    index("messages_next_retry_at_idx").on(table.nextRetryAt),
  ],
);

// --- Services --------------------------------------------------------------

export const services = pgTable(
  "services",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 255 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    // Demo/display price only — not a billing amount. Nullable because
    // production pricing is not yet confirmed (see PROJECT_CONTEXT.md).
    displayPriceCents: integer("display_price_cents"),
    currency: varchar("currency", { length: 3 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("services_tenant_id_idx").on(table.tenantId)],
);

// --- Appointments -----------------------------------------------------------

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: appointmentStatusEnum("status").notNull().default("booked"),
    // External Google Calendar event reference; populated in Phase 5.
    calendarEventId: varchar("calendar_event_id", { length: 255 }),
    cancellationReason: text("cancellation_reason"),
    // Deterministic key derived from (tenant, customer, service, staff,
    // start, end) — see src/db/appointments.ts's buildIdempotencyKey.
    // Lets a retried booking request (duplicate WhatsApp delivery, a
    // network/client retry, a model repeating a tool call) resolve to the
    // SAME row instead of a second one, without conflating that with two
    // DIFFERENT customers genuinely competing for the same slot (which is
    // instead governed by appointments_no_overlap — see the accompanying
    // hand-written migration). Nullable so existing/legacy rows (and any
    // future write path that doesn't compute one) are unaffected; the
    // partial unique index below only applies where it's actually set.
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    ...timestamps,
  },
  (table) => [
    index("appointments_tenant_id_idx").on(table.tenantId),
    index("appointments_tenant_starts_at_idx").on(table.tenantId, table.startsAt),
    index("appointments_customer_id_idx").on(table.customerId),
    uniqueIndex("appointments_idempotency_key_key")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

// --- Handoffs --------------------------------------------------------------

export const handoffs = pgTable(
  "handoffs",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    // Free text, not an enum: exact escalation categories (clinical,
    // emergency, complaint, low-confidence, etc.) are not yet finalized
    // (see PROJECT_CONTEXT.md open question on clinical safety boundaries).
    reason: text("reason").notNull(),
    status: handoffStatusEnum("status").notNull().default("open"),
    claimedByStaffUserId: uuid("claimed_by_staff_user_id").references(() => staffUsers.id),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // A snapshot of exactly what a human needs to act on this handoff
    // without having to reconstruct it from the conversation's raw
    // messages — the BookingState as of the escalating turn, the action
    // the customer was requesting (if any), and the unresolved question,
    // if the escalation was triggered by the app being unable to
    // understand the customer rather than an explicit request/emergency.
    // Nullable: not every escalation path threads a snapshot through yet
    // (see ReceptionistTools.escalate's payload shape).
    context: jsonb("context").$type<HandoffContext>(),
    ...timestamps,
  },
  (table) => [
    index("handoffs_tenant_id_idx").on(table.tenantId),
    index("handoffs_tenant_status_idx").on(table.tenantId, table.status),
    index("handoffs_conversation_id_idx").on(table.conversationId),
  ],
);

// --- Leads -------------------------------------------------------------

export const leads = pgTable(
  "leads",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    // The conversation this lead was captured from — nullable since a
    // lead could conceivably be entered by staff outside any
    // conversation in the future, but every lead this app itself creates
    // (via ReceptionistTools.createLead) always has one.
    sourceConversationId: uuid("source_conversation_id").references(() => conversations.id),
    serviceInterest: varchar("service_interest", { length: 255 }),
    status: leadStatusEnum("status").notNull().default("new"),
    ...timestamps,
  },
  (table) => [
    index("leads_tenant_id_idx").on(table.tenantId),
    index("leads_tenant_status_idx").on(table.tenantId, table.status),
    index("leads_customer_id_idx").on(table.customerId),
  ],
);

// --- Language observations (Objectives 5/6) --------------------------------

/**
 * Structured foundation for future Bahamian-dialect/multilingual
 * support — deliberately NOT wired into any live extraction/intent
 * matching this phase. Recording an observation (or even confirming
 * one) must never, by itself, change what the deterministic layer
 * recognizes; only a human explicitly setting `status` to `approved`
 * (a future admin action — no UI built yet) is meant to eventually feed
 * back into production behavior, and nothing in this codebase reads
 * `approved` rows yet either. This table only stores the OBSERVED
 * PHRASE and its proposed meaning — never the customer's full message
 * or other conversation content, per the explicit "do not unnecessarily
 * store sensitive conversation content" instruction.
 */
export const languageObservations = pgTable(
  "language_observations",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // The observed phrase/snippet itself (e.g. "put me down fi"), NOT
    // the customer's full message. Matched case-insensitively/trimmed by
    // the service layer (see language-observations.ts), not by a DB
    // constraint, so near-duplicate casing/whitespace still merges into
    // one observation rather than fragmenting evidence across rows.
    phrase: varchar("phrase", { length: 255 }).notNull(),
    // Human-readable meaning the system proposed, e.g. "book appointment".
    normalizedMeaning: varchar("normalized_meaning", { length: 255 }).notNull(),
    // Free text, not a BookingIntent — the mission's own examples
    // include things that aren't booking intents at all (e.g. "customer
    // needs assistance"), so this is deliberately broader.
    intent: varchar("intent", { length: 128 }).notNull(),
    // BCP-47-ish, not constrained to the existing `language` enum (which
    // models a CUSTOMER's preferred language for a different purpose) —
    // e.g. "en", "en-BS". Defaults to "en" since that's this product's
    // only supported language today.
    language: varchar("language", { length: 16 }).notNull().default("en"),
    // The system's own confidence (0-1) in the proposed interpretation
    // at the moment it was first observed. Nullable — not every
    // observation source will have a real confidence score.
    confidence: real("confidence"),
    // Why this phrase was flagged — e.g. "no recognized intent, service,
    // date, time, phone, or correction pattern matched" — for a human
    // reviewer deciding whether to approve it. Nullable: not every
    // observation source (e.g. a future customer-confirmed dialect
    // mapping) has a "why" distinct from normalizedMeaning itself.
    reason: text("reason"),
    // A SHORT, STRUCTURED snapshot of what the app already knew when the
    // phrase was flagged (e.g. "intent=book_appointment;
    // pendingAction=none; nextRequiredField=date") — deliberately never
    // the customer's full message or raw conversation turns, same
    // constraint as `phrase` itself (see this table's own docstring).
    context: text("context"),
    // What actually happened after this phrase was flagged this turn —
    // e.g. "asked_for_clarification", "escalated" — free text like
    // `intent`, not a strict enum, since this is a v1 foundation and the
    // realistic outcome vocabulary isn't fully known yet. Set once, at
    // record time, from what's already known THIS turn; not updated
    // retroactively if a later turn resolves things (documented
    // limitation — see language-observations.ts).
    outcome: varchar("outcome", { length: 64 }),
    sourceConversationId: uuid("source_conversation_id").references(() => conversations.id),
    observationCount: integer("observation_count").notNull().default(1),
    confirmationCount: integer("confirmation_count").notNull().default(0),
    status: languageObservationStatusEnum("status").notNull().default("observed"),
    ...timestamps,
  },
  (table) => [
    index("language_observations_tenant_id_idx").on(table.tenantId),
    index("language_observations_tenant_status_idx").on(table.tenantId, table.status),
    // Not UNIQUE: the service layer's find-or-create does its own
    // case-insensitive/trimmed matching before inserting, which an exact
    // DB-level unique index on the raw column can't express — this index
    // exists purely to make that lookup fast, not to enforce uniqueness
    // itself.
    index("language_observations_tenant_phrase_idx").on(table.tenantId, table.phrase),
  ],
);

// --- Durable outbound outbox ---------------------------------------------------
//
// BahaOS decides WHAT to send (the business layer); this table makes that
// decision DURABLE in the same transaction as the business state; a worker
// owns delivery; the provider (Meta) is only transport. `messages` stays the
// conversation log (history); this table is the delivery state machine for
// one logical outbound message. See src/messaging/outbox.ts.

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    // The conversation-log row this delivery is for.
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    // Channel-aware, WhatsApp only for now.
    channel: varchar("channel", { length: 32 }).notNull().default("whatsapp"),
    provider: varchar("provider", { length: 32 }).notNull().default("meta_cloud"),
    messageType: varchar("message_type", { length: 32 }).notNull().default("text"),
    // Snapshot of the recipient at enqueue time ("+"-prefixed E.164, the
    // shape the existing sender normalizes) — never re-derived by a join.
    recipient: varchar("recipient", { length: 32 }).notNull(),
    payload: jsonb("payload").notNull().$type<{ body: string }>(),
    status: outboxStatusEnum("status").notNull().default("pending"),
    // Who authored it: 'ai' (the receptionist) or 'staff' (a human via the
    // inbox). Only AI-origin messages are withdrawn on a human takeover.
    origin: varchar("origin", { length: 16 }).notNull().default("ai"),
    // One logical outbound message = one key (unique per tenant).
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    // Global monotonic order; the per-CONVERSATION delivery order key.
    seq: bigserial("seq", { mode: "number" }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    // How many times an operator re-queued this (same, single) logical
    // message out of dead_letter. attempt_count restarts each time; the
    // previous failure is preserved in error_metadata.history.
    requeueCount: integer("requeue_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    // A claim is a LEASE: after this instant an unfinished claim is
    // recoverable. claim_token fences a stale worker's late result.
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    claimToken: uuid("claim_token"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    lastError: text("last_error"),
    errorCode: varchar("error_code", { length: 64 }),
    errorMetadata: jsonb("error_metadata").$type<Record<string, unknown>>(),
    // --- delivery (Meta status webhooks) — SEPARATE from `status` above ----------------------------
    // `status = 'sent'` means ONLY "the provider's API accepted the message". What actually happened to it
    // afterwards (the customer's phone received it, read it, or the provider reported a failure) arrives later as
    // status webhooks and lives here, derived from outbox_delivery_receipts. NULL = no receipt seen yet.
    deliveryStatus: varchar("delivery_status", { length: 16 }), // provider_sent | delivered | read | failed
    deliveryUpdatedAt: timestamp("delivery_updated_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveryErrorCode: varchar("delivery_error_code", { length: 64 }),
    deliveryErrorTitle: text("delivery_error_title"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("outbox_messages_tenant_idempotency_key").on(table.tenantId, table.idempotencyKey),
    uniqueIndex("outbox_messages_message_id_key").on(table.messageId),
    uniqueIndex("outbox_messages_seq_key").on(table.seq),
    // The worker's claim scan: due rows only.
    index("outbox_messages_due_idx")
      .on(table.availableAt)
      .where(sql`${table.status} in ('pending','retry_wait')`),
    index("outbox_messages_lease_idx")
      .on(table.leaseExpiresAt)
      .where(sql`${table.status} = 'processing'`),
    // The ordering gate: "is anything earlier in this conversation unfinished?"
    index("outbox_messages_conversation_open_idx")
      .on(table.conversationId, table.seq)
      .where(sql`${table.status} in ('pending','processing','retry_wait')`),
    index("outbox_messages_tenant_status_idx").on(table.tenantId, table.status),
    // Receipts find their row by the provider's id (tenant-scoped; NULL while accepted-without-id).
    index("outbox_messages_tenant_provider_message_idx")
      .on(table.tenantId, table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
  ],
);

// Append-only ledger of provider delivery receipts (Meta `statuses`). Receipts can arrive BEFORE the worker has
// saved provider_message_id on the outbox row, twice, or out of order, so they are always recorded here first and
// the outbox row's delivery_* columns are DERIVED from the ledger (order-independent and idempotent). Tenant-scoped.
export const outboxDeliveryReceipts = pgTable(
  "outbox_delivery_receipts",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    providerMessageId: varchar("provider_message_id", { length: 255 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(), // sent | delivered | read | failed
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    recipient: varchar("recipient", { length: 64 }),
    errorCode: varchar("error_code", { length: 64 }),
    errorTitle: text("error_title"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("outbox_delivery_receipts_event_key").on(table.tenantId, table.providerMessageId, table.status, table.eventAt),
    index("outbox_delivery_receipts_message_idx").on(table.tenantId, table.providerMessageId),
  ],
);

// --- Knowledge engine -------------------------------------------------------
//
// Business knowledge for RAG. Everything here is tenant-scoped and
// APPROVAL-gated. It is never the source of truth for availability,
// bookings, customer identity or any other application state (those stay
// deterministic — see KNOWLEDGE_ENGINE.md). Structured configuration
// (services, prices, hours) is NOT duplicated into these tables; it is read
// from its existing home and outranks everything stored here.

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    kind: knowledgeSourceKindEnum("kind").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    // Where the content came from (file name, URL) — informational.
    origin: varchar("origin", { length: 1024 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("knowledge_sources_tenant_id_idx").on(table.tenantId),
    // Lets child rows carry (tenant_id, source_id) as a composite FK so a
    // document can never point at ANOTHER tenant's source.
    uniqueIndex("knowledge_sources_tenant_id_id_key").on(table.tenantId, table.id),
  ],
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sourceId: uuid("source_id").notNull(),
    // Stable identity across versions ("cancellation-policy"). A new
    // version of the same docKey supersedes the previous approved one.
    docKey: varchar("doc_key", { length: 128 }).notNull(),
    version: integer("version").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    docType: knowledgeDocTypeEnum("doc_type").notNull(),
    status: knowledgeDocStatusEnum("status").notNull().default("draft"),
    authority: knowledgeAuthorityEnum("authority").notNull().default("unreviewed"),
    // SHA-256 of the normalized body — idempotent re-ingestion.
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    body: text("body").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    // After this instant the document is no longer retrievable.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    approvedBy: varchar("approved_by", { length: 255 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    supersededByDocumentId: uuid("superseded_by_document_id"),
    // Why a document was quarantined, parse notes, etc. Never customer data.
    metadata: jsonb("metadata").notNull().default({}).$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    index("knowledge_documents_tenant_id_idx").on(table.tenantId),
    index("knowledge_documents_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("knowledge_documents_tenant_key_version_key").on(
      table.tenantId,
      table.docKey,
      table.version,
    ),
    // The invariant behind "stale vs newer approved document": at most ONE
    // approved version per (tenant, docKey) at any time.
    uniqueIndex("knowledge_documents_one_approved_per_key")
      .on(table.tenantId, table.docKey)
      .where(sql`${table.status} = 'approved'`),
    uniqueIndex("knowledge_documents_tenant_id_id_key").on(table.tenantId, table.id),
    foreignKey({
      columns: [table.tenantId, table.sourceId],
      foreignColumns: [knowledgeSources.tenantId, knowledgeSources.id],
      name: "knowledge_documents_tenant_source_fk",
    }),
  ],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: uuid("document_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    // Heading path ("Cancellation > Late cancellations") for context.
    section: varchar("section", { length: 512 }),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    // Deterministically extracted structured claims (price, duration, ...)
    // used for conflict detection. See src/knowledge/claims.ts.
    claims: jsonb("claims").notNull().default([]).$type<KnowledgeClaim[]>(),
    // True when instruction-like text was detected and neutralized.
    flaggedInjection: boolean("flagged_injection").notNull().default(false),
    // The embedding (KnowledgeEmbedding, consolidated into the chunk row)
    // plus the model that produced it. Vectors from different models are
    // never compared. real[] now; a pgvector column is the Phase 2 swap.
    embedding: real("embedding").array(),
    embeddingModel: varchar("embedding_model", { length: 128 }),
    ...timestamps,
  },
  (table) => [
    index("knowledge_chunks_tenant_id_idx").on(table.tenantId),
    uniqueIndex("knowledge_chunks_document_ordinal_key").on(table.documentId, table.ordinal),
    // Composite FK: a chunk's tenant MUST equal its document's tenant.
    foreignKey({
      columns: [table.tenantId, table.documentId],
      foreignColumns: [knowledgeDocuments.tenantId, knowledgeDocuments.id],
      name: "knowledge_chunks_tenant_document_fk",
    }).onDelete("cascade"),
  ],
);

export const knowledgeConflicts = pgTable(
  "knowledge_conflicts",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // e.g. "service:root_canal" / attribute "price".
    subject: varchar("subject", { length: 128 }).notNull(),
    attribute: varchar("attribute", { length: 64 }).notNull(),
    // Hash of the competing (value, source) set — the same disagreement is
    // recorded once and its detectionCount bumped, not duplicated.
    signature: varchar("signature", { length: 64 }).notNull(),
    // "authority_wins" | "needs_confirmation" — how the engine behaves.
    resolution: varchar("resolution", { length: 32 }).notNull(),
    status: knowledgeConflictStatusEnum("status").notNull().default("open"),
    detail: jsonb("detail").notNull().$type<Record<string, unknown>>(),
    detectionCount: integer("detection_count").notNull().default(1),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true }).notNull().defaultNow(),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedBy: varchar("resolved_by", { length: 255 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("knowledge_conflicts_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("knowledge_conflicts_signature_key").on(
      table.tenantId,
      table.subject,
      table.attribute,
      table.signature,
    ),
  ],
);

// Answers "why did the receptionist say this?". One row per turn on which
// retrieval actually ran. Stores a REDACTED, truncated query (never the
// customer's phone number or email) and short evidence snippets — never a
// transcript.
export const knowledgeRetrievalLogs = pgTable(
  "knowledge_retrieval_logs",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    outcome: knowledgeOutcomeEnum("outcome").notNull(),
    queryRedacted: varchar("query_redacted", { length: 300 }).notNull(),
    topScore: real("top_score"),
    embeddingModel: varchar("embedding_model", { length: 128 }),
    evidence: jsonb("evidence").notNull().default([]).$type<RetrievalLogEvidence[]>(),
    conflicts: jsonb("conflicts").notNull().default([]).$type<RetrievalLogConflict[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("knowledge_retrieval_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("knowledge_retrieval_logs_conversation_idx").on(table.conversationId),
  ],
);

// --- Audit events -----------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_tenant_id_idx").on(table.tenantId),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
  ],
);

// --- Customer memory (Phase 4; see MEMORY_ENGINE.md) -----------------------

export const memoryKindEnum = pgEnum("memory_kind", [
  "preferred_name",
  "preferred_language",
  "scheduling_preference",
  "service_interest",
  "continuity",
]);
export const memoryStatusEnum = pgEnum("memory_status", ["active", "superseded", "invalidated", "deleted"]);
export const memorySourceEnum = pgEnum("memory_source", ["customer_stated", "staff_entered", "system_derived"]);

/**
 * One durable, provenance-bearing fact about ONE customer of ONE tenant.
 * At most one ACTIVE row per (tenant, customer, kind, slot) — enforced by the
 * partial unique index, so concurrent writers cannot create conflicting
 * active facts. Rows that leave `active` are scrubbed (value/display blanked)
 * and kept only as tombstones for accountability.
 */
export const customerMemories = pgTable(
  "customer_memories",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    kind: memoryKindEnum("kind").notNull(),
    slot: varchar("slot", { length: 80 }).notNull(),
    value: varchar("value", { length: 200 }).notNull(),
    display: varchar("display", { length: 200 }),
    status: memoryStatusEnum("status").notNull().default("active"),
    source: memorySourceEnum("source").notNull(),
    /** Phase 4 stores explicit statements only; inferred traits are never persisted. */
    provenance: varchar("provenance", { length: 16 }).notNull().default("explicit"),
    sourceMessageId: uuid("source_message_id").references(() => messages.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    statusReason: varchar("status_reason", { length: 64 }),
    supersededById: uuid("superseded_by_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customer_memories_active_slot_key")
      .on(table.tenantId, table.customerId, table.kind, table.slot)
      .where(sql`${table.status} = 'active'`),
    index("customer_memories_customer_idx").on(table.tenantId, table.customerId, table.status),
  ],
);

// --- Durable background jobs (Phase 5; see BACKGROUND_JOBS.md) --------------

export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "completed", "failed", "cancelled"]);

/**
 * One logical unit of background work for ONE tenant. Postgres is the source
 * of truth; workers claim rows with SKIP LOCKED, hold a lease, and fence every
 * write with `claim_token`. "Retrying" is `pending` with attempt_count > 0.
 */
export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobType: varchar("job_type", { length: 64 }).notNull(),
    payloadVersion: integer("payload_version").notNull().default(1),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** SHA-256 over (type, version, canonical payload): detects a reused idempotency key with different content. */
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    leaseOwner: varchar("lease_owner", { length: 100 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    claimToken: uuid("claim_token"),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    requeueCount: integer("requeue_count").notNull().default(0),
    /** Safe, small summary written by the handler (counts, "skipped: reason"). Never customer content. */
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorCode: varchar("error_code", { length: 64 }),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("background_jobs_tenant_idempotency_key").on(table.tenantId, table.idempotencyKey),
    index("background_jobs_due_idx").on(table.runAt).where(sql`${table.status} = 'pending'`),
    index("background_jobs_lease_idx").on(table.leaseExpiresAt).where(sql`${table.status} = 'running'`),
    index("background_jobs_tenant_status_idx").on(table.tenantId, table.status, table.runAt),
    check("background_jobs_attempts_ck", sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} >= 1`),
    check(
      "background_jobs_running_has_lease_ck",
      sql`${table.status} <> 'running' OR (${table.claimToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
  ],
);

/** Append-only execution history: one row per finished (or lost) attempt. Safe metadata only. */
export const backgroundJobAttempts = pgTable(
  "background_job_attempts",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => backgroundJobs.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    attempt: integer("attempt").notNull(),
    outcome: varchar("outcome", { length: 24 }).notNull(),
    errorCode: varchar("error_code", { length: 64 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms"),
  },
  (table) => [index("background_job_attempts_job_idx").on(table.tenantId, table.jobId, table.attempt)],
);
