CREATE TABLE "cleanup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cleanup_jobs_kind_valid" CHECK ("cleanup_jobs"."kind" in ('delete_private_upload', 'delete_public_orphan', 'delete_account')),
	CONSTRAINT "cleanup_jobs_target_not_blank" CHECK (length(trim("cleanup_jobs"."target_id")) > 0),
	CONSTRAINT "cleanup_jobs_idempotency_not_blank" CHECK (length(trim("cleanup_jobs"."idempotency_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "submission_quota_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"submission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submission_quota_events_expiry_valid" CHECK ("submission_quota_events"."expires_at" > "submission_quota_events"."created_at")
);
--> statement-breakpoint
CREATE TABLE "submission_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"staging_key" text NOT NULL,
	"object_key" text,
	"derivative_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"verified_content_type" text,
	"verified_size_bytes" integer,
	"digest" text,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"attached_submission_id" uuid,
	"attached_at" timestamp with time zone,
	"discarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_uploads_kind_valid" CHECK ("submission_uploads"."kind" in ('design', 'logo')),
	CONSTRAINT "submission_uploads_state_valid" CHECK ("submission_uploads"."state" in ('pending', 'completed', 'discarded')),
	CONSTRAINT "submission_uploads_size_valid" CHECK ("submission_uploads"."size_bytes" > 0),
	CONSTRAINT "submission_uploads_verified_size_valid" CHECK ("submission_uploads"."verified_size_bytes" is null or "submission_uploads"."verified_size_bytes" > 0),
	CONSTRAINT "submission_uploads_completed_consistent" CHECK (("submission_uploads"."state" = 'completed' and "submission_uploads"."object_key" is not null and "submission_uploads"."verified_content_type" is not null and "submission_uploads"."verified_size_bytes" is not null and "submission_uploads"."digest" is not null and "submission_uploads"."digest" ~ '^[0-9a-f]{64}$' and "submission_uploads"."completed_at" is not null) or ("submission_uploads"."state" <> 'completed')),
	CONSTRAINT "submission_uploads_attachment_consistent" CHECK (("submission_uploads"."attached_submission_id" is null and "submission_uploads"."attached_at" is null) or ("submission_uploads"."attached_submission_id" is not null and "submission_uploads"."attached_at" is not null and "submission_uploads"."state" = 'completed'))
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_url" text,
	"upload_id" uuid,
	"source_fingerprint" text NOT NULL,
	"status" text DEFAULT 'in_review' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"published_kind" text,
	"published_id" uuid,
	"published_href" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_kind_valid" CHECK ("submissions"."kind" in ('design', 'logo', 'website', 'app-icon')),
	CONSTRAINT "submissions_status_valid" CHECK ("submissions"."status" in ('in_review', 'accepted', 'rejected')),
	CONSTRAINT "submissions_exactly_one_source" CHECK (num_nonnulls("submissions"."source_url", "submissions"."upload_id") = 1),
	CONSTRAINT "submissions_rejection_consistent" CHECK (("submissions"."status" = 'rejected' and "submissions"."rejection_reason" is not null and length(trim("submissions"."rejection_reason")) > 0 and "submissions"."reviewed_at" is not null and "submissions"."reviewed_by" is not null) or ("submissions"."status" <> 'rejected' and "submissions"."rejection_reason" is null)),
	CONSTRAINT "submissions_acceptance_consistent" CHECK (("submissions"."status" = 'accepted' and "submissions"."reviewed_at" is not null and "submissions"."reviewed_by" is not null and "submissions"."published_kind" is not null and "submissions"."published_id" is not null and "submissions"."published_href" is not null) or ("submissions"."status" <> 'accepted' and "submissions"."published_kind" is null and "submissions"."published_id" is null and "submissions"."published_href" is null)),
	CONSTRAINT "submissions_published_kind_valid" CHECK ("submissions"."published_kind" is null or "submissions"."published_kind" in ('design', 'logo', 'website'))
);
--> statement-breakpoint
ALTER TABLE "submission_quota_events" ADD CONSTRAINT "submission_quota_events_owner_user_id_profile_accounts_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profile_accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_uploads" ADD CONSTRAINT "submission_uploads_owner_user_id_profile_accounts_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profile_accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_owner_user_id_profile_accounts_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profile_accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_upload_id_submission_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."submission_uploads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cleanup_jobs_idempotency_unique" ON "cleanup_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "cleanup_jobs_not_before_idx" ON "cleanup_jobs" USING btree ("not_before");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_quota_events_submission_unique" ON "submission_quota_events" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submission_quota_events_owner_expiry_idx" ON "submission_quota_events" USING btree ("owner_user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_uploads_owner_request_unique" ON "submission_uploads" USING btree ("owner_user_id","request_id");--> statement-breakpoint
CREATE INDEX "submission_uploads_owner_active_idx" ON "submission_uploads" USING btree ("owner_user_id","state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_uploads_object_key_unique" ON "submission_uploads" USING btree ("object_key") WHERE "submission_uploads"."object_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_uploads_attached_submission_unique" ON "submission_uploads" USING btree ("attached_submission_id") WHERE "submission_uploads"."attached_submission_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_owner_request_unique" ON "submissions" USING btree ("owner_user_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_upload_unique" ON "submissions" USING btree ("upload_id") WHERE "submissions"."upload_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_owner_active_fingerprint_unique" ON "submissions" USING btree ("owner_user_id","source_fingerprint") WHERE "submissions"."status" in ('in_review', 'accepted');--> statement-breakpoint
CREATE INDEX "submissions_owner_status_created_idx" ON "submissions" USING btree ("owner_user_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submissions_status_created_idx" ON "submissions" USING btree ("status","created_at");