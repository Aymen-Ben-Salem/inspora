CREATE TABLE "design_categories" (
	"name" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_categories_name_valid" CHECK (length("design_categories"."name") between 1 and 60 and "design_categories"."name" = trim("design_categories"."name") and lower("design_categories"."name") not in ('all', 'logos', 'websites', 'app-icons', 'in-review'))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_resource_type_valid";--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_category_valid";--> statement-breakpoint
CREATE UNIQUE INDEX "design_categories_name_lower_unique" ON "design_categories" USING btree (lower("name"));--> statement-breakpoint
-- Seed the existing categories before validating references on existing posts.
INSERT INTO "design_categories" ("name") VALUES
  ('Web'), ('Branding'), ('Product'), ('Motion'), ('Illustration'), ('3D'), ('Print');
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_design_categories_name_fk" FOREIGN KEY ("category") REFERENCES "public"."design_categories"("name") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_resource_type_valid" CHECK ("admin_audit_logs"."resource_type" in ('post', 'logo', 'website', 'subscriber', 'sponsor', 'creator', 'creator_claim', 'category'));