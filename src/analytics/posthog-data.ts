export const ANALYTICS_RANGES = ["yesterday", "today", 7, 30, 90] as const;

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export type AnalyticsSummary = {
  pageviews: number;
  uniqueVisitors: number;
  sessions: number;
  bounceRate: number;
  averageSessionDuration: number;
  viewsPerSession: number;
  postOpens: number;
  sourceClicks: number;
  subscriptions: number;
};

export type DailyAnalytics = {
  date: string;
  pageviews: number;
  uniqueVisitors: number;
  postOpens: number;
};

export type HourlyAnalytics = {
  hour: number;
  uniqueVisitors: number;
};

export type TopPostAnalytics = {
  id: string;
  title: string;
  slug: string;
  opens: number;
};

export type AnalyticsBreakdown = {
  label: string;
  visitors: number;
  pageviews: number;
};

export type PostHogTool = {
  description: string;
  href: string;
  label: string;
};

export type LiveVisitorAnalytics = {
  count: number;
  generatedAt: string;
  windowMinutes: number;
};

export type AdminAnalytics = {
  range: AnalyticsRange;
  generatedAt: string;
  summary: AnalyticsSummary;
  daily: DailyAnalytics[];
  topPosts: TopPostAnalytics[];
  topCountries: AnalyticsBreakdown[];
  topReferrers: AnalyticsBreakdown[];
  topDevices: AnalyticsBreakdown[];
  topBrowsers: AnalyticsBreakdown[];
  hourlyActivity: HourlyAnalytics[];
  tools: PostHogTool[];
};

export function isAnalyticsRange(value: string | number): value is AnalyticsRange {
  return ANALYTICS_RANGES.some((range) => range === value);
}

export function getAnalyticsTimeRange(range: AnalyticsRange) {
  if (range === "today") {
    return { startExpression: "toStartOfDay(now())" };
  }

  if (range === "yesterday") {
    return {
      startExpression: "toStartOfDay(now()) - INTERVAL 1 DAY",
      endExpression: "toStartOfDay(now())",
    };
  }

  return { startExpression: `now() - INTERVAL ${range} DAY` };
}

export function getAnalyticsRangeDayCount(range: AnalyticsRange) {
  return typeof range === "number" ? range : 1;
}

export function getAnalyticsEndDateKey(
  currentProjectDate: string,
  range: AnalyticsRange,
) {
  if (range !== "yesterday") return currentProjectDate;

  const date = new Date(`${currentProjectDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return currentProjectDate;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function resolvePostHogApiHost({
  apiHost,
  ingestionHost,
}: {
  apiHost?: string;
  ingestionHost?: string;
}) {
  if (apiHost) return apiHost.replace(/\/$/, "");
  if (ingestionHost?.includes("eu.i.posthog.com")) return "https://eu.posthog.com";
  if (ingestionHost?.includes("us.i.posthog.com")) return "https://us.posthog.com";
  return undefined;
}

export function toAnalyticsNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function mapAnalyticsBreakdownRows(
  rows: unknown[][],
  fallbackLabel: string,
  labelAliases: Readonly<Record<string, string>> = {},
): AnalyticsBreakdown[] {
  return rows.map((row) => {
    const rawLabel = String(row[0] ?? "").trim();

    return {
      label: (labelAliases[rawLabel] ?? rawLabel) || fallbackLabel,
      visitors: toAnalyticsNumber(row[1]),
      pageviews: toAnalyticsNumber(row[2]),
    };
  });
}

export function createPostHogTools({
  apiHost,
  projectId,
}: {
  apiHost: string;
  projectId: string;
}): PostHogTool[] {
  const projectUrl = `${apiHost.replace(/\/$/, "")}/project/${encodeURIComponent(projectId)}`;

  return [
    {
      label: "Web analytics",
      description: "Explore paths, channels, live traffic, and conversion goals.",
      href: `${projectUrl}/web`,
    },
    {
      label: "Heatmaps",
      description: "Inspect click, movement, rage-click, and scroll-depth patterns.",
      href: `${projectUrl}/heatmaps`,
    },
    {
      label: "Web vitals",
      description: "Review LCP, CLS, INP, and FCP performance by page.",
      href: `${projectUrl}/web/web-vitals`,
    },
  ];
}

function toDateKey(value: unknown) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

export function fillDailyAnalytics(
  rows: unknown[][],
  days: number,
  endDate: Date | string = new Date(),
) {
  const byDate = new Map<string, DailyAnalytics>();

  for (const row of rows) {
    const date = toDateKey(row[0]);
    if (!date) continue;
    byDate.set(date, {
      date,
      pageviews: toAnalyticsNumber(row[1]),
      uniqueVisitors: toAnalyticsNumber(row[2]),
      postOpens: toAnalyticsNumber(row[3]),
    });
  }

  const suppliedEndDateKey =
    typeof endDate === "string"
      ? endDate.slice(0, 10)
      : endDate.toISOString().slice(0, 10);
  const endDateKey = /^\d{4}-\d{2}-\d{2}$/.test(suppliedEndDateKey)
    ? suppliedEndDateKey
    : new Date().toISOString().slice(0, 10);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(`${endDateKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - (days - index - 1));
    const key = date.toISOString().slice(0, 10);
    return (
      byDate.get(key) ?? {
        date: key,
        pageviews: 0,
        uniqueVisitors: 0,
        postOpens: 0,
      }
    );
  });
}

export function fillHourlyAnalytics(rows: unknown[][]): HourlyAnalytics[] {
  const visitorsByHour = new Map<number, number>();

  for (const row of rows) {
    const hour = toAnalyticsNumber(row[0]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    visitorsByHour.set(hour, toAnalyticsNumber(row[1]));
  }

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    uniqueVisitors: visitorsByHour.get(hour) ?? 0,
  }));
}
