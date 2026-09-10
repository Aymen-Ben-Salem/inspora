ALTER TABLE "website_media" DROP CONSTRAINT "website_media_role_valid";--> statement-breakpoint
ALTER TABLE "website_sections" DROP CONSTRAINT "website_sections_crop_valid";--> statement-breakpoint
ALTER TABLE "website_sections" ALTER COLUMN "top" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "website_sections" ALTER COLUMN "height" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "website_media" ADD COLUMN "poster_url" text;--> statement-breakpoint
ALTER TABLE "website_media" ADD COLUMN "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "website_media" ADD COLUMN "video_preview" jsonb;--> statement-breakpoint
ALTER TABLE "website_media" ADD COLUMN "poster_storage_key" text;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_storage_provider" text;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_storage_key" text;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_mime_type" text;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_source_mime_type" text;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_variants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_alt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_width" integer;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "image_height" integer;--> statement-breakpoint
ALTER TABLE "website_media" ADD CONSTRAINT "website_media_poster_storage_consistent" CHECK ("website_media"."poster_storage_key" is null or ("website_media"."storage_provider" = 'r2' and "website_media"."poster_url" is not null and length(trim("website_media"."poster_storage_key")) > 0));--> statement-breakpoint
ALTER TABLE "website_media" ADD CONSTRAINT "website_media_role_valid" CHECK ("website_media"."role" in ('full_page', 'recording', 'favicon'));--> statement-breakpoint
ALTER TABLE "website_sections" ADD CONSTRAINT "website_sections_image_storage_consistent" CHECK (("website_sections"."image_storage_provider" is null and "website_sections"."image_storage_key" is null) or ("website_sections"."image_storage_provider" = 'r2' and length(trim("website_sections"."image_storage_key")) > 0));--> statement-breakpoint
ALTER TABLE "website_sections" ADD CONSTRAINT "website_sections_image_size_valid" CHECK ("website_sections"."image_size_bytes" is null or "website_sections"."image_size_bytes" > 0);--> statement-breakpoint
ALTER TABLE "website_sections" ADD CONSTRAINT "website_sections_image_dimensions_valid" CHECK (("website_sections"."image_width" is null and "website_sections"."image_height" is null) or ("website_sections"."image_width" > 0 and "website_sections"."image_height" > 0));--> statement-breakpoint
ALTER TABLE "website_sections" ADD CONSTRAINT "website_sections_crop_valid" CHECK (("website_sections"."top" is null and "website_sections"."height" is null) or ("website_sections"."top" >= 0 and "website_sections"."height" > 0));