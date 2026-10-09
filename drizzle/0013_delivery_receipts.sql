CREATE TABLE "outbox_delivery_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_message_id" varchar(255) NOT NULL,
	"status" varchar(16) NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"recipient" varchar(64),
	"error_code" varchar(64),
	"error_title" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "delivery_status" varchar(16);--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "delivery_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "delivery_error_code" varchar(64);--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "delivery_error_title" text;--> statement-breakpoint
ALTER TABLE "outbox_delivery_receipts" ADD CONSTRAINT "outbox_delivery_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_delivery_receipts_event_key" ON "outbox_delivery_receipts" USING btree ("tenant_id","provider_message_id","status","event_at");--> statement-breakpoint
CREATE INDEX "outbox_delivery_receipts_message_idx" ON "outbox_delivery_receipts" USING btree ("tenant_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "outbox_messages_tenant_provider_message_idx" ON "outbox_messages" USING btree ("tenant_id","provider_message_id") WHERE "outbox_messages"."provider_message_id" is not null;