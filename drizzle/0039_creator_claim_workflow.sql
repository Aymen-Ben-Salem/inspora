ALTER TABLE "creator_claims" DROP CONSTRAINT "creator_claims_provider_not_blank";--> statement-breakpoint
ALTER TABLE "creator_claims" DROP CONSTRAINT "creator_claims_username_valid";--> statement-breakpoint
ALTER TABLE "creator_claims" DROP CONSTRAINT "creator_claims_status_valid";--> statement-breakpoint
ALTER TABLE "creator_claims" DROP CONSTRAINT "creator_claims_review_consistent";--> statement-breakpoint
DROP INDEX "creator_claims_request_unique";--> statement-breakpoint
ALTER TABLE "creator_claims" ALTER COLUMN "verified_x_provider_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_claims" ALTER COLUMN "verified_x_username" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_claims" ADD COLUMN "method" text DEFAULT 'x' NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_claims" ADD COLUMN "evidence_url" text;--> statement-breakpoint
ALTER TABLE "creator_claims" ADD COLUMN "evidence_note" text;--> statement-breakpoint
ALTER TABLE "creator_claims" ADD COLUMN "attention_reason" text;--> statement-breakpoint
ALTER TABLE "creator_claims" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_claims_pending_requester_unique" ON "creator_claims" USING btree ("requester_user_id") WHERE "creator_claims"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "creator_claims" ADD CONSTRAINT "creator_claims_evidence_valid" CHECK (
      ("creator_claims"."method" = 'x' and "creator_claims"."verified_x_provider_id" is not null and "creator_claims"."verified_x_username" is not null)
      or ("creator_claims"."method" in ('manual', 'ownership_report') and "creator_claims"."verified_x_provider_id" is null and "creator_claims"."verified_x_username" is null
        and "creator_claims"."evidence_url" is not null and "creator_claims"."evidence_note" is not null
        and length(trim("creator_claims"."evidence_url")) > 0 and length(trim("creator_claims"."evidence_note")) >= 20)
    );--> statement-breakpoint
ALTER TABLE "creator_claims" ADD CONSTRAINT "creator_claims_provider_not_blank" CHECK ("creator_claims"."verified_x_provider_id" is null or length(trim("creator_claims"."verified_x_provider_id")) > 0);--> statement-breakpoint
ALTER TABLE "creator_claims" ADD CONSTRAINT "creator_claims_username_valid" CHECK ("creator_claims"."verified_x_username" is null or "creator_claims"."verified_x_username" ~ '^[a-z0-9_]{1,15}$');--> statement-breakpoint
ALTER TABLE "creator_claims" ADD CONSTRAINT "creator_claims_status_valid" CHECK ("creator_claims"."status" in ('pending', 'approved', 'rejected', 'withdrawn', 'resolved'));--> statement-breakpoint
ALTER TABLE "creator_claims" ADD CONSTRAINT "creator_claims_review_consistent" CHECK (("creator_claims"."status" in ('pending', 'withdrawn') and "creator_claims"."reviewed_at" is null and "creator_claims"."reviewed_by" is null) or ("creator_claims"."status" in ('approved', 'rejected', 'resolved') and "creator_claims"."reviewed_at" is not null and "creator_claims"."reviewed_by" is not null));