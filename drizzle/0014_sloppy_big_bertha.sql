CREATE TABLE "logo_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"logo_id" uuid NOT NULL,
	"url" text NOT NULL,
	"storage_provider" text,
	"storage_key" text,
	"mime_type" text,
	"source_mime_type" text,
	"size_bytes" integer,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logo_media_storage_consistent" CHECK (("logo_media"."storage_provider" is null and "logo_media"."storage_key" is null) or ("logo_media"."storage_provider" = 'r2' and length(trim("logo_media"."storage_key")) > 0)),
	CONSTRAINT "logo_media_size_valid" CHECK ("logo_media"."size_bytes" is null or "logo_media"."size_bytes" > 0),
	CONSTRAINT "logo_media_dimensions_valid" CHECK ("logo_media"."width" > 0 and "logo_media"."height" > 0)
);
--> statement-breakpoint
CREATE TABLE "logos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'logo' NOT NULL,
	"creator_id" uuid NOT NULL,
	"description" text NOT NULL,
	"industry" text NOT NULL,
	"colors" text[] DEFAULT '{}'::text[] NOT NULL,
	"styles" text[] DEFAULT '{}'::text[] NOT NULL,
	"shape" text NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logos_slug_format" CHECK ("logos"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "logos_title_not_blank" CHECK (length(trim("logos"."title")) > 0),
	CONSTRAINT "logos_kind_valid" CHECK ("logos"."kind" in ('logo', 'icon')),
	CONSTRAINT "logos_industry_not_blank" CHECK (length(trim("logos"."industry")) > 0),
	CONSTRAINT "logos_shape_not_blank" CHECK (length(trim("logos"."shape")) > 0),
	CONSTRAINT "logos_status_valid" CHECK ("logos"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "logos_published_at_required" CHECK ("logos"."status" <> 'published' or "logos"."published_at" is not null),
	CONSTRAINT "logos_archived_at_consistent" CHECK (("logos"."status" = 'archived' and "logos"."archived_at" is not null) or ("logos"."status" <> 'archived' and "logos"."archived_at" is null))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_resource_type_valid";--> statement-breakpoint
ALTER TABLE "logo_media" ADD CONSTRAINT "logo_media_logo_id_logos_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."logos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logos" ADD CONSTRAINT "logos_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "logo_media_logo_unique" ON "logo_media" USING btree ("logo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "logos_slug_unique" ON "logos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "logos_kind_created_at_idx" ON "logos" USING btree ("kind","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "logos"."status" = 'published';--> statement-breakpoint
CREATE INDEX "logos_created_at_idx" ON "logos" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "logos"."status" = 'published';--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_resource_type_valid" CHECK ("admin_audit_logs"."resource_type" in ('post', 'logo', 'subscriber', 'sponsor'));