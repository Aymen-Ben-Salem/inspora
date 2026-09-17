CREATE TABLE "saved_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_posts_user_not_blank" CHECK (length(trim("saved_posts"."user_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_posts_user_post_unique" ON "saved_posts" USING btree ("user_id","post_id");--> statement-breakpoint
CREATE INDEX "saved_posts_user_created_at_idx" ON "saved_posts" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);