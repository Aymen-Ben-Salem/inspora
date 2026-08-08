import "server-only";

import { cacheLife } from "next/cache";
import { z } from "zod";

import { ANALYTICS_EVENTS } from "./events";
import {
  fillDailyAnalytics,
  resolvePostHogApiHost,
  toAnalyticsNumber,
  type AdminAnalytics,
  type AnalyticsRange,
} from "./posthog-data";

const queryResponseSchema = z.object({
  results: z.array(z.array(z.unknown())),
});

const ANALYTICS_CACHE_LIFE = {
  stale: 300,
  revalidate: 300,
  expire: 3600,
} as const;

type PostHogConfiguration = {
  apiHost: string;
  personalApiKey: string;
  projectId: string;
};

function getPostHogConfiguration(): PostHogConfiguration | null {
  const apiHost = resolvePostHogApiHost({
    apiHost: process.env.POSTHOG_API_HOST,
    ingestionHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;

  if (!apiHost || !personalApiKey || !projectId) return null;
  return { apiHost, personalApiKey, projectId };
}

export function isPostHogAdminConfigured() {
  return getPostHogConfiguration() !== null;
}

async function runHogQlQuery(
  configuration: PostHogConfiguration,
  name: string,
  query: string,
) {
  const response = await fetch(
    `${configuration.apiHost}/api/projects/${encodeURIComponent(configuration.projectId)}/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.personalApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        query: { kind: "HogQLQuery", query },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`PostHog query failed with status ${response.status}.`);
  }

  const parsed = queryResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("PostHog returned an unexpected response.");
  return parsed.data.results;
}

export async function getAdminAnalytics(
  rangeDays: AnalyticsRange,
): Promise<AdminAnalytics> {
  "use cache";

  cacheLife(ANALYTICS_CACHE_LIFE);

  const configuration = getPostHogConfiguration();
  if (!configuration) throw new Error("PostHog admin analytics is not configured.");

  const interval = `INTERVAL ${rangeDays} DAY`;
  const [summaryRows, dailyRows, topPostRows] = await Promise.all([
    runHogQlQuery(
      configuration,
      "Inspora admin summary",
      `SELECT
        countIf(event = '$pageview') AS pageviews,
        uniqIf(distinct_id, event = '$pageview') AS unique_visitors,
        countIf(event = '${ANALYTICS_EVENTS.postOpened}') AS post_opens,
        countIf(event = '${ANALYTICS_EVENTS.postSourceVisited}') AS source_clicks,
        countIf(event = '${ANALYTICS_EVENTS.newsletterSubscribed}') AS subscriptions
      FROM events
      WHERE timestamp >= now() - ${interval}`,
    ),
    runHogQlQuery(
      configuration,
      "Inspora admin daily activity",
      `SELECT
        toDate(timestamp) AS day,
        countIf(event = '$pageview') AS pageviews,
        uniqIf(distinct_id, event = '$pageview') AS unique_visitors,
        countIf(event = '${ANALYTICS_EVENTS.postOpened}') AS post_opens
      FROM events
      WHERE timestamp >= now() - ${interval}
      GROUP BY day
      ORDER BY day ASC`,
    ),
    runHogQlQuery(
      configuration,
      "Inspora admin top posts",
      `SELECT
        toString(properties.post_id) AS post_id,
        any(toString(properties.post_title)) AS post_title,
        any(toString(properties.post_slug)) AS post_slug,
        count() AS opens
      FROM events
      WHERE event = '${ANALYTICS_EVENTS.postOpened}'
        AND timestamp >= now() - ${interval}
        AND notEmpty(toString(properties.post_id))
      GROUP BY post_id
      ORDER BY opens DESC
      LIMIT 8`,
    ),
  ]);

  const summary = summaryRows[0] ?? [];

  return {
    rangeDays,
    generatedAt: new Date().toISOString(),
    summary: {
      pageviews: toAnalyticsNumber(summary[0]),
      uniqueVisitors: toAnalyticsNumber(summary[1]),
      postOpens: toAnalyticsNumber(summary[2]),
      sourceClicks: toAnalyticsNumber(summary[3]),
      subscriptions: toAnalyticsNumber(summary[4]),
    },
    daily: fillDailyAnalytics(dailyRows, rangeDays),
    topPosts: topPostRows.map((row) => ({
      id: String(row[0] ?? ""),
      title: String(row[1] || "Untitled post"),
      slug: String(row[2] ?? ""),
      opens: toAnalyticsNumber(row[3]),
    })),
  };
}
