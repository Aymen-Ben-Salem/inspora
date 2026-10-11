CREATE TABLE "analytics_rate_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"events" integer NOT NULL,
	"receipts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_rate_buckets_expiry_idx" ON "analytics_rate_buckets" USING btree ("expires_at");