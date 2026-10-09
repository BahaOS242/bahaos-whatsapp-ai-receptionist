CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "background_job_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"outcome" varchar(24) NOT NULL,
	"error_code" varchar(64),
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_type" varchar(64) NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"lease_owner" varchar(100),
	"lease_expires_at" timestamp with time zone,
	"claim_token" uuid,
	"idempotency_key" varchar(200) NOT NULL,
	"requeue_count" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error_code" varchar(64),
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "background_jobs_attempts_ck" CHECK ("background_jobs"."attempt_count" >= 0 AND "background_jobs"."max_attempts" >= 1),
	CONSTRAINT "background_jobs_running_has_lease_ck" CHECK ("background_jobs"."status" <> 'running' OR ("background_jobs"."claim_token" IS NOT NULL AND "background_jobs"."lease_expires_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "background_job_attempts" ADD CONSTRAINT "background_job_attempts_job_id_background_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."background_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_job_attempts" ADD CONSTRAINT "background_job_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "background_job_attempts_job_idx" ON "background_job_attempts" USING btree ("tenant_id","job_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_tenant_idempotency_key" ON "background_jobs" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "background_jobs_due_idx" ON "background_jobs" USING btree ("run_at") WHERE "background_jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "background_jobs_lease_idx" ON "background_jobs" USING btree ("lease_expires_at") WHERE "background_jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "background_jobs_tenant_status_idx" ON "background_jobs" USING btree ("tenant_id","status","run_at");