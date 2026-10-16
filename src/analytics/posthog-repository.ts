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
  type AdminAnalytics,
  type AnalyticsRange,
  type LiveVisitorAnalytics,
} from "./posthog-data";
import {
  getPostHogConfiguration,
  isPostHogConfigured,
  runHogQlQuery,
  type HogQlQueryRequest,
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
const REPORT_TIME_EXPRESSION = "parseDateTimeBestEffort({report_time})";

function unexpectedResult(): never {
  throw new Error("PostHog returned an unexpected analytics result.");
}

function readCount(value: unknown): number {
  const count = typeof value === "number" ? value
    : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(count) || count < 0) return unexpectedResult();
  return count;
}

function aggregateRow(rows: unknown[][]): unknown[] {
  if (rows.length !== 1) return unexpectedResult();
  return rows[0];
}

function validateCountRows(rows: unknown[][], columns: number[]) {
  for (const row of rows) {
    for (const column of columns) readCount(row[column]);
  }
}

function readAverageDuration(rows: unknown[][]): number {
  const value = aggregateRow(rows)[0];
  // SQL AVG is NULL when no measured visits exist; missing/invalid data is not.
  if (value === null) return 0;
  const duration = typeof value === "number" ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(duration) || duration < 0 || duration > 86400)
    return unexpectedResult();
  return duration;
}

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

  const generatedAt = new Date().toISOString();
  // Every query observes the same range, including when requests cross UTC
  // midnight. The provider supports fractional seconds in this expression.
  const executeQuery = (request: Pick<HogQlQueryRequest, "name" | "query">) =>
    runHogQlQuery(configuration, {
      ...request,
      refresh: "force_blocking",
      values: { report_time: generatedAt },
    });
  const { startExpression, endExpression } = getAnalyticsTimeRange(
    range,
    REPORT_TIME_EXPRESSION,
  );
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
    executeQuery({
      name: "Inspora admin summary",
      query: `SELECT
        countIf(event = '$pageview') AS pageviews,
        uniqIf(distinct_id, event = '$pageview') AS unique_visitors,
        countIf(event = '${ANALYTICS_EVENTS.postOpened}') AS post_opens,
        countIf(event = '${ANALYTICS_EVENTS.postSourceVisited}') AS source_clicks,
        countIf(event = '${ANALYTICS_EVENTS.newsletterSubscribed}') AS subscriptions,
        toString(toDate(toTimeZone(${REPORT_TIME_EXPRESSION}, 'UTC'))) AS current_project_day
      FROM events
      WHERE ${timePredicate}`,
    }),
    executeQuery({
      name: "Inspora admin daily activity",
      query: `SELECT
        toDate(toTimeZone(timestamp, 'UTC')) AS day,
        countIf(event = '$pageview') AS pageviews,
        uniqIf(distinct_id, event = '$pageview') AS unique_visitors,
        countIf(event = '${ANALYTICS_EVENTS.postOpened}') AS post_opens
      FROM events
      WHERE ${timePredicate}
      GROUP BY day
      ORDER BY day ASC`,
    }),
    executeQuery({
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
    executeQuery({
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
    executeQuery({
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
    executeQuery({
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
    executeQuery({
      name: "Inspora admin hourly activity",
      query: `SELECT
        toHour(toTimeZone(timestamp, 'UTC')) AS hour,
        uniq(distinct_id) AS unique_visitors
      FROM events
      WHERE event = '$pageview'
        AND ${timePredicate}
      GROUP BY hour
      ORDER BY hour ASC`,
    }),
    executeQuery({
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

  const summary = aggregateRow(summaryRows);
  validateCountRows(dailyRows, [1, 2, 3]);
  validateCountRows(hourlyRows, [1]);
  for (const row of hourlyRows) {
    if (readCount(row[0]) > 23) unexpectedResult();
  }
  for (const rows of [referrerRows, deviceRows, browserRows])
    validateCountRows(rows, [1, 2]);
  const daily = fillDailyAnalytics(
    dailyRows,
    getAnalyticsRangeDayCount(range),
    getAnalyticsEndDateKey(generatedAt.slice(0, 10), range),
  );

  return {
    range,
    generatedAt,
    summary: {
      pageviews: readCount(summary[0]),
      uniqueVisitors: readCount(summary[1]),
      averageDailyVisitors: calculateAverageDailyVisitors(daily),
      averageVisitDurationSeconds: readAverageDuration(visitDurationRows),
      postOpens: readCount(summary[2]),
      sourceClicks: readCount(summary[3]),
      subscriptions: readCount(summary[4]),
    },
    daily,
    topPosts: topPostRows.map((row) => ({
      id: String(row[0] ?? ""),
      title: String(row[1] || "Untitled post"),
      slug: String(row[2] ?? ""),
      opens: readCount(row[3]),
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

  const generatedAt = new Date().toISOString();
  const rows = await runHogQlQuery(configuration, {
    name: "Inspora live visitors",
    // The application already limits refreshes to 15 seconds. PostHog's
    // blocking mode can reuse a minute-old query result for this moving window.
    refresh: "force_blocking",
    values: { report_time: generatedAt },
    query: `SELECT uniq(distinct_id) AS live_visitors
      FROM events
      WHERE timestamp >= ${REPORT_TIME_EXPRESSION} - INTERVAL ${LIVE_VISITOR_WINDOW_MINUTES} MINUTE
        AND timestamp < ${REPORT_TIME_EXPRESSION}
        AND event != '$pageleave'`,
  });

  return {
    count: readCount(aggregateRow(rows)[0]),
    generatedAt,
    windowMinutes: LIVE_VISITOR_WINDOW_MINUTES,
  };
}
