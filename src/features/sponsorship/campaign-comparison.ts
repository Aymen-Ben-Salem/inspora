import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { withWriteTransaction } from "@/db/write-client";
import { analyticsEvents, sponsorDeliveryIntervals, sponsors } from "@/db/schema";
import { requireSponsorActor } from "./authorization";
import {
  COMPARISON_RETENTION_DAYS,
  compareCampaigns,
  type CampaignCounts,
} from "./campaign-comparison-model";

export async function readAccountCampaignComparison(accountId: string, now = new Date()) {
  const since = new Date(now.getTime() - COMPARISON_RETENTION_DAYS * 86400000);
  return withWriteTransaction(async (tx) => {
    const campaigns = await tx
      .select({ id: sponsors.id, title: sponsors.title, state: sponsors.campaignState })
      .from(sponsors)
      .where(and(eq(sponsors.accountId, accountId), isNull(sponsors.deletedAt)));
    const intervals = await tx
      .select({
        campaignId: sponsorDeliveryIntervals.campaignId,
        startAt: sponsorDeliveryIntervals.startAt,
        endAt: sponsorDeliveryIntervals.endAt,
      })
      .from(sponsorDeliveryIntervals)
      .where(eq(sponsorDeliveryIntervals.accountId, accountId));
    const totals = await tx.execute(sql`
      select e.campaign_id as "campaignId",
        count(*) filter (where e.kind='sponsor_impression') as impressions,
        count(*) filter (where e.kind='sponsor_click') as clicks,
        count(distinct e.visitor_key) filter (where e.kind='sponsor_impression') as "uniqueVisitors",
        count(*) filter (where e.kind='sponsor_preview_started') as "previewStarts",
        count(*) filter (where e.kind='sponsor_preview_progress' and e.milestone=100) as completions
      from ${analyticsEvents} e join ${sponsors} s on s.id=e.campaign_id
      where s.account_id=${accountId}::uuid and e.occurred_at >= ${since.toISOString()}::timestamptz
      group by e.campaign_id`);
    const counts: Record<string, CampaignCounts> = {};
    for (const row of totals.rows)
      counts[String(row.campaignId)] = {
        impressions: Number(row.impressions),
        clicks: Number(row.clicks),
        uniqueVisitors: Number(row.uniqueVisitors),
        previewStarts: Number(row.previewStarts),
        completions: Number(row.completions),
      };
    return compareCampaigns({
      campaigns: campaigns.map(c => ({ id: c.id, title: c.title, live: c.state === "published" })),
      intervals,
      counts,
      now,
    });
  });
}

export async function readOwnCampaignComparison() {
  const actor = await requireSponsorActor("read");
  return readAccountCampaignComparison(actor.accountId);
}
