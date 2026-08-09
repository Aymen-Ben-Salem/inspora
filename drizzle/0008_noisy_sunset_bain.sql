ALTER TABLE "creators" DROP CONSTRAINT "creators_avatar_storage_consistent";--> statement-breakpoint
ALTER TABLE "post_media" DROP CONSTRAINT "post_media_storage_consistent";--> statement-breakpoint
ALTER TABLE "post_media" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "post_media" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "post_media" ADD COLUMN "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "post_media" ADD COLUMN "poster_storage_key" text;--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_avatar_storage_consistent" CHECK (("creators"."avatar_storage_provider" is null and "creators"."avatar_storage_key" is null) or ("creators"."avatar_storage_provider" in ('cloudinary', 'r2') and length(trim("creators"."avatar_storage_key")) > 0));--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_size_valid" CHECK ("post_media"."size_bytes" is null or "post_media"."size_bytes" > 0);--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_poster_storage_consistent" CHECK ("post_media"."poster_storage_key" is null or ("post_media"."storage_provider" = 'r2' and "post_media"."poster_url" is not null and length(trim("post_media"."poster_storage_key")) > 0));--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_storage_consistent" CHECK (("post_media"."storage_provider" is null and "post_media"."storage_key" is null) or ("post_media"."storage_provider" in ('cloudinary', 'r2') and length(trim("post_media"."storage_key")) > 0));