ALTER TABLE "cleanup_jobs" DROP CONSTRAINT "cleanup_jobs_kind_valid";--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ADD COLUMN "assets" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cleanup_jobs" ADD CONSTRAINT "cleanup_jobs_kind_valid" CHECK ("cleanup_jobs"."kind" in ('delete_private_upload', 'delete_public_orphan', 'delete_account', 'delete_creator_media'));