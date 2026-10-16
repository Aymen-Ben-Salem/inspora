import "server-only";

import { createHash } from "node:crypto";
import { readViewSnapshot, writeViewSnapshot } from "./view-snapshots";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";

import { readWorkIdentities } from "@/data/public-work";
import { PUBLISHED_LOGOS_CACHE_TAG } from "@/data/logos-repository";
import { PUBLISHED_POSTS_CACHE_TAG } from "@/data/posts-repository";
import { PUBLISHED_WEBSITES_CACHE_TAG } from "@/data/websites-repository";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";

import { ANALYTICS_EVENTS } from "./events";
import {
  getPostHogConfiguration,
  runHogQlQuery,
  type HogQlQueryRequest,
} from "./posthog-query";

export type CreatorViewsResult =
  | { status: "available" | "stale"; count: number; asOf: string;
      eligibilityKey?: string; checkedAt?: string }
  | { status: "unavailable"; checkedAt?: string };

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
  stale: 30,
  revalidate: 60,
  expire: 120,
} as const;

const creatorIdSchema = z.uuid();
const workIdSchema = z.uuid();

function emptyEligibleWorkIds(): EligibleWorkIds {
  return { design: [], logo: [], website: [] };
}

function parseEligibleWorkRows(rows: unknown[]): EligibleWorkIds {
  const eligible = emptyEligibleWorkIds();

  for (const value of rows) {
    if (!value || typeof value !== "object")
      throw new Error("Invalid eligibility result.");
    const row = value as Partial<EligibleWorkRow>;
    if (
      (row.kind !== "design" &&
        row.kind !== "logo" &&
        row.kind !== "website") ||
      !workIdSchema.safeParse(row.id).success
    ) {
      throw new Error("Invalid eligibility result.");
    }
    if (!eligible[row.kind].includes(row.id as string)) {
      eligible[row.kind].push(row.id as string);
    }
  }

  for (const ids of Object.values(eligible)) ids.sort();
  return eligible;
}

