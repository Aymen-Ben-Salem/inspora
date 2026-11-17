CREATE TABLE "pro_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"stripe_customer_id" text,
	"subscription_checkout_attempt_id" text,
	"stripe_checkout_session_id" text,
	"subscription_checkout_attempt_created_at" timestamp with time zone,
	"included_balance" integer DEFAULT 0 NOT NULL,
	"included_period_key" text,
	"included_period_start" timestamp with time zone,
	"included_period_end" timestamp with time zone,
	"purchased_balance" integer DEFAULT 0 NOT NULL,
	"auto_recharge_enabled" boolean DEFAULT false NOT NULL,
	"auto_recharge_cap_cents" integer,
	"auto_recharge_consented_at" timestamp with time zone,
	"auto_recharge_subscription_id" text,
	"auto_recharge_notice" text,
	"closure_requested_at" timestamp with time zone,
	"provider_closure_pending" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_accounts_state_valid" CHECK ("pro_accounts"."state" in ('open','closed')),
	CONSTRAINT "pro_accounts_balances_valid" CHECK ("pro_accounts"."included_balance" >= 0 and "pro_accounts"."purchased_balance" >= 0),
	CONSTRAINT "pro_accounts_cap_valid" CHECK ("pro_accounts"."auto_recharge_cap_cents" is null or "pro_accounts"."auto_recharge_cap_cents" in (500,1000,2000,5000)),
	CONSTRAINT "pro_accounts_recharge_consent" CHECK (not "pro_accounts"."auto_recharge_enabled" or ("pro_accounts"."auto_recharge_cap_cents" is not null and "pro_accounts"."auto_recharge_consented_at" is not null and "pro_accounts"."auto_recharge_subscription_id" is not null)),
	CONSTRAINT "pro_accounts_notice_valid" CHECK ("pro_accounts"."auto_recharge_notice" is null or "pro_accounts"."auto_recharge_notice" in ('cap_insufficient','payment_failed','payment_method_missing'))
);
--> statement-breakpoint
CREATE TABLE "pro_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"bucket" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reservation_id" uuid,
	"purchase_id" uuid,
	"source_ref" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_ledger_bucket_valid" CHECK ("pro_credit_ledger"."bucket" in ('included','purchased')),
	CONSTRAINT "pro_ledger_kind_valid" CHECK ("pro_credit_ledger"."kind" in ('monthly_grant','monthly_expiry','pack_grant','usage_hold','usage_release','refund_reversal','closure_forfeit','adjustment')),
	CONSTRAINT "pro_ledger_amount_valid" CHECK ("pro_credit_ledger"."amount" <> 0 and "pro_credit_ledger"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pro_credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"operation_key" text NOT NULL,
	"feature" text NOT NULL,
	"credits" integer NOT NULL,
	"included_amount" integer NOT NULL,
	"purchased_amount" integer NOT NULL,
	"included_period_key" text,
	"state" text DEFAULT 'reserved' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"result_count" integer,
	"settled_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_reservations_state_valid" CHECK ("pro_credit_reservations"."state" in ('reserved','settled','released')),
	CONSTRAINT "pro_reservations_feature_valid" CHECK ("pro_credit_reservations"."feature" in ('mcp_search')),
	CONSTRAINT "pro_reservations_amounts_valid" CHECK ("pro_credit_reservations"."credits" > 0 and "pro_credit_reservations"."included_amount" >= 0 and "pro_credit_reservations"."purchased_amount" >= 0 and "pro_credit_reservations"."included_amount" + "pro_credit_reservations"."purchased_amount" = "pro_credit_reservations"."credits")
);
--> statement-breakpoint
CREATE TABLE "pro_disputes" (
	"stripe_dispute_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"hold_active" boolean DEFAULT true NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"credits" integer NOT NULL,
	"base_amount_cents" integer NOT NULL,
	"reserved_amount_cents" integer,
	"charged_amount_cents" integer,
	"refunded_amount_cents" integer DEFAULT 0 NOT NULL,
	"refund_processed_credits" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"cap_period_start" timestamp with time zone,
	"stripe_checkout_session_id" text,
	"stripe_invoice_id" text,
	"stripe_payment_intent_id" text,
	"failure_code" text,
	"granted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_purchases_kind_valid" CHECK ("pro_purchases"."kind" in ('manual','automatic')),
	CONSTRAINT "pro_purchases_state_valid" CHECK ("pro_purchases"."state" in ('pending','processing','succeeded','failed','canceled','cap_blocked')),
	CONSTRAINT "pro_purchases_amounts_valid" CHECK ("pro_purchases"."credits" > 0 and "pro_purchases"."base_amount_cents" > 0 and ("pro_purchases"."reserved_amount_cents" is null or "pro_purchases"."reserved_amount_cents" > 0) and ("pro_purchases"."charged_amount_cents" is null or "pro_purchases"."charged_amount_cents" > 0) and "pro_purchases"."refunded_amount_cents" >= 0 and ("pro_purchases"."charged_amount_cents" is null or "pro_purchases"."refunded_amount_cents" <= "pro_purchases"."charged_amount_cents")),
	CONSTRAINT "pro_purchases_currency_valid" CHECK ("pro_purchases"."currency" = 'usd'),
	CONSTRAINT "pro_purchases_refund_processed_valid" CHECK ("pro_purchases"."refund_processed_credits" >= 0 and "pro_purchases"."refund_processed_credits" <= "pro_purchases"."credits"),
	CONSTRAINT "pro_purchases_automatic_cap" CHECK ("pro_purchases"."kind" <> 'automatic' or ("pro_purchases"."cap_period_start" is not null and "pro_purchases"."reserved_amount_cents" is not null))
);
--> statement-breakpoint
CREATE TABLE "pro_stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"object_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pro_subscriptions" (
	"stripe_subscription_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"price_id" text NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"paid_through" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_subscriptions_period_valid" CHECK ("pro_subscriptions"."current_period_end" > "pro_subscriptions"."current_period_start")
);
--> statement-breakpoint
ALTER TABLE "pro_credit_ledger" ADD CONSTRAINT "pro_credit_ledger_user_id_pro_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pro_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_credit_ledger" ADD CONSTRAINT "pro_credit_ledger_reservation_id_pro_credit_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."pro_credit_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_credit_ledger" ADD CONSTRAINT "pro_credit_ledger_purchase_id_pro_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."pro_purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_credit_reservations" ADD CONSTRAINT "pro_credit_reservations_user_id_pro_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pro_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_disputes" ADD CONSTRAINT "pro_disputes_user_id_pro_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pro_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_purchases" ADD CONSTRAINT "pro_purchases_user_id_pro_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pro_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_subscriptions" ADD CONSTRAINT "pro_subscriptions_user_id_pro_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pro_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pro_accounts_customer_unique" ON "pro_accounts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pro_ledger_idempotency_unique" ON "pro_credit_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "pro_ledger_user_idx" ON "pro_credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pro_reservations_operation_unique" ON "pro_credit_reservations" USING btree ("user_id","operation_key");--> statement-breakpoint
CREATE INDEX "pro_reservations_open_idx" ON "pro_credit_reservations" USING btree ("user_id","state","expires_at");--> statement-breakpoint
CREATE INDEX "pro_disputes_hold_idx" ON "pro_disputes" USING btree ("user_id","hold_active");--> statement-breakpoint
CREATE INDEX "pro_purchases_user_idx" ON "pro_purchases" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pro_purchases_checkout_unique" ON "pro_purchases" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pro_purchases_invoice_unique" ON "pro_purchases" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pro_purchases_intent_unique" ON "pro_purchases" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pro_purchases_one_open_automatic" ON "pro_purchases" USING btree ("user_id") WHERE "pro_purchases"."kind" = 'automatic' and "pro_purchases"."state" in ('pending','processing');--> statement-breakpoint
CREATE INDEX "pro_subscriptions_user_idx" ON "pro_subscriptions" USING btree ("user_id");
