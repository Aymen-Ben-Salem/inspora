-- Four structural slots are permanent configuration, never deletable inventory.
CREATE FUNCTION inspora_sponsor_seat_structure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.slot IS DISTINCT FROM OLD.slot THEN
    RAISE EXCEPTION 'Structural sponsor seats cannot be removed or renumbered' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sponsor_seat_structure BEFORE UPDATE OR DELETE ON sponsor_seats FOR EACH ROW EXECUTE FUNCTION inspora_sponsor_seat_structure();
--> statement-breakpoint
-- Deferred checks allow account insertion/seat occupancy in one transaction,
-- while rejecting a fifth active account or an account bound to a foreign checkout.
CREATE FUNCTION inspora_sponsor_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sponsor_accounts a WHERE a.state IN ('active','recovery')
    AND NOT EXISTS (SELECT 1 FROM sponsor_seats s WHERE s.account_id = a.id AND s.state = 'occupied')
  ) OR EXISTS (
    SELECT 1 FROM sponsor_seats s JOIN sponsor_accounts a ON a.id = s.account_id
    LEFT JOIN sponsor_checkouts c ON c.id = s.checkout_id
    WHERE s.account_id IS NOT NULL AND (c.id IS NULL OR c.owner_user_id <> a.owner_user_id OR c.stripe_subscription_id IS DISTINCT FROM a.stripe_subscription_id)
  ) THEN
    RAISE EXCEPTION 'Sponsor capacity or checkout owner binding is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sponsor_accounts_capacity AFTER INSERT OR UPDATE OR DELETE ON sponsor_accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inspora_sponsor_capacity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sponsor_seats_capacity AFTER INSERT OR UPDATE OR DELETE ON sponsor_seats DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inspora_sponsor_capacity();
--> statement-breakpoint
CREATE FUNCTION inspora_sponsor_checkout_pin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR (OLD.released_at IS NOT NULL AND NEW.released_at IS NULL)
    OR (OLD.state IN ('reserved','completed') AND (
      NEW.price_id IS DISTINCT FROM OLD.price_id
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
CREATE TRIGGER sponsor_checkout_pin BEFORE UPDATE ON sponsor_checkouts FOR EACH ROW EXECUTE FUNCTION inspora_sponsor_checkout_pin();
