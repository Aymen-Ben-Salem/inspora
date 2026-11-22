import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { withWriteTransaction } from "@/db/write-client";
import {
  analyticsReports,
  sponsorCampaignVersions,
  sponsorDeliveryIntervals,
  sponsorDeliveryPeriods,
  sponsors,
} from "@/db/schema";
import { campaignRuns } from "./campaign-runs";
import { requireSponsorActor } from "./authorization";
import { createSponsorAnalyticsService } from "./analytics-service";
import { readMetricsReport } from "@/analytics/first-party/reports";
import type { MetricsFilter } from "@/analytics/first-party/query";

export function accountOwnsReportFilters(accountId: string, filter: MetricsFilter) {
  if (!filter.campaignId && !filter.versionId && !filter.periodId && !filter.compareCampaignId) return true;
  return withWriteTransaction(async (tx) => {
    if (filter.compareCampaignId) {
      const [c] = await tx
        .select({ id: sponsors.id })
        .from(sponsors)
        .where(and(eq(sponsors.id, filter.compareCampaignId), eq(sponsors.accountId, accountId)));
      if (!c) return false;
    }
    if (filter.campaignId) {
      const [c] = await tx
        .select({ id: sponsors.id })
        .from(sponsors)
        .where(
          and(
            eq(sponsors.id, filter.campaignId),
            eq(sponsors.accountId, accountId),
          ),
        );
      if (!c) return false;
    }
    if (filter.versionId) {
      const [v] = await tx
        .select({ campaignId: sponsorCampaignVersions.campaignId })
        .from(sponsorCampaignVersions)
        .innerJoin(
          sponsors,
          eq(sponsors.id, sponsorCampaignVersions.campaignId),
        )
        .where(
          and(
            eq(sponsorCampaignVersions.id, filter.versionId),
            eq(sponsors.accountId, accountId),
          ),
        );
      if (!v || (filter.campaignId && v.campaignId !== filter.campaignId))
        return false;
    }
    if (filter.periodId) {
      const [p] = await tx
        .select({ id: sponsorDeliveryPeriods.id })
        .from(sponsorDeliveryPeriods)
        .where(
          and(
            eq(sponsorDeliveryPeriods.id, filter.periodId),
            eq(sponsorDeliveryPeriods.accountId, accountId),
          ),
        );
      if (!p) return false;
    }
    return true;
  });
}

export const readOwnSponsorMetrics = createSponsorAnalyticsService({
  actor: () => requireSponsorActor("read"),
  owns: async (actor, filter) => accountOwnsReportFilters(actor.accountId, filter),
  read: (actor, filter, refresh) =>
    readMetricsReport(actor.accountId, filter, refresh),
});
export async function readOwnAnalyticsCatalog() {
  const actor = await requireSponsorActor("read");
  return readAccountAnalyticsCatalog(actor.accountId);
}

export function readAccountAnalyticsCatalog(accountId: string) {
  return withWriteTransaction(async (tx) => ({
    campaigns: await tx
      .select({ id: sponsors.id, title: sponsors.title })
      .from(sponsors)
      .where(eq(sponsors.accountId, accountId)),
    versions: await tx
      .select({
        id: sponsorCampaignVersions.id,
        campaignId: sponsorCampaignVersions.campaignId,
        revision: sponsorCampaignVersions.revision,
      })
      .from(sponsorCampaignVersions)
      .innerJoin(sponsors, eq(sponsors.id, sponsorCampaignVersions.campaignId))
      .where(eq(sponsors.accountId, accountId)),
    // When each campaign was public, for choosing report dates by campaign.
    runs: campaignRuns(
      await tx
        .select({
          campaignId: sponsorDeliveryIntervals.campaignId,
          startAt: sponsorDeliveryIntervals.startAt,
          endAt: sponsorDeliveryIntervals.endAt,
        })
        .from(sponsorDeliveryIntervals)
        .where(eq(sponsorDeliveryIntervals.accountId, accountId)),
    ),
    periods: (
      await tx
        .select({
          id: sponsorDeliveryPeriods.id,
          startAt: sponsorDeliveryPeriods.startAt,
          endAt: sponsorDeliveryPeriods.endAt,
        })
        .from(sponsorDeliveryPeriods)
        .innerJoin(
          analyticsReports,
          eq(
            analyticsReports.key,
            sql`'closed-whole:' || ${sponsorDeliveryPeriods.id}::text`,
          ),
        )
        .where(
          and(
            eq(sponsorDeliveryPeriods.accountId, accountId),
            eq(analyticsReports.scope, accountId),
            gt(analyticsReports.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(sponsorDeliveryPeriods.endAt))
    ).map((p) => ({
      id: p.id,
      start: p.startAt.toISOString(),
      end: p.endAt.toISOString(),
    })),
    publicCreative:
      (
        await tx
          .select({
            id: sponsors.id,
            title: sponsors.title,
            url: sponsors.url,
            mediaType: sponsors.mediaType,
            mediaUrl: sponsors.mediaUrl,
            mediaPosterUrl: sponsors.mediaPosterUrl,
            mediaWidth: sponsors.mediaWidth,
            mediaHeight: sponsors.mediaHeight,
            mediaAlt: sponsors.mediaAlt,
            iconUrl: sponsors.iconUrl,
            wordmarkUrl: sponsors.wordmarkUrl,
          })
          .from(sponsors)
          .where(
            and(
              eq(sponsors.accountId, accountId),
              eq(sponsors.campaignState, "published"),
            ),
          )
          .limit(1)
      )[0] ?? null,
  }));
}
