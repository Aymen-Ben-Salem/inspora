import type { Route } from "next";
import Link from "next/link";

import {
  getAdminAnalytics,
  getLiveVisitorAnalytics,
  isPostHogAdminConfigured,
} from "@/analytics/posthog-repository";
import {
  ANALYTICS_RANGES,
  isAnalyticsRange,
  type AdminAnalytics,
  type AnalyticsBreakdown,
  type AnalyticsRange,
  type LiveVisitorAnalytics,
  type PostHogTool,
} from "@/analytics/posthog-data";
import { AudienceTechnologyCard, TrafficChart } from "./analytics-tabs";
import { LiveVisitorsCard } from "./live-visitors-card";

type AnalyticsPageProps = {
  searchParams: Promise<{ days?: string | string[] }>;
};

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });
const exactNumber = new Intl.NumberFormat("en");
function parseRange(value: string | string[] | undefined): AnalyticsRange {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "1") return "today";
  if (raw === "today" || raw === "yesterday") return raw;

  const parsed = Number(raw);
  return isAnalyticsRange(parsed) ? parsed : 30;
}

function formatRangeLabel(range: AnalyticsRange) {
  if (range === "today") return "Today";
  if (range === "yesterday") return "Yesterday";
  return `${range}d`;
}

function SetupState() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8">
      <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Setup needed</p>
      <h2 className="mt-2 text-2xl font-medium tracking-[-0.04em]">
        Connect the PostHog Query API.
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#666]">
        Public tracking can run with the project token alone. This private admin view also
        needs a server-only, read-scoped personal API key and the PostHog project ID.
      </p>
      <div className="mt-6 overflow-x-auto rounded-xl bg-[#f5f5f2] p-4 font-mono text-xs leading-6 text-[#444]">
        POSTHOG_PERSONAL_API_KEY
        <br />
        POSTHOG_PROJECT_ID
        <br />
        POSTHOG_API_HOST
      </div>
    </section>
  );
}

function UnavailableState() {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
      <p className="text-xs uppercase tracking-[0.16em] text-amber-800">Temporarily unavailable</p>
      <h2 className="mt-2 text-2xl font-medium tracking-[-0.04em]">
        PostHog could not return analytics.
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-amber-900/75">
        Check that the project ID is correct, the API host matches your PostHog region,
        and the personal API key has query read access.
      </p>
    </section>
  );
}

type MetricFormat = "decimal" | "number";

function formatMetric(value: number, format: MetricFormat) {
  if (format === "decimal") return value.toFixed(1);
  return compactNumber.format(value);
}

function MetricCard({
  format = "number",
  label,
  value,
}: {
  format?: MetricFormat;
  label: string;
  value: number;
}) {
  return (
    <article className="min-w-0 bg-white px-5 py-5 sm:px-6 sm:py-6">
      <p className="text-[11px] font-medium text-[#777]">{label}</p>
      <p
        className="mt-2 text-3xl font-medium tracking-[-0.055em] tabular-nums sm:text-[2.15rem]"
        title={format === "number" ? exactNumber.format(value) : undefined}
      >
        {formatMetric(value, format)}
      </p>
    </article>
  );
}

