CREATE TABLE "creator_view_snapshots" (
	"key" text PRIMARY KEY NOT NULL,
	"eligibility_fingerprint" text NOT NULL,
	"count" bigint NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	CONSTRAINT "creator_view_snapshot_count_valid" CHECK ("creator_view_snapshots"."count" >= 0 and "creator_view_snapshots"."count" <= 9007199254740991)
);
