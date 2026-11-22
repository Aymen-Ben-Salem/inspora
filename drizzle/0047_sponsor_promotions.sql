-- Idempotent: Preview receives this table ahead of the unapplied 0046
-- migration, so a later full migration must find it already in place.
CREATE TABLE IF NOT EXISTS "sponsor_promotions" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"label" jsonb,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_promotions_revision_valid" CHECK ("sponsor_promotions"."revision" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sponsor_promotions" ADD CONSTRAINT "sponsor_promotions_account_id_sponsor_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sponsor_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