export async function getEligibleCreatorWorkIds(creatorId: string) {
  return parseEligibleWorkRows(
    await readWorkIdentities({ scope: { kind: "creator", creatorId } }),
  );
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
  sessionCutoverAt?: string,
): HogQlQueryRequest {
  const sessionExpression = sessionCutoverAt
    ? `if(timestamp >= parseDateTimeBestEffort({session_cutover_at}) AND notEmpty(toString(properties.work_session_key)), concat('memory:',toString(properties.work_session_key)), toString(properties.$session_id))`
    : `toString(properties.$session_id)`;
  return {
    name: "Inspora creator published-work views",
    refresh: "force_blocking",
    query: `SELECT uniqExact(work_kind, work_id, session_id) AS views
      FROM (
        SELECT
          'design' AS work_kind,
          toString(properties.post_id) AS work_id,
          ${sessionExpression} AS session_id
        FROM events
        WHERE event = {legacy_event}
          AND timestamp < parseDateTimeBestEffort({cutover_at})
          AND toString(properties.post_id) IN {design_ids}
          AND notEmpty(${sessionExpression})
        UNION ALL
        SELECT
          toString(properties.work_kind) AS work_kind,
          toString(properties.work_id) AS work_id,
          ${sessionExpression} AS session_id
        FROM events
        WHERE event = {unified_event}
          AND timestamp >= parseDateTimeBestEffort({cutover_at})
          AND notEmpty(${sessionExpression})
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
      ...(sessionCutoverAt ? { session_cutover_at: sessionCutoverAt } : {}),
      design_ids: eligible.design,
      logo_ids: eligible.logo,
      website_ids: eligible.website,
    },
  };
}

export function parseCreatorViewsRows(rows: unknown[][]) {
  if (rows.length !== 1 || rows[0]?.length !== 1)
    throw new Error("PostHog returned an unexpected creator views aggregate.");
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

async function getCachedCreatorViews(
  eligible: EligibleWorkIds,
  cutover: string,
  scope: string,
  sessionCutover?: string,
) {
  "use cache";

  cacheLife(CREATOR_VIEWS_CACHE_LIFE);
  cacheTag(
    PUBLIC_CREATOR_PROFILES_CACHE_TAG,
    PUBLISHED_POSTS_CACHE_TAG,
    PUBLISHED_LOGOS_CACHE_TAG,
    PUBLISHED_WEBSITES_CACHE_TAG,
  );

  const configuration = getPostHogConfiguration();
  if (!configuration)
    throw new Error("PostHog creator views are not configured.");
  if (!scope) throw new Error("Missing analytics scope.");
  const hasEligibleWork = Object.values(eligible).some((ids) => ids.length > 0);
  if (!hasEligibleWork) {
    return {
      status: "available",
      count: 0,
      asOf: new Date().toISOString(),
    } satisfies CreatorViewsResult;
  }

  // Order samples by query start, so a slow older response cannot replace a
  // newer snapshot merely because it finished later.
  const asOf = new Date().toISOString();
  const rows = await runHogQlQuery(
    configuration,
    buildCreatorViewsQuery(eligible, cutover, sessionCutover),
  );
  return {
    status: "available",
    count: parseCreatorViewsRows(rows),
    asOf,
  } satisfies CreatorViewsResult;
}

export async function getCreatorViews(
  creatorId: string,
): Promise<CreatorViewsResult> {
  if (!creatorIdSchema.safeParse(creatorId).success) {
    return { status: "unavailable" };
  }

  try {
    const configuration = getPostHogConfiguration();
    const environment = process.env.DATA_ENVIRONMENT;
    if (!configuration || !environment) return { status: "unavailable" };
    const cutover = configuredCutover();
    const sessionCutover = process.env.POSTHOG_WORK_SESSION_CUTOVER_AT;
    if (
      sessionCutover &&
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(sessionCutover)
    )
      return { status: "unavailable" };
    const hash = (value: unknown) =>
      createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const legacyBoundary = [
      environment,
      process.env.DATABASE_URL,
      configuration.apiHost,
      configuration.projectId,
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
      cutover,
    ];
    const legacyScope = hash(legacyBoundary);
    const scope = sessionCutover
      ? hash([...legacyBoundary, sessionCutover])
      : legacyScope;
    const key = hash([scope, creatorId]);
    const initialCheckedAt = new Date().toISOString();
    const eligible = await getEligibleCreatorWorkIds(creatorId);
    const fingerprint = hash(eligible);
    if (!Object.values(eligible).some((ids) => ids.length > 0)) {
      // Empty eligibility needs neither a provider sample nor a stored snapshot.
      // A fresh timestamp also prevents cached empty scopes retaining old credit.
      const asOf = initialCheckedAt;
      return { status: "available", count: 0, asOf, eligibilityKey: fingerprint, checkedAt: asOf };
    }
    let result: CreatorViewsResult;
    try {
      result = await getCachedCreatorViews(
        eligible,
        cutover,
        scope,
        sessionCutover,
      );
    } catch {
      const snapshot =
        (await readViewSnapshot(key, fingerprint)) ??
        (sessionCutover
          ? await readViewSnapshot(hash([legacyScope, creatorId]), fingerprint)
          : null);
      result = snapshot
        ? { status: "stale", ...snapshot }
        : { status: "unavailable" };
      const checkedAt = new Date().toISOString();
      if (hash(await getEligibleCreatorWorkIds(creatorId)) !== fingerprint)
        return { status: "unavailable" };
      return result.status === "unavailable" ? result : {
        ...result, eligibilityKey: fingerprint, checkedAt,
      };
    }
    const checkedAt = new Date().toISOString();
    if (hash(await getEligibleCreatorWorkIds(creatorId)) !== fingerprint)
      return { status: "unavailable" };
    // A snapshot-store outage must not erase a valid provider response.
    if (result.status === "available")
      await writeViewSnapshot(key, fingerprint, result).catch(() => {});
    return { ...result, eligibilityKey: fingerprint, checkedAt };
  } catch {
    return { status: "unavailable" };
  }
}
