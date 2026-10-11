import {
  readSiteAudienceMetrics,
  readAdminSponsorMetrics,
} from "@/analytics/first-party/admin";
import { AnalyticsTable, VISITOR_DEFINITION } from "./analytics-overview";
import type { SponsorRange } from "@/analytics/first-party/types";
export async function AdminAnalyticsSources({
  range,
}: {
  range: SponsorRange;
}) {
  const site = await readSiteAudienceMetrics(range);
  return (
    <>
      <section className="space-y-6 rounded-md border border-black/10 bg-white p-5 sm:p-7">
        <h2 className="text-2xl font-medium">Inspora accepted events</h2>
        <p className="text-sm text-[#767676]">
          Public-site audience · rolling {range} · UTC. {VISITOR_DEFINITION}
        </p>
        {site.status === "unavailable" ? (
          <p role="status">
            Site audience is unavailable; no zero traffic is inferred.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-sm text-[#767676]">Page views</p>
                <p className="mt-2 text-3xl tabular-nums">
                  {site.summary.pageviews.toLocaleString("en")}
                </p>
              </div>
              <div>
                <p className="text-sm text-[#767676]">Unique visitors</p>
                <p className="mt-2 text-3xl tabular-nums">
                  {site.summary.siteVisitors.toLocaleString("en")}
                </p>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <AnalyticsTable title="Countries" site rows={site.country} />
              <AnalyticsTable title="Devices" site rows={site.device} />
              <AnalyticsTable
                title="Referring sites"
                site
                rows={site.referrer}
              />
              <AnalyticsTable
                title="Daily public page views"
                site
                rows={site.daily}
              />
            </div>
            <p className="text-xs text-[#767676]">
              {site.status === "stale" ? "Stale · " : ""}Last updated{" "}
              {site.asOf} UTC
            </p>
          </>
        )}
      </section>
    </>
  );
}
export async function AdminSponsorAnalytics({
  accountId,
}: {
  accountId: string;
}) {
  const data = await readAdminSponsorMetrics(accountId, "30d");
  return (
    <section className="mt-5 space-y-4 rounded-md border border-[#f0f0f0] p-5">
      <h3 className="font-medium">Inspora accepted events · 30 days</h3>
      {data.status === "unavailable" ? (
        <p className="text-sm">Performance unavailable.</p>
      ) : (
        <>
          <p className="text-sm">
            {data.summary.impressions} impressions · {data.summary.clicks}{" "}
            clicks · {data.summary.uniqueVisitors} Unique visitors ·{" "}
            {data.summary.ctr === null
              ? "CTR unavailable"
              : `${data.summary.ctr.toFixed(2)}% CTR`}
          </p>
          <AnalyticsTable title="Placements" rows={data.placement} />
          <AnalyticsTable title="Countries" rows={data.country} />
          <p className="text-xs text-[#767676]">
            {data.status} · Last updated {data.asOf} UTC
          </p>
        </>
      )}
    </section>
  );
}
