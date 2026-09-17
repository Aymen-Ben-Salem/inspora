ALTER TABLE "saved_posts" ALTER COLUMN "post_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_posts" ADD COLUMN "logo_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_posts" ADD COLUMN "website_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_logo_id_logos_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."logos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_posts_user_logo_unique" ON "saved_posts" USING btree ("user_id","logo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_posts_user_website_unique" ON "saved_posts" USING btree ("user_id","website_id");--> statement-breakpoint
ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_exactly_one_target" CHECK (num_nonnulls("saved_posts"."post_id", "saved_posts"."logo_id", "saved_posts"."website_id") = 1);