CREATE TABLE "editorial_budgets" (
	"period" text PRIMARY KEY NOT NULL,
	"spent_micros" integer DEFAULT 0 NOT NULL,
	"reserved_micros" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"actor_id" text NOT NULL,
	"environment" text NOT NULL,
	"period" text NOT NULL,
	"state" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"proposal" jsonb,
	"evidence" jsonb NOT NULL,
	"usage" jsonb,
	"cost_micros" integer,
	"decision" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_generations_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "work_editorial_notes" (
	"work_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"content_hash" text NOT NULL,
	"notes" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"generation_id" uuid NOT NULL,
	"reviewed_by" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "editorial_generations_period_state" ON "editorial_generations" USING btree ("period","state");
--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('public.inspora_mcp_public_catalog') IS NOT NULL THEN
    EXECUTE 'CREATE VIEW public.inspora_mcp_reviewed_notes WITH (security_barrier=true) AS SELECT n.work_id,n.kind,n.content_hash,n.notes,n.evidence,n.reviewed_at FROM public.work_editorial_notes n JOIN public.inspora_mcp_public_catalog c ON c.id=n.work_id AND c.kind=n.kind';
    REVOKE ALL ON public.inspora_mcp_reviewed_notes FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='inspora_catalog_reader') THEN
      GRANT SELECT ON public.inspora_mcp_reviewed_notes TO inspora_catalog_reader;
    END IF;
  END IF;
END $$;
