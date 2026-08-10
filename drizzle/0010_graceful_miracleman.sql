CREATE TABLE "media_migration_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"source_provider" text NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"target_snapshot" jsonb,
	"error" text,
	"migrated_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"source_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_migration_audits_resource_type_valid" CHECK ("media_migration_audits"."resource_type" in ('post_media', 'creator_avatar')),
	CONSTRAINT "media_migration_audits_status_valid" CHECK ("media_migration_audits"."status" in ('uploaded', 'migrated', 'failed', 'rolled_back', 'source_deleted')),
	CONSTRAINT "media_migration_audits_source_provider_valid" CHECK ("media_migration_audits"."source_provider" = 'cloudinary')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "media_migration_audits_resource_unique" ON "media_migration_audits" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "media_migration_audits_status_idx" ON "media_migration_audits" USING btree ("status");