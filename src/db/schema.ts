import { randomUUID } from "node:crypto";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

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
export const conversationStatusEnum = pgEnum("conversation_status", [
  "ai_active",
  "staff_owned",
  "resolved",
]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const senderTypeEnum = pgEnum("sender_type", ["customer", "ai", "staff", "system"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "booked",
  "cancelled",
  "completed",
  "no_show",
]);
export const handoffStatusEnum = pgEnum("handoff_status", ["open", "claimed", "resolved"]);
export const actorTypeEnum = pgEnum("actor_type", ["ai", "staff", "system"]);
export const whatsappAccountStatusEnum = pgEnum("whatsapp_account_status", [
  "not_connected",
  "connected",
  "error",
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
    ...timestamps,
  },
  (table) => [
    uniqueIndex("staff_users_tenant_email_key").on(table.tenantId, table.email),
    index("staff_users_tenant_id_idx").on(table.tenantId),
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
    ...timestamps,
  },
  (table) => [
    index("conversations_tenant_id_idx").on(table.tenantId),
    index("conversations_tenant_status_idx").on(table.tenantId, table.status),
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
    status: messageStatusEnum("status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_tenant_id_idx").on(table.tenantId),
    uniqueIndex("messages_whatsapp_message_id_key").on(table.whatsappMessageId),
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
    ...timestamps,
  },
  (table) => [
    index("appointments_tenant_id_idx").on(table.tenantId),
    index("appointments_tenant_starts_at_idx").on(table.tenantId, table.startsAt),
    index("appointments_customer_id_idx").on(table.customerId),
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
    ...timestamps,
  },
  (table) => [
    index("handoffs_tenant_id_idx").on(table.tenantId),
    index("handoffs_tenant_status_idx").on(table.tenantId, table.status),
    index("handoffs_conversation_id_idx").on(table.conversationId),
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
