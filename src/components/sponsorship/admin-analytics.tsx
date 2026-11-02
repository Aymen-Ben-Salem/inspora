import { readAdminSponsorMetrics } from "@/analytics/first-party/admin";
import { AnalyticsTable } from "./analytics-overview";
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
