CREATE TYPE "public"."knowledge_authority" AS ENUM('human_approved', 'approved_document', 'unreviewed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_conflict_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_doc_status" AS ENUM('draft', 'pending_review', 'approved', 'superseded', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."knowledge_doc_type" AS ENUM('faq', 'policy', 'article', 'document');--> statement-breakpoint
CREATE TYPE "public"."knowledge_outcome" AS ENUM('grounded', 'no_evidence', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_kind" AS ENUM('manual', 'document', 'website', 'import');--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"section" varchar(512),
	"content" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flagged_injection" boolean DEFAULT false NOT NULL,
	"embedding" real[],
	"embedding_model" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_conflicts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject" varchar(128) NOT NULL,
	"attribute" varchar(64) NOT NULL,
	"signature" varchar(64) NOT NULL,
	"resolution" varchar(32) NOT NULL,
	"status" "knowledge_conflict_status" DEFAULT 'open' NOT NULL,
	"detail" jsonb NOT NULL,
	"detection_count" integer DEFAULT 1 NOT NULL,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" varchar(255),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"doc_key" varchar(128) NOT NULL,
	"version" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"doc_type" "knowledge_doc_type" NOT NULL,
	"status" "knowledge_doc_status" DEFAULT 'draft' NOT NULL,
	"authority" "knowledge_authority" DEFAULT 'unreviewed' NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"body" text NOT NULL,
	"effective_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"approved_by" varchar(255),
	"approved_at" timestamp with time zone,
	"superseded_by_document_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_retrieval_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid,
	"outcome" "knowledge_outcome" NOT NULL,
	"query_redacted" varchar(300) NOT NULL,
	"top_score" real,
	"embedding_model" varchar(128),
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "knowledge_source_kind" NOT NULL,
	"title" varchar(255) NOT NULL,
	"origin" varchar(1024),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The composite (tenant_id, id) unique indexes MUST exist before the composite foreign keys below reference them
-- (hand-ordered; drizzle-kit emits indexes last). They are what stops a chunk/document from ever pointing at another tenant.
CREATE UNIQUE INDEX "knowledge_sources_tenant_id_id_key" ON "knowledge_sources" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_tenant_id_id_key" ON "knowledge_documents" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_tenant_document_fk" FOREIGN KEY ("tenant_id","document_id") REFERENCES "public"."knowledge_documents"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_tenant_source_fk" FOREIGN KEY ("tenant_id","source_id") REFERENCES "public"."knowledge_sources"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_retrieval_logs" ADD CONSTRAINT "knowledge_retrieval_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_retrieval_logs" ADD CONSTRAINT "knowledge_retrieval_logs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_tenant_id_idx" ON "knowledge_chunks" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_document_ordinal_key" ON "knowledge_chunks" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE INDEX "knowledge_conflicts_tenant_status_idx" ON "knowledge_conflicts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_conflicts_signature_key" ON "knowledge_conflicts" USING btree ("tenant_id","subject","attribute","signature");--> statement-breakpoint
CREATE INDEX "knowledge_documents_tenant_id_idx" ON "knowledge_documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_tenant_status_idx" ON "knowledge_documents" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_tenant_key_version_key" ON "knowledge_documents" USING btree ("tenant_id","doc_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_one_approved_per_key" ON "knowledge_documents" USING btree ("tenant_id","doc_key") WHERE "knowledge_documents"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "knowledge_retrieval_logs_tenant_created_idx" ON "knowledge_retrieval_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_retrieval_logs_conversation_idx" ON "knowledge_retrieval_logs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_tenant_id_idx" ON "knowledge_sources" USING btree ("tenant_id");
