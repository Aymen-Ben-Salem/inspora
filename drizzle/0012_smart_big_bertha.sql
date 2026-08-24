CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"tagline" text,
	"media_type" text DEFAULT 'image' NOT NULL,
	"media_url" text,
	"media_poster_url" text,
	"media_storage_provider" text,
	"media_storage_key" text,
	"media_poster_storage_key" text,
	"media_width" integer DEFAULT 1200 NOT NULL,
	"media_height" integer DEFAULT 800 NOT NULL,
	"media_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media_alt" text DEFAULT '' NOT NULL,
	"icon_url" text,
	"icon_storage_provider" text,
	"icon_storage_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsors_title_not_blank" CHECK (length(trim("sponsors"."title")) > 0),
	CONSTRAINT "sponsors_url_not_blank" CHECK (length(trim("sponsors"."url")) > 0),
	CONSTRAINT "sponsors_media_type_valid" CHECK ("sponsors"."media_type" in ('image', 'video')),
	CONSTRAINT "sponsors_media_dimensions_valid" CHECK ("sponsors"."media_width" > 0 and "sponsors"."media_height" > 0),
	CONSTRAINT "sponsors_media_storage_consistent" CHECK (("sponsors"."media_storage_provider" is null and "sponsors"."media_storage_key" is null) or ("sponsors"."media_storage_provider" = 'r2' and length(trim("sponsors"."media_storage_key")) > 0)),
	CONSTRAINT "sponsors_icon_storage_consistent" CHECK (("sponsors"."icon_storage_provider" is null and "sponsors"."icon_storage_key" is null) or ("sponsors"."icon_storage_provider" = 'r2' and length(trim("sponsors"."icon_storage_key")) > 0))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_resource_type_valid";--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_resource_type_valid" CHECK ("admin_audit_logs"."resource_type" in ('post', 'subscriber', 'sponsor'));