ALTER TABLE "sponsor_assets" DROP CONSTRAINT "sponsor_assets_kind_valid";--> statement-breakpoint
ALTER TABLE "sponsor_assets" ADD COLUMN "source_asset_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_assets_id_owner_checkout_unique" ON "sponsor_assets" USING btree ("id","owner_user_id","checkout_id");--> statement-breakpoint
ALTER TABLE "sponsor_assets" ADD CONSTRAINT "sponsor_assets_source_owner_checkout_fk" FOREIGN KEY ("source_asset_id","owner_user_id","checkout_id") REFERENCES "public"."sponsor_assets"("id","owner_user_id","checkout_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_assets" ADD CONSTRAINT "sponsor_assets_source_valid" CHECK ("sponsor_assets"."source_asset_id" is null or ("sponsor_assets"."source_asset_id" <> "sponsor_assets"."id" and "sponsor_assets"."kind" <> 'original'));--> statement-breakpoint
ALTER TABLE "sponsor_assets" ADD CONSTRAINT "sponsor_assets_kind_valid" CHECK ("sponsor_assets"."kind" in ('original','media','icon','wordmark','poster','video-preview','variant'));
