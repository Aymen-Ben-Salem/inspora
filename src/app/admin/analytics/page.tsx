import type { Route } from "next";
import Link from "next/link";

import {
  getAdminAnalytics,
  isPostHogAdminConfigured,
} from "@/analytics/posthog-repository";
import {
  ANALYTICS_RANGES,
  isAnalyticsRange,
  type AdminAnalytics,
  type AnalyticsBreakdown,
  type AnalyticsRange,
  type PostHogTool,
} from "@/analytics/posthog-data";
import { AudienceTechnologyCard, TrafficChart } from "./analytics-tabs";

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

type MetricFormat = "decimal" | "duration" | "number" | "percent";

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;

  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
}

function formatMetric(value: number, format: MetricFormat) {
  if (format === "duration") return formatDuration(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
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
    <article className="min-w-0 bg-white p-5 sm:p-6">
      <p className="text-xs uppercase tracking-[0.12em] text-[#777]">{label}</p>
      <p
        className="mt-4 text-3xl font-medium tracking-[-0.05em] tabular-nums sm:text-4xl"
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

function HourlyActivityChart({ analytics }: { analytics: AdminAnalytics }) {
  const maximum = Math.max(
    1,
    ...analytics.hourlyActivity.map((hour) => hour.uniqueVisitors),
  );

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Activity</p>
          <h2 className="mt-1 text-2xl font-medium tracking-[-0.04em]">
            Most active hours
          </h2>
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
                  title={`${formatHour(hour.hour)}: ${exactNumber.format(hour.uniqueVisitors)} unique visitors`}
                  aria-label={`${formatHour(hour.hour)}: ${exactNumber.format(hour.uniqueVisitors)} unique visitors`}
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
      <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Engagement</p>
      <h2 className="mt-1 text-2xl font-medium tracking-[-0.04em]">Most opened posts</h2>
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
  eyebrow,
  items,
  note,
  title,
}: {
  emptyMessage: string;
  eyebrow: string;
  items: AnalyticsBreakdown[];
  note?: string;
  title: string;
}) {
  const maximum = Math.max(1, ...items.map((item) => item.visitors));

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
      <p className="text-xs uppercase tracking-[0.16em] text-[#777]">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-medium tracking-[-0.04em]">{title}</h2>
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
                  title={`${exactNumber.format(item.visitors)} visitors, ${exactNumber.format(item.pageviews)} pageviews`}
                >
                  {compactNumber.format(item.visitors)} visitors · {compactNumber.format(item.pageviews)} views
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {note ? <p className="mt-4 text-xs leading-5 text-[#888]">{note}</p> : null}
    </section>
  );
}

function PostHogTools({ tools }: { tools: PostHogTool[] }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Explore deeper</p>
        <h2 className="mt-1 text-2xl font-medium tracking-[-0.04em]">PostHog tools</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#777]">
          Open the interactive views for investigation that does not fit into a compact report.
        </p>
      </div>
      <div className="mt-6 grid overflow-hidden rounded-xl border border-black/10 bg-black/10 md:grid-cols-3">
        {tools.map((tool) => (
          <a
            key={tool.label}
            href={tool.href}
            target="_blank"
            rel="noreferrer"
            className="focus-ring group min-h-36 bg-white p-5 transition-colors hover:bg-[#f7f7f4]"
          >
            <span className="flex items-center justify-between gap-4 text-sm font-medium">
              {tool.label}
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              >
                <path d="M6 14 14 6m0 0H8m6 0v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="mt-3 block max-w-xs text-xs leading-5 text-[#777]">
              {tool.description}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const { days } = await searchParams;
  const range = parseRange(days);

  let analytics: AdminAnalytics | null = null;
  let failed = false;

  if (isPostHogAdminConfigured()) {
    try {
      analytics = await getAdminAnalytics(range);
    } catch (error) {
      console.error("Admin analytics query failed", error);
      failed = true;
    }
  }

  return (
    <div className="grid gap-7">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-black/10 pb-7">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Audience</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em] sm:text-5xl">Analytics</h1>
          <p className="mt-2 text-sm text-[#777]">Public traffic and content engagement.</p>
        </div>
        <nav aria-label="Analytics date range" className="flex rounded-full bg-[#e9e9e5] p-1">
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
      </header>

      {!isPostHogAdminConfigured() ? <SetupState /> : null}
      {failed ? <UnavailableState /> : null}
      {analytics ? (
        <>
          <section className="grid overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Pageviews" value={analytics.summary.pageviews} />
            <MetricCard label="Visitors" value={analytics.summary.uniqueVisitors} />
            <MetricCard label="Sessions" value={analytics.summary.sessions} />
            <MetricCard label="Bounce rate" value={analytics.summary.bounceRate} format="percent" />
            <MetricCard label="Average visit" value={analytics.summary.averageSessionDuration} format="duration" />
            <MetricCard label="Views per session" value={analytics.summary.viewsPerSession} format="decimal" />
            <MetricCard label="Post opens" value={analytics.summary.postOpens} />
            <MetricCard label="Source clicks" value={analytics.summary.sourceClicks} />
            <MetricCard label="Subscribers" value={analytics.summary.subscriptions} />
          </section>
          <TrafficChart daily={analytics.daily} range={analytics.range} />
          <HourlyActivityChart analytics={analytics} />
          <div className="grid gap-7 xl:grid-cols-2">
            <TopPosts analytics={analytics} />
            <RankedBreakdown
              eyebrow="Audience"
              title="Top countries"
              items={analytics.topCountries}
              emptyMessage="Country data will appear after visitors allow analytics."
              note="Location is available only for visitors who allow analytics; limited mode removes the IP before GeoIP enrichment."
            />
            <RankedBreakdown
              eyebrow="Acquisition"
              title="Top referrers"
              items={analytics.topReferrers}
              emptyMessage="Traffic sources will appear here."
            />
            <AudienceTechnologyCard
              devices={analytics.topDevices}
              browsers={analytics.topBrowsers}
            />
          </div>
          <PostHogTools tools={analytics.tools} />
          <aside className="rounded-xl bg-[#ecece8] px-4 py-3 text-xs leading-5 text-[#777]">
            Multi-day visitor totals can be higher for people using limited analytics because
            their anonymous identifier rotates daily. Session replay remains disabled.
          </aside>
          <p className="text-right text-xs text-[#999]">
            Cached for five minutes · Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(analytics.generatedAt))}
          </p>
        </>
      ) : null}
    </div>
  );
}