function formatHour(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function HourlyActivityChart({
  analytics,
  visitorUnit,
}: {
  analytics: AdminAnalytics;
  visitorUnit: string;
}) {
  const maximum = Math.max(
    1,
    ...analytics.hourlyActivity.map((hour) => hour.uniqueVisitors),
  );

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-medium tracking-[-0.04em]">
            Most active hours
          </h2>
          <p className="mt-1 text-xs text-[#888]">{visitorUnit} by hour</p>
        </div>
        <p className="text-xs text-[#888]">Unique visitors · Tunisia time</p>
      </div>
      <div className="mt-8 pb-6">
        <div className="flex h-52 min-w-0 items-end gap-1 border-b border-black/10 sm:gap-2">
          {analytics.hourlyActivity.map((hour) => {
            const height =
              hour.uniqueVisitors === 0
                ? 2
                : Math.max(7, (hour.uniqueVisitors / maximum) * 100);
            const showLabel = hour.hour % 3 === 0 || hour.hour === 23;

            return (
              <div
                key={hour.hour}
                className="group relative flex h-full min-w-0 flex-1 items-end"
              >
                <div
                  className="w-full rounded-t-sm bg-[#222] transition-colors duration-200 group-hover:bg-[#777]"
                  style={{ height: `${height}%` }}
                  title={`${formatHour(hour.hour)}: ${exactNumber.format(hour.uniqueVisitors)} ${visitorUnit}`}
                  aria-label={`${formatHour(hour.hour)}: ${exactNumber.format(hour.uniqueVisitors)} ${visitorUnit}`}
                />
                {showLabel ? (
                  <span className="absolute left-0 top-[calc(100%+8px)] whitespace-nowrap text-[10px] text-[#999]">
                    {formatHour(hour.hour)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TopPosts({ analytics }: { analytics: AdminAnalytics }) {
  const maximum = Math.max(1, ...analytics.topPosts.map((post) => post.opens));

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
      <h2 className="text-2xl font-medium tracking-[-0.04em]">Most opened posts</h2>
      <p className="mt-1 text-xs text-[#888]">Content drawing the most attention</p>
      {analytics.topPosts.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#888]">Post opens will appear here.</p>
      ) : (
        <ol className="mt-6 divide-y divide-black/10">
          {analytics.topPosts.map((post, index) => (
            <li key={post.id} className="relative overflow-hidden py-4">
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-0 rounded-md bg-[#f1f1ee]"
                style={{ width: `${Math.max(4, (post.opens / maximum) * 100)}%` }}
              />
              <div className="relative flex min-w-0 items-center gap-3 px-3">
                <span className="w-5 shrink-0 text-xs text-[#999]">{index + 1}</span>
                {post.slug ? (
                  <Link
                    href={`/posts/${post.slug}` as Route}
                    target="_blank"
                    className="focus-ring min-w-0 flex-1 truncate rounded-sm text-sm font-medium hover:underline"
                  >
                    {post.title}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{post.title}</span>
                )}
                <span className="shrink-0 text-sm tabular-nums text-[#666]">
                  {exactNumber.format(post.opens)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RankedBreakdown({
  emptyMessage,
  items,
  title,
  visitorUnit,
}: {
  emptyMessage: string;
  items: AnalyticsBreakdown[];
  title: string;
  visitorUnit: string;
}) {
  const maximum = Math.max(1, ...items.map((item) => item.visitors));

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
      <h2 className="text-2xl font-medium tracking-[-0.04em]">{title}</h2>
      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#888]">{emptyMessage}</p>
      ) : (
        <ol className="mt-6 divide-y divide-black/10">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="relative overflow-hidden py-4">
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-0 rounded-md bg-[#f1f1ee]"
                style={{ width: `${Math.max(4, (item.visitors / maximum) * 100)}%` }}
              />
              <div className="relative flex min-w-0 items-center gap-3 px-3">
                <span className="w-5 shrink-0 text-xs text-[#999]">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {item.label}
                </span>
                <span
                  className="shrink-0 text-xs tabular-nums text-[#777]"
                  title={`${exactNumber.format(item.visitors)} ${visitorUnit}, ${exactNumber.format(item.pageviews)} pageviews`}
                >
                  {compactNumber.format(item.visitors)} {visitorUnit} · {compactNumber.format(item.pageviews)} views
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PostHogToolLinks({ tools }: { tools: PostHogTool[] }) {
  return (
    <nav
      aria-label="PostHog tools"
      className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2"
    >
      {tools.map((tool) => (
        <a
          key={tool.label}
          href={tool.href}
          target="_blank"
          rel="noreferrer"
          title={tool.description}
          className="focus-ring group inline-flex items-center gap-1.5 rounded-sm text-xs text-[#777] transition-colors hover:text-black"
        >
          {tool.label}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="size-3.5 transition-transform duration-200 group-hover:translate-x-px group-hover:-translate-y-px"
          >
            <path d="M6 14 14 6m0 0H8m6 0v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      ))}
    </nav>
  );
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const { days } = await searchParams;
  const range = parseRange(days);
  const visitorUnit = typeof range === "number" ? "visitor-days" : "visitors";

  let analytics: AdminAnalytics | null = null;
  let liveAnalytics: LiveVisitorAnalytics | null = null;
  let failed = false;

  if (isPostHogAdminConfigured()) {
    const [analyticsResult, liveAnalyticsResult] = await Promise.allSettled([
      getAdminAnalytics(range),
      getLiveVisitorAnalytics(),
    ]);

    if (analyticsResult.status === "fulfilled") {
      analytics = analyticsResult.value;
    } else {
      console.error("Admin analytics query failed", analyticsResult.reason);
      failed = true;
    }

    if (liveAnalyticsResult.status === "fulfilled") {
      liveAnalytics = liveAnalyticsResult.value;
    } else {
      console.error("Live visitor query failed", liveAnalyticsResult.reason);
    }
  }

  return (
    <div className="grid gap-6 sm:gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-black/10 pb-6 sm:pb-7">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.055em] sm:text-5xl">Analytics</h1>
          <p className="mt-2 text-sm text-[#777]">Public traffic and content engagement.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <nav aria-label="Analytics date range" className="flex rounded-full bg-[#e5e5e1] p-1">
            {ANALYTICS_RANGES.map((option) => (
              <Link
                key={option}
                href={`/admin/analytics?days=${option}` as Route}
                aria-current={range === option ? "page" : undefined}
                className={`focus-ring inline-flex h-8 items-center rounded-full px-3.5 text-xs transition-colors ${
                  range === option ? "bg-white text-black shadow-sm" : "text-[#666] hover:text-black"
                }`}
              >
                {formatRangeLabel(option)}
              </Link>
            ))}
          </nav>
          {analytics ? <PostHogToolLinks tools={analytics.tools} /> : null}
        </div>
      </header>

      {!isPostHogAdminConfigured() ? <SetupState /> : null}
      {failed ? <UnavailableState /> : null}
      {analytics ? (
        <>
          <section className="overflow-hidden rounded-[20px] border border-black/10 bg-black/10">
            <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,2fr)_minmax(230px,1fr)]">
              <LiveVisitorsCard initialAnalytics={liveAnalytics} />
              <article className="bg-[#242424] px-5 py-6 text-white sm:px-6 sm:py-7">
                <p className="text-[11px] font-medium text-white/55">Daily visitor average</p>
                <p
                  className="mt-3 text-4xl font-medium tracking-[-0.06em] tabular-nums sm:text-5xl"
                  title={`${analytics.summary.averageDailyVisitors.toFixed(1)} average unique visitors per day`}
                >
                  {formatMetric(analytics.summary.averageDailyVisitors, "decimal")}
                </p>
                <p className="mt-1 text-[11px] text-white/45">For the selected period</p>
              </article>
            </div>
            <div className="grid gap-px border-t border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Pageviews" value={analytics.summary.pageviews} />
              <MetricCard label="Post opens" value={analytics.summary.postOpens} />
              <MetricCard label="Source clicks" value={analytics.summary.sourceClicks} />
              <MetricCard label="Subscribers" value={analytics.summary.subscriptions} />
            </div>
          </section>
          <TrafficChart daily={analytics.daily} range={analytics.range} />
          <HourlyActivityChart analytics={analytics} visitorUnit={visitorUnit} />
          <div className="grid gap-7 xl:grid-cols-2">
            <TopPosts analytics={analytics} />
            <RankedBreakdown
              title="Top countries"
              items={analytics.topCountries}
              emptyMessage="Country data will appear as traffic is collected."
              visitorUnit={visitorUnit}
            />
            <RankedBreakdown
              title="Top referrers"
              items={analytics.topReferrers}
              emptyMessage="Traffic sources will appear here."
              visitorUnit={visitorUnit}
            />
            <AudienceTechnologyCard
              devices={analytics.topDevices}
              browsers={analytics.topBrowsers}
              visitorUnit={visitorUnit}
            />
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4 text-[11px] leading-5 text-[#888]">
            <p>Cookieless daily reach · No persistent visitor profiles or session replay</p>
            <p>
              Cached for five minutes · Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(analytics.generatedAt))}
            </p>
          </footer>
        </>
      ) : null}
    </div>
  );
}
