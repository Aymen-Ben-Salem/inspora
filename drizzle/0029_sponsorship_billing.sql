CREATE TABLE "sponsor_billing_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"object_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_jobs_kind_valid" CHECK ("sponsor_jobs"."kind" in ('reconcile','event','delete_owner')),
	CONSTRAINT "sponsor_jobs_state_valid" CHECK ("sponsor_jobs"."state" in ('pending','running','complete')),
	CONSTRAINT "sponsor_jobs_attempts_valid" CHECK ("sponsor_jobs"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD COLUMN "stripe_session_id" text;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD COLUMN "price_id" text;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD COLUMN "payment_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD COLUMN "paid_invoice_id" text;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sponsor_checkouts" ADD COLUMN "exception_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_jobs_idempotency_unique" ON "sponsor_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "sponsor_jobs_ready_idx" ON "sponsor_jobs" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_checkouts_session_unique" ON "sponsor_checkouts" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_checkouts_subscription_unique" ON "sponsor_checkouts" USING btree ("stripe_subscription_id");