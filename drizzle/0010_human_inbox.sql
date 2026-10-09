ALTER TYPE "public"."conversation_status" ADD VALUE 'human_pending';--> statement-breakpoint
ALTER TYPE "public"."message_status" ADD VALUE 'suppressed';--> statement-breakpoint
ALTER TYPE "public"."outbox_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "handoff_reason" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "handoff_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ownership_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ownership_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "waiting_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "closed_by_staff_user_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "close_note" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author_staff_user_id" uuid;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "origin" varchar(16) DEFAULT 'ai' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "failed_login_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_sessions_token_hash_key" ON "staff_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_sessions_staff_user_idx" ON "staff_sessions" USING btree ("staff_user_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_by_staff_user_id_staff_users_id_fk" FOREIGN KEY ("closed_by_staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_staff_user_id_staff_users_id_fk" FOREIGN KEY ("author_staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_tenant_activity_idx" ON "conversations" USING btree ("tenant_id","last_activity_at");--> statement-breakpoint
-- Backfill (data-only on a NEW column; uses no new enum value): pre-existing
-- conversations would otherwise all show "last active" = the migration instant.
-- Idempotent: only rewrites rows to the true latest-message time.
UPDATE "conversations" c
   SET "last_activity_at" = COALESCE((SELECT max(m."created_at") FROM "messages" m WHERE m."conversation_id" = c."id"), c."created_at");
