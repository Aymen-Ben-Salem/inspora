import "server-only";
import { and, eq } from "drizzle-orm";
import { withWriteTransaction } from "@/db/write-client";
import {
  sponsorCampaignVersions,
  sponsorDeliveryPeriods,
  sponsors,
} from "@/db/schema";
import { requireSponsorActor } from "./authorization";
import { createSponsorAnalyticsService } from "./analytics-service";
import { readMetricsReport } from "@/analytics/first-party/reports";
export const readOwnSponsorMetrics = createSponsorAnalyticsService({
  actor: () => requireSponsorActor("read"),
  owns: async (actor, filter) =>
    withWriteTransaction(async (tx) => {
      if (filter.campaignId) {
        const [c] = await tx
          .select({ id: sponsors.id })
          .from(sponsors)
          .where(
            and(
              eq(sponsors.id, filter.campaignId),
              eq(sponsors.accountId, actor.accountId),
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
              eq(sponsors.accountId, actor.accountId),
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
              eq(sponsorDeliveryPeriods.accountId, actor.accountId),
            ),
          );
        if (!p) return false;
      }
      return true;
    }),
  read: (actor, filter, refresh) =>
    readMetricsReport(actor.accountId, filter, refresh),
});
export async function readOwnAnalyticsCatalog() {
  const actor = await requireSponsorActor("read");
  return withWriteTransaction(async (tx) => ({
    campaigns: await tx
      .select({ id: sponsors.id, title: sponsors.title })
      .from(sponsors)
      .where(eq(sponsors.accountId, actor.accountId)),
    versions: await tx
      .select({
        id: sponsorCampaignVersions.id,
        campaignId: sponsorCampaignVersions.campaignId,
        revision: sponsorCampaignVersions.revision,
      })
      .from(sponsorCampaignVersions)
      .innerJoin(sponsors, eq(sponsors.id, sponsorCampaignVersions.campaignId))
      .where(eq(sponsors.accountId, actor.accountId)),
    periods: (
      await tx
        .select()
        .from(sponsorDeliveryPeriods)
        .where(eq(sponsorDeliveryPeriods.accountId, actor.accountId))
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
              eq(sponsors.accountId, actor.accountId),
              eq(sponsors.campaignState, "published"),
            ),
          )
          .limit(1)
      )[0] ?? null,
  }));
}
