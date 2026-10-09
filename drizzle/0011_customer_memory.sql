CREATE TYPE "public"."memory_kind" AS ENUM('preferred_name', 'preferred_language', 'scheduling_preference', 'service_interest', 'continuity');--> statement-breakpoint
CREATE TYPE "public"."memory_source" AS ENUM('customer_stated', 'staff_entered', 'system_derived');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('active', 'superseded', 'invalidated', 'deleted');--> statement-breakpoint
CREATE TABLE "customer_memories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" "memory_kind" NOT NULL,
	"slot" varchar(80) NOT NULL,
	"value" varchar(200) NOT NULL,
	"display" varchar(200),
	"status" "memory_status" DEFAULT 'active' NOT NULL,
	"source" "memory_source" NOT NULL,
	"provenance" varchar(16) DEFAULT 'explicit' NOT NULL,
	"source_message_id" uuid,
	"conversation_id" uuid,
	"expires_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone,
	"status_reason" varchar(64),
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_memories" ADD CONSTRAINT "customer_memories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memories" ADD CONSTRAINT "customer_memories_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memories" ADD CONSTRAINT "customer_memories_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memories" ADD CONSTRAINT "customer_memories_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_memories_active_slot_key" ON "customer_memories" USING btree ("tenant_id","customer_id","kind","slot") WHERE "customer_memories"."status" = 'active';--> statement-breakpoint
CREATE INDEX "customer_memories_customer_idx" ON "customer_memories" USING btree ("tenant_id","customer_id","status");