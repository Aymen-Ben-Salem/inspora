import "server-only";

import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { PUBLISHED_LOGOS_CACHE_TAG } from "@/data/logos-repository";
import { PUBLISHED_POSTS_CACHE_TAG } from "@/data/posts-repository";
import {
  completeWebsiteRecordingPredicate,
  PUBLISHED_WEBSITES_CACHE_TAG,
} from "@/data/websites-repository";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";

import { ANALYTICS_EVENTS } from "./events";
import {
  getPostHogConfiguration,
  runHogQlQuery,
  type HogQlQueryRequest,
} from "./posthog-query";

export type CreatorViewsResult =
  | { status: "available"; count: number; asOf: string }
  | { status: "unavailable" };

export type WorkViewFixture = {
  kind: "design" | "logo" | "website";
  workId: string;
  sessionId: string;
};

type EligibleWorkIds = Record<WorkViewFixture["kind"], string[]>;

type EligibleWorkRow = {
  id: string;
  kind: WorkViewFixture["kind"];
};

const CREATOR_VIEWS_CACHE_LIFE = {
  stale: 300,
  revalidate: 300,
  expire: 3600,
} as const;

const creatorIdSchema = z.uuid();
const workIdSchema = z.uuid();
const lastSuccessfulViews = new Map<string, Extract<CreatorViewsResult, { status: "available" }>>();

function emptyEligibleWorkIds(): EligibleWorkIds {
  return { design: [], logo: [], website: [] };
}

function parseEligibleWorkRows(rows: unknown[]): EligibleWorkIds {
  const eligible = emptyEligibleWorkIds();

  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Partial<EligibleWorkRow>;
    if (
      (row.kind !== "design" && row.kind !== "logo" && row.kind !== "website") ||
      !workIdSchema.safeParse(row.id).success
    ) {
      continue;
    }
    if (!eligible[row.kind].includes(row.id as string)) {
      eligible[row.kind].push(row.id as string);
    }
  }

  return eligible;
}

async function getEligibleCreatorWorkIds(creatorId: string) {
  const database = getDatabase();
  if (!database) throw new Error("Creator views database is not configured.");
  const now = new Date();
  const result = await database.execute(sql`
    select 'design' as kind, ${sql.raw('"posts"."id"')} as id
    from ${sql.raw('"posts"')}
    where ${sql.raw('"posts"."creator_id"')} = ${creatorId}::uuid
      and ${sql.raw('"posts"."status"')} = 'published'
      and ${sql.raw('"posts"."published_at"')} <= ${now}
    union all
    select 'logo' as kind, ${sql.raw('"logos"."id"')} as id
    from ${sql.raw('"logos"')}
    where ${sql.raw('"logos"."creator_id"')} = ${creatorId}::uuid
      and ${sql.raw('"logos"."status"')} = 'published'
      and ${sql.raw('"logos"."published_at"')} <= ${now}
    union all
    select 'website' as kind, ${sql.raw('"websites"."id"')} as id
    from ${sql.raw('"websites"')}
    where ${sql.raw('"websites"."creator_id"')} = ${creatorId}::uuid
      and ${sql.raw('"websites"."status"')} = 'published'
      and ${sql.raw('"websites"."published_at"')} <= ${now}
      and (${completeWebsiteRecordingPredicate()})
  `);

  return parseEligibleWorkRows(result.rows);
}

function configuredCutover() {
  const value = process.env.POSTHOG_WORK_VIEWS_CUTOVER_AT?.trim();
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error("POSTHOG_WORK_VIEWS_CUTOVER_AT is not configured.");
  }
  return new Date(value).toISOString();
}

export function buildCreatorViewsQuery(
  eligible: EligibleWorkIds,
  cutoverAt: string,
): HogQlQueryRequest {
  return {
    name: "Inspora creator published-work views",
    query: `SELECT uniqExact(work_kind, work_id, session_id) AS views
      FROM (
        SELECT
          'design' AS work_kind,
          toString(properties.post_id) AS work_id,
          toString(properties.$session_id) AS session_id
        FROM events
        WHERE event = {legacy_event}
          AND timestamp < parseDateTimeBestEffort({cutover_at})
          AND toString(properties.post_id) IN {design_ids}
          AND notEmpty(toString(properties.$session_id))
        UNION ALL
        SELECT
          toString(properties.work_kind) AS work_kind,
          toString(properties.work_id) AS work_id,
          toString(properties.$session_id) AS session_id
        FROM events
        WHERE event = {unified_event}
          AND timestamp >= parseDateTimeBestEffort({cutover_at})
          AND notEmpty(toString(properties.$session_id))
          AND (
            (toString(properties.work_kind) = 'design'
              AND toString(properties.work_id) IN {design_ids})
            OR (toString(properties.work_kind) = 'logo'
              AND toString(properties.work_id) IN {logo_ids})
            OR (toString(properties.work_kind) = 'website'
              AND toString(properties.work_id) IN {website_ids})
          )
      )`,
    values: {
      legacy_event: ANALYTICS_EVENTS.postOpened,
      unified_event: ANALYTICS_EVENTS.workOpened,
      cutover_at: cutoverAt,
      design_ids: eligible.design,
      logo_ids: eligible.logo,
      website_ids: eligible.website,
    },
  };
}

export function parseCreatorViewsRows(rows: unknown[][]) {
  const value = rows[0]?.[0];
  const count =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("PostHog returned an unexpected creator views aggregate.");
  }
  return count;
}

async function getCachedCreatorViews(creatorId: string) {
  "use cache";

  cacheLife(CREATOR_VIEWS_CACHE_LIFE);
  cacheTag(
    PUBLIC_CREATOR_PROFILES_CACHE_TAG,
    PUBLISHED_POSTS_CACHE_TAG,
    PUBLISHED_LOGOS_CACHE_TAG,
    PUBLISHED_WEBSITES_CACHE_TAG,
  );

  const configuration = getPostHogConfiguration();
  if (!configuration) throw new Error("PostHog creator views are not configured.");
  const eligible = await getEligibleCreatorWorkIds(creatorId);
  const hasEligibleWork = Object.values(eligible).some((ids) => ids.length > 0);
  if (!hasEligibleWork) {
    return {
      status: "available",
      count: 0,
      asOf: new Date().toISOString(),
    } satisfies CreatorViewsResult;
  }

  const rows = await runHogQlQuery(
    configuration,
    buildCreatorViewsQuery(eligible, configuredCutover()),
  );
  return {
    status: "available",
    count: parseCreatorViewsRows(rows),
    asOf: new Date().toISOString(),
  } satisfies CreatorViewsResult;
}

export async function getCreatorViews(
  creatorId: string,
): Promise<CreatorViewsResult> {
  if (!creatorIdSchema.safeParse(creatorId).success) {
    return { status: "unavailable" };
  }

  try {
    const result = await getCachedCreatorViews(creatorId);
    if (result.status === "available") lastSuccessfulViews.set(creatorId, result);
    return result;
  } catch {
    return lastSuccessfulViews.get(creatorId) ?? { status: "unavailable" };
  }
}
