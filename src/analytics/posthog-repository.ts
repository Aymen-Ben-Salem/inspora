import "server-only";

import { cacheLife } from "next/cache";

import { ANALYTICS_EVENTS } from "./events";
import {
  calculateAverageDailyVisitors,
  createPostHogTools,
  fillDailyAnalytics,
  fillHourlyAnalytics,
  getAnalyticsEndDateKey,
  getAnalyticsRangeDayCount,
  getAnalyticsTimeRange,
  mapAnalyticsBreakdownRows,
  toAnalyticsNumber,
  type AdminAnalytics,
  type AnalyticsRange,
  type LiveVisitorAnalytics,
} from "./posthog-data";
import {
  getPostHogConfiguration,
  isPostHogConfigured,
  runHogQlQuery,
} from "./posthog-query";

const ANALYTICS_CACHE_LIFE = {
  stale: 300,
  revalidate: 300,
  expire: 3600,
} as const;

const LIVE_ANALYTICS_CACHE_LIFE = {
  stale: 15,
  revalidate: 15,
  expire: 60,
} as const;

export const LIVE_VISITOR_WINDOW_MINUTES = 2;

export function isPostHogAdminConfigured() {
  return isPostHogConfigured();
}

export async function getAdminAnalytics(
  range: AnalyticsRange,
): Promise<AdminAnalytics> {
  "use cache";

  cacheLife(ANALYTICS_CACHE_LIFE);

  const configuration = getPostHogConfiguration();
  if (!configuration) throw new Error("PostHog admin analytics is not configured.");

  const { startExpression, endExpression } = getAnalyticsTimeRange(range);
  const timePredicate = `timestamp >= ${startExpression}${
    endExpression ? ` AND timestamp < ${endExpression}` : ""
  }`;
  const [
    summaryRows,
    dailyRows,
    topPostRows,
    referrerRows,
    deviceRows,
    browserRows,
    hourlyRows,
    visitDurationRows,
  ] = await Promise.all([
    runHogQlQuery(configuration, {
      name: "Inspora admin summary",
      query: `SELECT
        countIf(event = '$pageview') AS pageviews,
        uniqIf(distinct_id, event = '$pageview') AS unique_visitors,
        countIf(event = '${ANALYTICS_EVENTS.postOpened}') AS post_opens,
        countIf(event = '${ANALYTICS_EVENTS.postSourceVisited}') AS source_clicks,
        countIf(event = '${ANALYTICS_EVENTS.newsletterSubscribed}') AS subscriptions,
        toString(toDate(now())) AS current_project_day
      FROM events
      WHERE ${timePredicate}`,
    }),
    runHogQlQuery(configuration, {
      name: "Inspora admin daily activity",
      query: `SELECT
        toDate(timestamp) AS day,
        countIf(event = '$pageview') AS pageviews,
        uniqIf(distinct_id, event = '$pageview') AS unique_visitors,
        countIf(event = '${ANALYTICS_EVENTS.postOpened}') AS post_opens
      FROM events
      WHERE ${timePredicate}
      GROUP BY day
      ORDER BY day ASC`,
    }),
    runHogQlQuery(configuration, {
      name: "Inspora admin top posts",
      query: `SELECT
        toString(properties.post_id) AS post_id,
        any(toString(properties.post_title)) AS post_title,
        any(toString(properties.post_slug)) AS post_slug,
        count() AS opens
      FROM events
      WHERE event = '${ANALYTICS_EVENTS.postOpened}'
        AND ${timePredicate}
        AND notEmpty(toString(properties.post_id))
      GROUP BY post_id
      ORDER BY opens DESC
      LIMIT 8`,
    }),
    runHogQlQuery(configuration, {
      name: "Inspora admin top referrers",
      query: `SELECT
        toString(properties.$referring_domain) AS referrer,
        uniq(distinct_id) AS visitors,
        count() AS pageviews
      FROM events
      WHERE event = '$pageview'
        AND ${timePredicate}
      GROUP BY referrer
      ORDER BY visitors DESC, pageviews DESC
      LIMIT 8`,
    }),
    runHogQlQuery(configuration, {
      name: "Inspora admin top devices",
      query: `SELECT
        toString(properties.$device_type) AS device,
        uniq(distinct_id) AS visitors,
        count() AS pageviews
      FROM events
      WHERE event = '$pageview'
        AND ${timePredicate}
      GROUP BY device
      ORDER BY visitors DESC, pageviews DESC
      LIMIT 8`,
    }),
    runHogQlQuery(configuration, {
      name: "Inspora admin top browsers",
      query: `SELECT
        toString(properties.$browser) AS browser,
        uniq(distinct_id) AS visitors,
        count() AS pageviews
      FROM events
      WHERE event = '$pageview'
        AND ${timePredicate}
      GROUP BY browser
      ORDER BY visitors DESC, pageviews DESC
      LIMIT 8`,
    }),
    runHogQlQuery(configuration, {
      name: "Inspora admin hourly activity",
      query: `SELECT
        toHour(timestamp) AS hour,
        uniq(distinct_id) AS unique_visitors
      FROM events
      WHERE event = '$pageview'
        AND ${timePredicate}
      GROUP BY hour
      ORDER BY hour ASC`,
    }),
    runHogQlQuery(configuration, {
      name: "Inspora average visit duration",
      query: `SELECT avg(duration_seconds) AS average_duration_seconds
      FROM (
        SELECT dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds
        FROM events
        WHERE ${timePredicate}
          AND notEmpty(toString(properties.$session_id))
        GROUP BY toString(properties.$session_id)
        HAVING duration_seconds >= 0 AND duration_seconds <= 86400
      )`,
    }),
  ]);

  const summary = summaryRows[0] ?? [];
  const daily = fillDailyAnalytics(
    dailyRows,
    getAnalyticsRangeDayCount(range),
    getAnalyticsEndDateKey(String(summary[5] ?? ""), range),
  );

  return {
    range,
    generatedAt: new Date().toISOString(),
    summary: {
      pageviews: toAnalyticsNumber(summary[0]),
      uniqueVisitors: toAnalyticsNumber(summary[1]),
      averageDailyVisitors: calculateAverageDailyVisitors(daily),
      averageVisitDurationSeconds: toAnalyticsNumber(visitDurationRows[0]?.[0]),
      postOpens: toAnalyticsNumber(summary[2]),
      sourceClicks: toAnalyticsNumber(summary[3]),
      subscriptions: toAnalyticsNumber(summary[4]),
    },
    daily,
    topPosts: topPostRows.map((row) => ({
      id: String(row[0] ?? ""),
      title: String(row[1] || "Untitled post"),
      slug: String(row[2] ?? ""),
      opens: toAnalyticsNumber(row[3]),
    })),
    topReferrers: mapAnalyticsBreakdownRows(
      referrerRows,
      "Direct / Unknown",
      { $direct: "Direct / Unknown" },
    ),
    topDevices: mapAnalyticsBreakdownRows(deviceRows, "Unknown device"),
    topBrowsers: mapAnalyticsBreakdownRows(browserRows, "Unknown browser"),
    hourlyActivity: fillHourlyAnalytics(hourlyRows),
    tools: createPostHogTools(configuration),
  };
}

export async function getLiveVisitorAnalytics(): Promise<LiveVisitorAnalytics> {
  "use cache";

  cacheLife(LIVE_ANALYTICS_CACHE_LIFE);

  const configuration = getPostHogConfiguration();
  if (!configuration) throw new Error("PostHog admin analytics is not configured.");

  const rows = await runHogQlQuery(configuration, {
    name: "Inspora live visitors",
    query: `SELECT uniq(distinct_id) AS live_visitors
      FROM events
      WHERE timestamp >= now() - INTERVAL ${LIVE_VISITOR_WINDOW_MINUTES} MINUTE
        AND event != '$pageleave'`,
  });

  return {
    count: toAnalyticsNumber(rows[0]?.[0]),
    generatedAt: new Date().toISOString(),
    windowMinutes: LIVE_VISITOR_WINDOW_MINUTES,
  };
}
