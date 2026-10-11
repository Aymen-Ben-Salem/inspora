CREATE TABLE "analytics_events" (
	"occurrence_id" uuid PRIMARY KEY NOT NULL,
	"dedup_key" text,
	"kind" text NOT NULL,
	"page_id" uuid NOT NULL,
	"campaign_id" uuid,
	"version_id" uuid,
	"placement" text,
	"milestone" integer,
	"occurred_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visitor_key" text,
	"country_code" text,
	"device" text NOT NULL,
	"referrer_domain" text,
	CONSTRAINT "analytics_events_kind_valid" CHECK ("analytics_events"."kind" in ('site_page_view','sponsor_impression','sponsor_click','sponsor_preview_started','sponsor_preview_view','sponsor_preview_progress')),
	CONSTRAINT "analytics_events_binding_valid" CHECK (("analytics_events"."kind" = 'site_page_view' and "analytics_events"."campaign_id" is null and "analytics_events"."version_id" is null and "analytics_events"."placement" is null) or ("analytics_events"."kind" <> 'site_page_view' and "analytics_events"."campaign_id" is not null and "analytics_events"."version_id" is not null and "analytics_events"."placement" in ('header','feed','detail'))),
	CONSTRAINT "analytics_events_device_valid" CHECK ("analytics_events"."device" in ('desktop','mobile','tablet','unknown')),
	CONSTRAINT "analytics_events_milestone_valid" CHECK (("analytics_events"."kind" = 'sponsor_preview_progress' and "analytics_events"."milestone" in (25,50,75,100)) or ("analytics_events"."kind" <> 'sponsor_preview_progress' and "analytics_events"."milestone" is null))
);
--> statement-breakpoint
CREATE TABLE "analytics_identity_epochs" (
	"month" text PRIMARY KEY NOT NULL,
	"encrypted_secret" text NOT NULL,
	"destroy_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_occurrences" (
	"occurrence_id" uuid PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_reports" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"filter" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"refresh_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_delivery_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	CONSTRAINT "sponsor_delivery_interval_valid" CHECK ("sponsor_delivery_intervals"."end_at" is null or "sponsor_delivery_intervals"."end_at" >= "sponsor_delivery_intervals"."start_at")
);
--> statement-breakpoint
CREATE TABLE "sponsor_delivery_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"payment_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"base_amount" integer NOT NULL,
	"currency" text NOT NULL,
	CONSTRAINT "sponsor_delivery_period_valid" CHECK ("sponsor_delivery_periods"."end_at" > "sponsor_delivery_periods"."start_at" and "sponsor_delivery_periods"."base_amount" >= 0 and "sponsor_delivery_periods"."currency" in ('usd','eur'))
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_campaign_id_sponsors_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."sponsors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_version_id_sponsor_campaign_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."sponsor_campaign_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_delivery_intervals" ADD CONSTRAINT "sponsor_delivery_intervals_account_id_sponsor_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sponsor_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_delivery_intervals" ADD CONSTRAINT "sponsor_delivery_intervals_campaign_id_sponsors_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."sponsors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_delivery_intervals" ADD CONSTRAINT "sponsor_delivery_intervals_version_id_sponsor_campaign_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."sponsor_campaign_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_delivery_periods" ADD CONSTRAINT "sponsor_delivery_periods_account_id_sponsor_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sponsor_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_events_dedup_unique" ON "analytics_events" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "analytics_events_campaign_time_idx" ON "analytics_events" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_time_idx" ON "analytics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_visitor_accepted_idx" ON "analytics_events" USING btree ("visitor_key","accepted_at");--> statement-breakpoint
CREATE INDEX "sponsor_delivery_intervals_account_time_idx" ON "sponsor_delivery_intervals" USING btree ("account_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_delivery_one_open_unique" ON "sponsor_delivery_intervals" USING btree ("account_id") WHERE "sponsor_delivery_intervals"."end_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_delivery_period_payment_unique" ON "sponsor_delivery_periods" USING btree ("payment_id");
--> statement-breakpoint
-- One current interval per paid seat. Existing campaigns begin measurement at
-- migration time; previous publication durations are deliberately not invented.
CREATE FUNCTION sync_sponsor_delivery_interval(target uuid, stop_at timestamptz DEFAULT NULL) RETURNS void AS $$
DECLARE campaign uuid; version uuid; paid_until timestamptz; current_interval sponsor_delivery_intervals%ROWTYPE; at_time timestamptz := clock_timestamp();
BEGIN
  SELECT s.id,v.id,a.paid_through INTO campaign,version,paid_until
  FROM sponsor_accounts a JOIN sponsor_identities i ON i.user_id=a.owner_user_id
  JOIN sponsor_seats seat ON seat.account_id=a.id AND seat.state='occupied'
  JOIN sponsors s ON s.account_id=a.id AND s.campaign_state='published' AND s.deleted_at IS NULL
  JOIN sponsor_campaign_versions v ON v.campaign_id=s.id AND v.revision=s.revision
  WHERE a.id=target AND a.state='active' AND i.state='allowed' AND a.paid_through>at_time;
  SELECT * INTO current_interval FROM sponsor_delivery_intervals WHERE account_id=target AND end_at IS NULL FOR UPDATE;
  IF current_interval.id IS NOT NULL AND (version IS NULL OR current_interval.version_id<>version OR stop_at IS NOT NULL) THEN
    UPDATE sponsor_delivery_intervals SET end_at=greatest(start_at,least(at_time,coalesce(stop_at,at_time))) WHERE id=current_interval.id;
    current_interval.id := NULL;
  END IF;
  IF version IS NOT NULL AND current_interval.id IS NULL THEN
    INSERT INTO sponsor_delivery_intervals(account_id,campaign_id,version_id,start_at) VALUES(target,campaign,version,at_time);
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE FUNCTION observe_sponsor_delivery_change() RETURNS trigger AS $$
DECLARE target uuid; previous_end timestamptz;
BEGIN
  IF TG_TABLE_NAME='sponsors' THEN target:=NEW.account_id;
  ELSIF TG_TABLE_NAME='sponsor_campaign_versions' THEN SELECT account_id INTO target FROM sponsors WHERE id=NEW.campaign_id;
  ELSIF TG_TABLE_NAME='sponsor_identities' THEN SELECT id INTO target FROM sponsor_accounts WHERE owner_user_id=NEW.user_id;
  ELSE
    target:=NEW.id;
    IF OLD.paid_through IS NOT NULL AND OLD.paid_through<clock_timestamp() THEN previous_end:=OLD.paid_through; END IF;
  END IF;
  IF target IS NOT NULL THEN PERFORM sync_sponsor_delivery_interval(target,previous_end); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER sponsor_delivery_campaign AFTER INSERT OR UPDATE ON sponsors FOR EACH ROW EXECUTE FUNCTION observe_sponsor_delivery_change();
--> statement-breakpoint
CREATE TRIGGER sponsor_delivery_version AFTER INSERT ON sponsor_campaign_versions FOR EACH ROW EXECUTE FUNCTION observe_sponsor_delivery_change();
--> statement-breakpoint
CREATE TRIGGER sponsor_delivery_account AFTER UPDATE ON sponsor_accounts FOR EACH ROW EXECUTE FUNCTION observe_sponsor_delivery_change();
--> statement-breakpoint
CREATE TRIGGER sponsor_delivery_identity AFTER UPDATE ON sponsor_identities FOR EACH ROW EXECUTE FUNCTION observe_sponsor_delivery_change();
--> statement-breakpoint
SELECT sync_sponsor_delivery_interval(id) FROM sponsor_accounts;
--> statement-breakpoint
CREATE FUNCTION enforce_analytics_version_binding() RETURNS trigger AS $$
BEGIN
  IF NEW.version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sponsor_campaign_versions WHERE id=NEW.version_id AND campaign_id=NEW.campaign_id) THEN RAISE EXCEPTION 'Invalid analytics version binding'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER analytics_version_binding BEFORE INSERT ON analytics_events FOR EACH ROW EXECUTE FUNCTION enforce_analytics_version_binding();
