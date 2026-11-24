CREATE TABLE "pro_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"stripe_customer_id" text,
	"subscription_checkout_attempt_id" text,
	"stripe_checkout_session_id" text,
	"subscription_checkout_attempt_created_at" timestamp with time zone,
	"closure_requested_at" timestamp with time zone,
	"provider_closure_pending" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_accounts_state_valid" CHECK ("pro_accounts"."state" in ('open','closed'))
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
ALTER TABLE "pro_disputes" ADD CONSTRAINT "pro_disputes_user_id_pro_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pro_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_subscriptions" ADD CONSTRAINT "pro_subscriptions_user_id_pro_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pro_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pro_accounts_customer_unique" ON "pro_accounts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "pro_disputes_hold_idx" ON "pro_disputes" USING btree ("user_id","hold_active");--> statement-breakpoint
CREATE INDEX "pro_subscriptions_user_idx" ON "pro_subscriptions" USING btree ("user_id");
