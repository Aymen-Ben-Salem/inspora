CREATE TABLE "profile_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"submission_id" uuid NOT NULL,
	"kind" text DEFAULT 'submission_accepted' NOT NULL,
	"published_kind" text NOT NULL,
	"published_id" uuid NOT NULL,
	"published_href" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "profile_messages_kind_valid" CHECK ("profile_messages"."kind" = 'submission_accepted'),
	CONSTRAINT "profile_messages_published_work_valid" CHECK ("profile_messages"."published_kind" in ('design', 'logo', 'website') and length(trim("profile_messages"."published_href")) > 0)
);
--> statement-breakpoint
ALTER TABLE "profile_messages" ADD CONSTRAINT "profile_messages_owner_user_id_profile_accounts_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profile_accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_messages" ADD CONSTRAINT "profile_messages_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_messages_submission_acceptance_unique" ON "profile_messages" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "profile_messages_owner_visible_idx" ON "profile_messages" USING btree ("owner_user_id","dismissed_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "profile_messages_published_work_idx" ON "profile_messages" USING btree ("published_kind","published_id");