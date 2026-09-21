CREATE TABLE "submission_publication_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"published_kind" text,
	"published_id" uuid,
	"published_href" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_publication_attempts_actor_not_blank" CHECK (length(trim("submission_publication_attempts"."actor_id")) > 0),
	CONSTRAINT "submission_publication_attempts_status_valid" CHECK ("submission_publication_attempts"."status" in ('prepared', 'attached', 'cleanup')),
	CONSTRAINT "submission_publication_attempts_attachment_consistent" CHECK (("submission_publication_attempts"."status" = 'attached' and "submission_publication_attempts"."published_kind" is not null and "submission_publication_attempts"."published_id" is not null and "submission_publication_attempts"."published_href" is not null) or ("submission_publication_attempts"."status" <> 'attached' and "submission_publication_attempts"."published_kind" is null and "submission_publication_attempts"."published_id" is null and "submission_publication_attempts"."published_href" is null))
);
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_rejection_consistent";--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "submissions"
SET "rejected_at" = "reviewed_at",
    "expires_at" = "reviewed_at" + interval '48 hours'
WHERE "status" = 'rejected';--> statement-breakpoint
CREATE INDEX "submission_publication_attempts_submission_status_idx" ON "submission_publication_attempts" USING btree ("submission_id","status");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_rejection_consistent" CHECK (("submissions"."status" = 'rejected' and "submissions"."rejection_reason" is not null and length(trim("submissions"."rejection_reason")) > 0 and "submissions"."reviewed_at" is not null and "submissions"."reviewed_by" is not null and "submissions"."rejected_at" is not null and "submissions"."expires_at" = "submissions"."rejected_at" + interval '48 hours') or ("submissions"."status" <> 'rejected' and "submissions"."rejection_reason" is null and "submissions"."rejected_at" is null and "submissions"."expires_at" is null));
