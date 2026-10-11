import "server-only";
import {
  analyticsEvents,
  analyticsOccurrences,
  analyticsReports,
  sponsorDeliveryIntervals,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import {
  sponsorAccounts,
  sponsorAssets,
  sponsorCampaignVersions,
  sponsorCheckouts,
  sponsorIdentities,
  sponsorSeats,
  sponsorVersionAssets,
  sponsors,
} from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { withSponsorWrite } from "./repository";
import { queueSponsorJob } from "./jobs-store";
import { SPONSOR_CACHE_TAG } from "@/data/sponsor-repository";
import { reconcileSponsorCheckout } from "./billing-repository";
import type { BillingProvider } from "./stripe-client";
import { privateSponsorStorage } from "@/storage/private-sponsor-assets";
import { deleteSponsorPublicKeys } from "./public-media";
import { createSponsorPublicAssetKey } from "./public-media-key";
export async function queueSponsorIdentityDeletion(
  tx: WriteTx,
  userId: string,
  now = new Date(),
) {
  // Preserve pre-migration ordinary deletion without weakening already-installed
  // sponsor handling when the feature flag is off.
  const exists = await tx.execute(
    sql`select to_regclass('public.sponsor_identities') is not null as present`,
  );
  if (!exists.rows[0]?.present) return false;
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${"sponsorship:" + userId},0))`,
  );
  const [identity] = await tx
    .select()
    .from(sponsorIdentities)
    .where(eq(sponsorIdentities.userId, userId));
  if (!identity) return false;
  await tx
    .update(sponsorIdentities)
    .set({ state: "deleting", updatedAt: now })
    .where(eq(sponsorIdentities.userId, userId));
  await tx
    .update(sponsorAccounts)
    .set({ state: "deleting", updatedAt: now })
    .where(eq(sponsorAccounts.ownerUserId, userId));
  await queueSponsorJob(
    tx,
    "delete_owner",
    userId,
    `delete-owner:${userId}`,
    now,
  );
  return true;
}
export async function cleanupDeletedSponsorOwner(
  owner: string,
  provider: BillingProvider,
  now = new Date(),
) {
  const checkouts = await withSponsorWrite(async (tx) =>
    tx
      .select({ id: sponsorCheckouts.id })
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.ownerUserId, owner)),
  );
  for (const p of checkouts)
    if (!(await reconcileSponsorCheckout(p.id, provider, undefined, now)))
      return false;
  return withSponsorWrite(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"sponsorship:" + owner},0))`,
    );
    await tx.execute(
      sql`select set_config('inspora.sponsor_writer','on',true)`,
    );
    const [identity] = await tx
      .select()
      .from(sponsorIdentities)
      .where(eq(sponsorIdentities.userId, owner));
    if (identity?.state !== "deleting") return true;
    const [account] = await tx
      .select()
      .from(sponsorAccounts)
      .where(eq(sponsorAccounts.ownerUserId, owner));
    if (account) {
      const seats = await tx
        .select()
        .from(sponsorSeats)
        .where(eq(sponsorSeats.accountId, account.id));
      if (seats.length) return false;
    }
    const versions = await tx
      .select()
      .from(sponsorCampaignVersions)
      .where(eq(sponsorCampaignVersions.ownerUserId, owner));
    if (account) {
      const keys = versions.flatMap((v) =>
        v.creative.assets
          .filter((a) => a.kind !== "original")
          .map((asset) =>
            createSponsorPublicAssetKey({
              accountId: account.id,
              campaignId: v.campaignId,
              versionId: v.id,
              asset,
            }),
          ),
      );
      await deleteSponsorPublicKeys(account.id, keys);
    }
    const assets = await tx
      .select()
      .from(sponsorAssets)
      .where(eq(sponsorAssets.ownerUserId, owner));
    for (const asset of assets)
      for (const key of new Set([
        asset.stagingKey,
        asset.objectKey ??
          asset.stagingKey.replace(
            /\/staging\/[^/]+\.([a-z0-9]+)$/,
            "/source/original.$1",
          ),
      ]))
        await privateSponsorStorage().delete(key);
    if (versions.length) {
      const campaignIds = [
        ...new Set(versions.map((version) => version.campaignId)),
      ];
      const events = await tx
        .select({ id: analyticsEvents.occurrenceId })
        .from(analyticsEvents)
        .where(inArray(analyticsEvents.campaignId, campaignIds));
      if (events.length)
        await tx.delete(analyticsOccurrences).where(
          inArray(
            analyticsOccurrences.occurrenceId,
            events.map((event) => event.id),
          ),
        );
      await tx
        .delete(analyticsEvents)
        .where(inArray(analyticsEvents.campaignId, campaignIds));
      await tx
        .delete(sponsorDeliveryIntervals)
        .where(inArray(sponsorDeliveryIntervals.campaignId, campaignIds));
      if (account)
        await tx
          .delete(analyticsReports)
          .where(eq(analyticsReports.scope, account.id));
    }
    if (versions.length)
      await tx.delete(sponsorVersionAssets).where(
        and(
          eq(sponsorVersionAssets.ownerUserId, owner),
          inArray(
            sponsorVersionAssets.versionId,
            versions.map((v) => v.id),
          ),
        ),
      );
    await tx
      .delete(sponsorCampaignVersions)
      .where(eq(sponsorCampaignVersions.ownerUserId, owner));
    // Derivative source FKs require removal before their originals.
    for (const asset of assets.sort(
      (a, b) =>
        Number(Boolean(b.sourceAssetId)) - Number(Boolean(a.sourceAssetId)),
    ))
      await tx.delete(sponsorAssets).where(eq(sponsorAssets.id, asset.id));
    await tx
      .update(sponsorCheckouts)
      .set({
        snapshot: null,
        campaignId: null,
        state: "expired",
        releasedAt: now,
      })
      .where(eq(sponsorCheckouts.ownerUserId, owner));
    await tx.delete(sponsors).where(eq(sponsors.ownerUserId, owner));
    return true;
  });
}
export function invalidateDeletedSponsor() {
  revalidateTag(SPONSOR_CACHE_TAG, { expire: 0 });
}
