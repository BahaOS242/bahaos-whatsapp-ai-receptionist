ALTER TYPE "public"."message_status" ADD VALUE 'retry_pending';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "outbound_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "messages_next_retry_at_idx" ON "messages" USING btree ("next_retry_at");