ALTER TABLE "sponsor_accounts" ADD COLUMN "billing_mode" text DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD COLUMN "billing_mode" text DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsor_accounts" ADD CONSTRAINT "sponsor_accounts_billing_mode_valid" CHECK ("sponsor_accounts"."billing_mode" in ('one_time','subscription'));--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD CONSTRAINT "sponsor_checkouts_billing_mode_valid" CHECK ("sponsor_checkouts"."billing_mode" in ('one_time','subscription'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION inspora_sponsor_checkout_pin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR (OLD.released_at IS NOT NULL AND NEW.released_at IS NULL)
    OR (OLD.state IN ('reserved','completed') AND (
      NEW.price_id IS DISTINCT FROM OLD.price_id
      OR NEW.billing_mode IS DISTINCT FROM OLD.billing_mode
      OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
      OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
      OR NEW.revision IS DISTINCT FROM OLD.revision
    ) AND NOT EXISTS (SELECT 1 FROM sponsor_identities WHERE user_id = OLD.owner_user_id AND state = 'deleting')) THEN
    RAISE EXCEPTION 'Pinned sponsor checkout cannot be changed or resurrected' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION inspora_sponsor_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sponsor_accounts a WHERE a.state IN ('active','recovery')
    AND NOT EXISTS (SELECT 1 FROM sponsor_seats s WHERE s.account_id = a.id AND s.state = 'occupied')
  ) OR EXISTS (
    SELECT 1 FROM sponsor_seats s JOIN sponsor_accounts a ON a.id = s.account_id
    LEFT JOIN sponsor_checkouts c ON c.id = s.checkout_id
    WHERE s.account_id IS NOT NULL AND (c.id IS NULL OR c.owner_user_id <> a.owner_user_id
      OR c.billing_mode <> a.billing_mode OR c.stripe_subscription_id IS DISTINCT FROM a.stripe_subscription_id)
  ) THEN
    RAISE EXCEPTION 'Sponsor capacity or checkout owner binding is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
