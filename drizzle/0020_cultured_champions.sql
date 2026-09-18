CREATE TABLE "creator_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_user_id" text NOT NULL,
	"target_creator_id" uuid NOT NULL,
	"verified_x_provider_id" text NOT NULL,
	"verified_x_username" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"review_reason" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_claims_provider_not_blank" CHECK (length(trim("creator_claims"."verified_x_provider_id")) > 0),
	CONSTRAINT "creator_claims_username_valid" CHECK ("creator_claims"."verified_x_username" ~ '^[a-z0-9_]{1,15}$'),
	CONSTRAINT "creator_claims_status_valid" CHECK ("creator_claims"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "creator_claims_review_consistent" CHECK (("creator_claims"."status" = 'pending' and "creator_claims"."reviewed_at" is null and "creator_claims"."reviewed_by" is null) or ("creator_claims"."status" <> 'pending' and "creator_claims"."reviewed_at" is not null and "creator_claims"."reviewed_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "creator_username_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"username" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_username_aliases_username_valid" CHECK ("creator_username_aliases"."username" ~ '^[a-z0-9_]{3,30}$')
);
--> statement-breakpoint
CREATE TABLE "profile_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_accounts_user_not_blank" CHECK (length(trim("profile_accounts"."user_id")) > 0),
	CONSTRAINT "profile_accounts_status_valid" CHECK ("profile_accounts"."status" in ('active', 'deleting'))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_resource_type_valid";--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "x_profile_url" text;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "x_provider_id" text;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "edited_fields" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "record_origin" text DEFAULT 'mirrored' NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_claims" ADD CONSTRAINT "creator_claims_requester_user_id_profile_accounts_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."profile_accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_claims" ADD CONSTRAINT "creator_claims_target_creator_id_creators_id_fk" FOREIGN KEY ("target_creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_username_aliases" ADD CONSTRAINT "creator_username_aliases_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_claims_request_unique" ON "creator_claims" USING btree ("requester_user_id","target_creator_id","verified_x_provider_id");--> statement-breakpoint
CREATE INDEX "creator_claims_status_created_idx" ON "creator_claims" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "creator_claims_target_status_idx" ON "creator_claims" USING btree ("target_creator_id","status");--> statement-breakpoint
CREATE INDEX "creator_claims_provider_idx" ON "creator_claims" USING btree ("verified_x_provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_username_aliases_lower_unique" ON "creator_username_aliases" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "creator_username_aliases_current_creator_unique" ON "creator_username_aliases" USING btree ("creator_id") WHERE "creator_username_aliases"."is_current" = true;--> statement-breakpoint
CREATE INDEX "creator_username_aliases_creator_idx" ON "creator_username_aliases" USING btree ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creators_owner_user_unique" ON "creators" USING btree ("owner_user_id") WHERE "creators"."owner_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "creators_username_lower_unique" ON "creators" USING btree (lower("username")) WHERE "creators"."username" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "creators_x_provider_unique" ON "creators" USING btree ("x_provider_id") WHERE "creators"."x_provider_id" is not null;--> statement-breakpoint
CREATE INDEX "creators_x_profile_lower_idx" ON "creators" USING btree (lower("x_profile_url"));--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_resource_type_valid" CHECK ("admin_audit_logs"."resource_type" in ('post', 'logo', 'website', 'subscriber', 'sponsor', 'creator', 'creator_claim'));--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_username_valid" CHECK ("creators"."username" is null or "creators"."username" ~ '^[a-z0-9_]{3,30}$');--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_edited_fields_valid" CHECK ("creators"."edited_fields" <@ array['name', 'username', 'avatarUrl', 'websiteUrl']::text[]);--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_record_origin_valid" CHECK ("creators"."record_origin" in ('mirrored', 'preview', 'development', 'editorial', 'user'));