import "server-only";
import { auth } from "@clerk/nextjs/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  sponsorAccounts,
  sponsorCampaignVersions,
  sponsorDeliveryIntervals,
  sponsorIdentities,
  sponsorSeats,
  sponsors,
} from "@/db/schema";
import { getConfiguredAdminUserIds, isClerkConfigured } from "@/auth/config";
import { createAnalyticsCollector } from "./collector";
import { decodeDeliveryToken } from "./context";
import { readVisitorContext } from "./identity";
import { storeAnalyticsEvents } from "./store";
import type { DeliveryContext } from "./types";
export function requestAnalyticsDisabled(request: Request) {
  return (
    request.headers.get("dnt") === "1" ||
    request.headers.get("sec-gpc") === "1" ||
    /(?:^|;\s*)inspora_analytics_disabled=1(?:;|$)/.test(
      request.headers.get("cookie") ?? "",
    )
  );
}
export async function analyticsActor() {
  const userId = isClerkConfigured() ? (await auth()).userId : null;
  return {
    userId,
    excluded: Boolean(
      userId &&
      (getConfiguredAdminUserIds().has(userId) ||
        (process.env.ANALYTICS_TEST_USER_IDS ?? "")
          .split(",")
          .includes(userId)),
    ),
  };
}
export async function eligibleDelivery(
  context: DeliveryContext,
  userId: string | null,
  now: Date,
  occurredAt = now,
) {
  const db = getDatabase();
  if (!db) throw new Error("Analytics unavailable.");
  if (!context.campaignId) return true;
  const [row] = await db
    .select({ owner: sponsors.ownerUserId, mediaType: sponsors.mediaType })
    .from(sponsors)
    .innerJoin(sponsorAccounts, eq(sponsorAccounts.id, sponsors.accountId))
    .innerJoin(
      sponsorIdentities,
      eq(sponsorIdentities.userId, sponsorAccounts.ownerUserId),
    )
    .innerJoin(
      sponsorSeats,
      and(
        eq(sponsorSeats.accountId, sponsorAccounts.id),
        eq(sponsorSeats.state, "occupied"),
      ),
    )
    .innerJoin(
      sponsorCampaignVersions,
      eq(sponsorCampaignVersions.campaignId, sponsors.id),
    )
    .where(
      and(
        eq(sponsors.id, context.campaignId),
        eq(sponsorCampaignVersions.id, context.versionId!),
        isNull(sponsors.deletedAt),
        eq(sponsorAccounts.state, "active"),
        eq(sponsorIdentities.state, "allowed"),
        gt(sponsorAccounts.paidThrough, now),
        sql`exists(select 1 from ${sponsorDeliveryIntervals} where account_id=${sponsorAccounts.id} and version_id=${context.versionId!}::uuid and start_at<=${occurredAt} and (end_at is null or end_at>=${occurredAt}))`,
      ),
    );
  return Boolean(row && row.owner !== userId);
}
export async function acceptAnalyticsBatch(request: Request, input: unknown) {
  if (requestAnalyticsDisabled(request))
    return { accepted: [], duplicate: [], excluded: [] };
  const actor = await analyticsActor();
  const now = new Date();
  return createAnalyticsCollector({
    now: () => now,
    decode: decodeDeliveryToken,
    visitor: readVisitorContext,
    allowed: async (_r, c, at) =>
      !actor.excluded && eligibleDelivery(c, actor.userId, now, at),
    store: (events) => storeAnalyticsEvents(events, now),
  })(request, input);
}
