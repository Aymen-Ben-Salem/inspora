CREATE TABLE "sponsor_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"state" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"paid_through" timestamp with time zone,
	"period_start" timestamp with time zone,
	"recovery_deadline" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_accounts_state_valid" CHECK ("sponsor_accounts"."state" in ('active','recovery','inactive','revoked','deleting'))
);--> statement-breakpoint
CREATE TABLE "sponsor_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"checkout_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"staging_key" text NOT NULL,
	"object_key" text,
	"digest" text,
	"width" integer,
	"height" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_assets_kind_valid" CHECK ("sponsor_assets"."kind" in ('media','icon','wordmark','poster','video-preview','variant')),
	CONSTRAINT "sponsor_assets_state_valid" CHECK ("sponsor_assets"."state" in ('pending','verified','deleting')),
	CONSTRAINT "sponsor_assets_size_valid" CHECK ("sponsor_assets"."size_bytes" > 0 and "sponsor_assets"."size_bytes" <= 52428800),
	CONSTRAINT "sponsor_assets_dimensions_valid" CHECK (("sponsor_assets"."width" is null and "sponsor_assets"."height" is null) or ("sponsor_assets"."width" > 0 and "sponsor_assets"."height" > 0)),
	CONSTRAINT "sponsor_assets_verified_complete" CHECK ("sponsor_assets"."state" <> 'verified' or ("sponsor_assets"."object_key" is not null and "sponsor_assets"."digest" is not null and "sponsor_assets"."digest" ~ '^[a-f0-9]{64}$' and "sponsor_assets"."width" is not null and "sponsor_assets"."height" is not null and "sponsor_assets"."width" > 0 and "sponsor_assets"."height" > 0))
);--> statement-breakpoint
CREATE TABLE "sponsor_campaign_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"revision" integer NOT NULL,
	"creative" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_versions_revision_valid" CHECK ("sponsor_campaign_versions"."revision" > 0)
);--> statement-breakpoint
CREATE TABLE "sponsor_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"campaign_id" uuid,
	"state" text DEFAULT 'preparing' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"snapshot" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_checkouts_state_valid" CHECK ("sponsor_checkouts"."state" in ('preparing','ready','reserved','expired','completed')),
	CONSTRAINT "sponsor_checkouts_revision_valid" CHECK ("sponsor_checkouts"."revision" >= 0)
);--> statement-breakpoint
CREATE TABLE "sponsor_identities" (
	"user_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'allowed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_identities_state_valid" CHECK ("sponsor_identities"."state" in ('allowed','revoked','deleting'))
);--> statement-breakpoint
CREATE TABLE "sponsor_seats" (
	"slot" integer PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'free' NOT NULL,
	"account_id" uuid,
	"checkout_id" uuid,
	"reserved_until" timestamp with time zone,
	CONSTRAINT "sponsor_seats_slot_valid" CHECK ("sponsor_seats"."slot" between 1 and 4),
	CONSTRAINT "sponsor_seats_state_valid" CHECK ("sponsor_seats"."state" in ('free','reserved','occupied','releasing')),
	CONSTRAINT "sponsor_seats_binding_valid" CHECK (("sponsor_seats"."state" = 'free' and "sponsor_seats"."account_id" is null and "sponsor_seats"."checkout_id" is null and "sponsor_seats"."reserved_until" is null) or ("sponsor_seats"."state" = 'reserved' and "sponsor_seats"."checkout_id" is not null and "sponsor_seats"."account_id" is null and "sponsor_seats"."reserved_until" is not null) or ("sponsor_seats"."state" in ('occupied','releasing') and "sponsor_seats"."account_id" is not null))
);--> statement-breakpoint
CREATE TABLE "sponsor_version_assets" (
	"version_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "campaign_state" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "internal_name" text;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "wordmark_url" text;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "wordmark_storage_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_accounts_owner_unique" ON "sponsor_accounts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_accounts_id_owner_unique" ON "sponsor_accounts" USING btree ("id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_accounts_subscription_unique" ON "sponsor_accounts" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_assets_id_owner_unique" ON "sponsor_assets" USING btree ("id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_assets_staging_unique" ON "sponsor_assets" USING btree ("staging_key");--> statement-breakpoint
CREATE INDEX "sponsor_assets_expiry_idx" ON "sponsor_assets" USING btree ("state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_versions_campaign_revision_unique" ON "sponsor_campaign_versions" USING btree ("campaign_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_versions_id_owner_unique" ON "sponsor_campaign_versions" USING btree ("id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_checkouts_id_owner_unique" ON "sponsor_checkouts" USING btree ("id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_checkouts_one_open_per_owner" ON "sponsor_checkouts" USING btree ("owner_user_id") WHERE "sponsor_checkouts"."state" in ('preparing','ready','reserved');--> statement-breakpoint
CREATE INDEX "sponsor_checkouts_expiry_idx" ON "sponsor_checkouts" USING btree ("state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_seats_account_unique" ON "sponsor_seats" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_seats_checkout_unique" ON "sponsor_seats" USING btree ("checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_version_assets_unique" ON "sponsor_version_assets" USING btree ("version_id","asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsors_id_owner_unique" ON "sponsors" USING btree ("id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsors_one_published_per_account" ON "sponsors" USING btree ("account_id") WHERE "sponsors"."campaign_state" = 'published';--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_campaign_state_valid" CHECK ("sponsors"."campaign_state" in ('legacy','prepared','draft','published','archived'));--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_owned_legacy_inactive" CHECK (("sponsors"."owner_user_id" is null and "sponsors"."account_id" is null and "sponsors"."campaign_state" = 'legacy') or ("sponsors"."owner_user_id" is not null and "sponsors"."campaign_state" <> 'legacy' and not "sponsors"."is_active"));--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_revision_valid" CHECK ("sponsors"."revision" >= 0);--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_published_has_account" CHECK ("sponsors"."campaign_state" <> 'published' or "sponsors"."account_id" is not null);--> statement-breakpoint
ALTER TABLE "sponsor_accounts" ADD CONSTRAINT "sponsor_accounts_owner_user_id_sponsor_identities_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."sponsor_identities"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_assets" ADD CONSTRAINT "sponsor_assets_owner_user_id_sponsor_identities_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."sponsor_identities"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_assets" ADD CONSTRAINT "sponsor_assets_checkout_id_sponsor_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."sponsor_checkouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_assets" ADD CONSTRAINT "sponsor_assets_checkout_owner_fk" FOREIGN KEY ("checkout_id","owner_user_id") REFERENCES "public"."sponsor_checkouts"("id","owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_campaign_versions" ADD CONSTRAINT "sponsor_campaign_versions_campaign_id_sponsors_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."sponsors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_campaign_versions" ADD CONSTRAINT "sponsor_campaign_versions_owner_user_id_sponsor_identities_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."sponsor_identities"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_campaign_versions" ADD CONSTRAINT "sponsor_versions_campaign_owner_fk" FOREIGN KEY ("campaign_id","owner_user_id") REFERENCES "public"."sponsors"("id","owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD CONSTRAINT "sponsor_checkouts_owner_user_id_sponsor_identities_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."sponsor_identities"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD CONSTRAINT "sponsor_checkouts_campaign_id_sponsors_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."sponsors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD CONSTRAINT "sponsor_checkouts_campaign_owner_fk" FOREIGN KEY ("campaign_id","owner_user_id") REFERENCES "public"."sponsors"("id","owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_seats" ADD CONSTRAINT "sponsor_seats_account_id_sponsor_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sponsor_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_seats" ADD CONSTRAINT "sponsor_seats_checkout_id_sponsor_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."sponsor_checkouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_version_assets" ADD CONSTRAINT "sponsor_version_assets_version_id_sponsor_campaign_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."sponsor_campaign_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_version_assets" ADD CONSTRAINT "sponsor_version_assets_asset_id_sponsor_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."sponsor_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_version_assets" ADD CONSTRAINT "sponsor_version_assets_version_owner_fk" FOREIGN KEY ("version_id","owner_user_id") REFERENCES "public"."sponsor_campaign_versions"("id","owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_version_assets" ADD CONSTRAINT "sponsor_version_assets_asset_owner_fk" FOREIGN KEY ("asset_id","owner_user_id") REFERENCES "public"."sponsor_assets"("id","owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_owner_user_id_sponsor_identities_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."sponsor_identities"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_account_id_sponsor_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sponsor_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_account_owner_fk" FOREIGN KEY ("account_id","owner_user_id") REFERENCES "public"."sponsor_accounts"("id","owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO sponsor_seats (slot) VALUES (1), (2), (3), (4);--> statement-breakpoint
CREATE FUNCTION protect_owned_sponsor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN
    RAISE EXCEPTION 'Sponsor ownership is immutable';
  END IF;
  IF ((TG_OP = 'INSERT' AND NEW.owner_user_id IS NOT NULL) OR
      (TG_OP <> 'INSERT' AND OLD.owner_user_id IS NOT NULL)) AND
      current_setting('inspora.sponsor_writer', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Owned sponsor requires authorized writer';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER sponsors_owned_write_guard BEFORE INSERT OR UPDATE OR DELETE ON sponsors
FOR EACH ROW EXECUTE FUNCTION protect_owned_sponsor();--> statement-breakpoint
CREATE FUNCTION protect_sponsor_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Sponsor versions are immutable'; END IF;
  IF current_setting('inspora.sponsor_writer', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Sponsor version requires authorized writer';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER sponsor_versions_write_guard BEFORE INSERT OR UPDATE OR DELETE ON sponsor_campaign_versions
FOR EACH ROW EXECUTE FUNCTION protect_sponsor_version();
