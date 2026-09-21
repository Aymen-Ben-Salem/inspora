CREATE TABLE "clerk_webhook_receipts" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clerk_webhook_receipts_event_not_blank" CHECK (length(trim("clerk_webhook_receipts"."event_id")) > 0),
	CONSTRAINT "clerk_webhook_receipts_type_valid" CHECK ("clerk_webhook_receipts"."event_type" = 'user.deleted')
);
--> statement-breakpoint
CREATE TABLE "submission_receipts" (
	"submission_id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_receipts_state_valid" CHECK ("submission_receipts"."state" = 'withdrawn')
);
--> statement-breakpoint
DROP INDEX "cleanup_jobs_not_before_idx";--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
UPDATE "cleanup_jobs" SET "next_attempt_at" = "not_before" WHERE "next_attempt_at" IS NULL;--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ALTER COLUMN "next_attempt_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "profile_accounts" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile_accounts" ADD COLUMN "deletion_error" text;--> statement-breakpoint
ALTER TABLE "submission_receipts" ADD CONSTRAINT "submission_receipts_owner_user_id_profile_accounts_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profile_accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_receipts_owner_request_unique" ON "submission_receipts" USING btree ("owner_user_id","request_id");--> statement-breakpoint
CREATE INDEX "submission_receipts_expiry_idx" ON "submission_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "cleanup_jobs_due_idx" ON "cleanup_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ADD CONSTRAINT "cleanup_jobs_status_valid" CHECK ("cleanup_jobs"."status" in ('pending', 'leased'));--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ADD CONSTRAINT "cleanup_jobs_attempts_valid" CHECK ("cleanup_jobs"."attempts" >= 0);
