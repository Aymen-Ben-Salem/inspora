ALTER TABLE "sponsor_accounts" ADD COLUMN "paid_at" timestamp with time zone;
--> statement-breakpoint
-- A one-time month starts at the verified charge timestamp. Subscription
-- periods may start before payment, so their dates are filled by reconciliation.
UPDATE "sponsor_accounts" SET "paid_at" = "period_start"
WHERE "billing_mode" = 'one_time';
