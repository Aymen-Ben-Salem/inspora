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
  type AnalyticsRange,
} from "@/analytics/posthog-data";

type AnalyticsPageProps = {
  searchParams: Promise<{ days?: string | string[] }>;
};

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });
const exactNumber = new Intl.NumberFormat("en");
const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

function parseRange(value: string | string[] | undefined): AnalyticsRange {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return isAnalyticsRange(parsed) ? parsed : 30;
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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="min-w-0 bg-white p-5 sm:p-6">
      <p className="text-xs uppercase tracking-[0.12em] text-[#777]">{label}</p>
      <p className="mt-4 text-3xl font-medium tracking-[-0.05em] sm:text-4xl" title={exactNumber.format(value)}>
        {compactNumber.format(value)}
      </p>
    </article>
  );
}

function ActivityChart({ analytics }: { analytics: AdminAnalytics }) {
  const maximum = Math.max(1, ...analytics.daily.map((day) => day.pageviews));

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Traffic</p>
          <h2 className="mt-1 text-2xl font-medium tracking-[-0.04em]">Daily pageviews</h2>
        </div>
        <p className="text-xs text-[#888]">Last {analytics.rangeDays} days</p>
      </div>
      <div className="mt-8 overflow-x-auto pb-2">
        <div
          className="flex h-56 min-w-full items-end gap-1.5 border-b border-black/10"
          style={{ width: analytics.rangeDays === 90 ? 1080 : undefined }}
        >
          {analytics.daily.map((day, index) => {
            const height = day.pageviews === 0 ? 2 : Math.max(6, (day.pageviews / maximum) * 100);
            const showLabel =
              index === 0 ||
              index === analytics.daily.length - 1 ||
              (analytics.rangeDays === 7 ? true : index % (analytics.rangeDays === 30 ? 7 : 14) === 0);

            return (
              <div key={day.date} className="group relative flex h-full min-w-2 flex-1 items-end">
                <div
                  className="w-full rounded-t-sm bg-[#222] transition-colors duration-200 group-hover:bg-[#777]"
                  style={{ height: `${height}%` }}
                  title={`${dateFormatter.format(new Date(`${day.date}T00:00:00Z`))}: ${exactNumber.format(day.pageviews)} pageviews`}
                  aria-label={`${dateFormatter.format(new Date(`${day.date}T00:00:00Z`))}: ${exactNumber.format(day.pageviews)} pageviews`}
                />
                {showLabel ? (
                  <span className="absolute left-0 top-[calc(100%+8px)] whitespace-nowrap text-[10px] text-[#999]">
                    {dateFormatter.format(new Date(`${day.date}T00:00:00Z`))}
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
              {option}d
            </Link>
          ))}
        </nav>
      </header>

      {!isPostHogAdminConfigured() ? <SetupState /> : null}
      {failed ? <UnavailableState /> : null}
      {analytics ? (
        <>
          <section className="grid overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Pageviews" value={analytics.summary.pageviews} />
            <MetricCard label="Visitors" value={analytics.summary.uniqueVisitors} />
            <MetricCard label="Post opens" value={analytics.summary.postOpens} />
            <MetricCard label="Source clicks" value={analytics.summary.sourceClicks} />
            <MetricCard label="Subscribers" value={analytics.summary.subscriptions} />
          </section>
          <div className="grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
            <ActivityChart analytics={analytics} />
            <TopPosts analytics={analytics} />
          </div>
          <p className="text-right text-xs text-[#999]">
            Cached for five minutes · Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(analytics.generatedAt))}
          </p>
        </>
      ) : null}
    </div>
  );
}
