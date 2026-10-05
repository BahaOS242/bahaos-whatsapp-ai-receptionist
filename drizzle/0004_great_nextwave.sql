CREATE TYPE "public"."language_observation_status" AS ENUM('observed', 'customer_confirmed', 'repeated', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "language_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phrase" varchar(255) NOT NULL,
	"normalized_meaning" varchar(255) NOT NULL,
	"intent" varchar(128) NOT NULL,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"confidence" real,
	"source_conversation_id" uuid,
	"observation_count" integer DEFAULT 1 NOT NULL,
	"confirmation_count" integer DEFAULT 0 NOT NULL,
	"status" "language_observation_status" DEFAULT 'observed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "language_observations" ADD CONSTRAINT "language_observations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "language_observations" ADD CONSTRAINT "language_observations_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "language_observations_tenant_id_idx" ON "language_observations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "language_observations_tenant_status_idx" ON "language_observations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "language_observations_tenant_phrase_idx" ON "language_observations" USING btree ("tenant_id","phrase");