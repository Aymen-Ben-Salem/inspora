CREATE TABLE "website_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"role" text NOT NULL,
	"url" text NOT NULL,
	"storage_provider" text,
	"storage_key" text,
	"mime_type" text,
	"source_mime_type" text,
	"size_bytes" integer,
	"alt" text DEFAULT '' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_media_role_valid" CHECK ("website_media"."role" in ('full_page', 'favicon')),
	CONSTRAINT "website_media_storage_consistent" CHECK (("website_media"."storage_provider" is null and "website_media"."storage_key" is null) or ("website_media"."storage_provider" = 'r2' and length(trim("website_media"."storage_key")) > 0)),
	CONSTRAINT "website_media_size_valid" CHECK ("website_media"."size_bytes" is null or "website_media"."size_bytes" > 0),
	CONSTRAINT "website_media_dimensions_valid" CHECK ("website_media"."width" > 0 and "website_media"."height" > 0)
);
--> statement-breakpoint
CREATE TABLE "website_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"label" text NOT NULL,
	"top" integer NOT NULL,
	"height" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_sections_label_not_blank" CHECK (length(trim("website_sections"."label")) > 0),
	CONSTRAINT "website_sections_crop_valid" CHECK ("website_sections"."top" >= 0 and "website_sections"."height" > 0),
	CONSTRAINT "website_sections_position_valid" CHECK ("website_sections"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"tagline" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"description" text NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"colors" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "websites_slug_format" CHECK ("websites"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "websites_title_not_blank" CHECK (length(trim("websites"."title")) > 0),
	CONSTRAINT "websites_tagline_not_blank" CHECK (length(trim("websites"."tagline")) > 0),
	CONSTRAINT "websites_status_valid" CHECK ("websites"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "websites_published_at_required" CHECK ("websites"."status" <> 'published' or "websites"."published_at" is not null),
	CONSTRAINT "websites_archived_at_consistent" CHECK (("websites"."status" = 'archived' and "websites"."archived_at" is not null) or ("websites"."status" <> 'archived' and "websites"."archived_at" is null))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_resource_type_valid";--> statement-breakpoint
ALTER TABLE "website_media" ADD CONSTRAINT "website_media_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_sections" ADD CONSTRAINT "website_sections_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "website_media_website_role_unique" ON "website_media" USING btree ("website_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "website_sections_website_position_unique" ON "website_sections" USING btree ("website_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "websites_slug_unique" ON "websites" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "websites_created_at_idx" ON "websites" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "websites"."status" = 'published';--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_resource_type_valid" CHECK ("admin_audit_logs"."resource_type" in ('post', 'logo', 'website', 'subscriber', 'sponsor'));