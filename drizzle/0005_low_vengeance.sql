ALTER TABLE "language_observations" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "language_observations" ADD COLUMN "context" text;--> statement-breakpoint
ALTER TABLE "language_observations" ADD COLUMN "outcome" varchar(64);