CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'retry_wait', 'sent', 'dead_letter');--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"channel" varchar(32) DEFAULT 'whatsapp' NOT NULL,
	"provider" varchar(32) DEFAULT 'meta_cloud' NOT NULL,
	"message_type" varchar(32) DEFAULT 'text' NOT NULL,
	"recipient" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"seq" bigserial NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"claim_token" uuid,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"provider_message_id" varchar(255),
	"last_error" text,
	"error_code" varchar(64),
	"error_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_messages_tenant_idempotency_key" ON "outbox_messages" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_messages_message_id_key" ON "outbox_messages" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_messages_seq_key" ON "outbox_messages" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "outbox_messages_due_idx" ON "outbox_messages" USING btree ("available_at") WHERE "outbox_messages"."status" in ('pending','retry_wait');--> statement-breakpoint
CREATE INDEX "outbox_messages_lease_idx" ON "outbox_messages" USING btree ("lease_expires_at") WHERE "outbox_messages"."status" = 'processing';--> statement-breakpoint
CREATE INDEX "outbox_messages_conversation_open_idx" ON "outbox_messages" USING btree ("conversation_id","seq") WHERE "outbox_messages"."status" in ('pending','processing','retry_wait');--> statement-breakpoint
CREATE INDEX "outbox_messages_tenant_status_idx" ON "outbox_messages" USING btree ("tenant_id","status");--> statement-breakpoint
-- Cut-over: messages still waiting in the OLD retry mechanism
-- (messages.status = 'retry_pending', drained by the removed
-- outbound-retry-worker) are carried into the outbox so an in-flight retry
-- is not stranded by this deploy. Idempotent by construction (the
-- idempotency key is derived from the message id; re-running inserts nothing).
INSERT INTO "outbox_messages"
  ("id","tenant_id","conversation_id","customer_id","message_id","recipient","payload","status",
   "idempotency_key","attempt_count","available_at","last_error")
SELECT gen_random_uuid(), m."tenant_id", m."conversation_id", c."customer_id", m."id", cu."whatsapp_id",
       jsonb_build_object('body', m."content"), 'retry_wait',
       'legacy-retry:' || m."id"::text, m."outbound_attempts",
       COALESCE(m."next_retry_at", now()), m."last_error"
FROM "messages" m
JOIN "conversations" c ON c."id" = m."conversation_id"
JOIN "customers" cu ON cu."id" = c."customer_id"
WHERE m."direction" = 'outbound' AND m."status"::text = 'retry_pending'  -- ::text: a fresh install adds this enum value earlier in the SAME migration transaction, where using the enum literal is illegal
ORDER BY m."created_at", m."id"  -- seq is assigned in insert order: keep per-conversation message order
ON CONFLICT DO NOTHING;
