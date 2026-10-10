import "server-only";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import {
  sponsorAssets,
  sponsorCampaignVersions,
  sponsorCheckouts,
  sponsorVersionAssets,
  sponsors,
} from "@/db/schema";
import { getDatabase } from "@/db/client";
import { privateSponsorStorage } from "@/storage/private-sponsor-assets";
import { withSponsorWrite } from "./repository";
// Bounded, retry-safe cleanup. Only expired unpaid preparations are eligible.
export async function cleanupExpiredSponsorPreparations(now = new Date()) {
  const db = getDatabase();
  if (!db) throw new Error("Sponsor storage unavailable.");
  const expired = await db
    .select()
    .from(sponsorCheckouts)
    .where(
      and(
        inArray(sponsorCheckouts.state, ["preparing", "ready", "expired"]),
        lte(sponsorCheckouts.expiresAt, now),
        sql`(${sponsorCheckouts.campaignId} is not null or exists (select 1 from sponsor_assets where checkout_id = ${sponsorCheckouts.id}))`,
      ),
    )
    .limit(25);
  let removed = 0;
  for (const candidate of expired) {
    const keys = await withSponsorWrite(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"sponsorship:" + candidate.ownerUserId},0))`,
      );
      const [p] = await tx
        .select()
        .from(sponsorCheckouts)
        .where(eq(sponsorCheckouts.id, candidate.id))
        .for("update");
      if (
        !p ||
        !["preparing", "ready", "expired"].includes(p.state) ||
        p.expiresAt > now
      )
        return [];
      if (p.campaignId) {
        const [campaign] = await tx
          .select()
          .from(sponsors)
          .where(
            and(
              eq(sponsors.id, p.campaignId),
              eq(sponsors.ownerUserId, p.ownerUserId),
            ),
          );
        if (
          !campaign ||
          campaign.accountId ||
          campaign.campaignState !== "prepared"
        )
          return [];
        const versions = await tx
          .select({ id: sponsorCampaignVersions.id })
          .from(sponsorCampaignVersions)
          .where(
            and(
              eq(sponsorCampaignVersions.campaignId, campaign.id),
              eq(sponsorCampaignVersions.ownerUserId, p.ownerUserId),
            ),
          );
        if (versions.length) {
          await tx.delete(sponsorVersionAssets).where(
            and(
              inArray(
                sponsorVersionAssets.versionId,
                versions.map((v) => v.id),
              ),
              eq(sponsorVersionAssets.ownerUserId, p.ownerUserId),
            ),
          );
          await tx.delete(sponsorCampaignVersions).where(
            inArray(
              sponsorCampaignVersions.id,
              versions.map((v) => v.id),
            ),
          );
        }
        await tx
          .update(sponsorCheckouts)
          .set({ state: "expired", campaignId: null, snapshot: null })
          .where(eq(sponsorCheckouts.id, p.id));
        await tx.delete(sponsors).where(eq(sponsors.id, campaign.id));
      } else
        await tx
          .update(sponsorCheckouts)
          .set({ state: "expired", snapshot: null })
          .where(eq(sponsorCheckouts.id, p.id));
      const unreferenced = await tx
        .select()
        .from(sponsorAssets)
        .where(
          and(
            eq(sponsorAssets.checkoutId, p.id),
            eq(sponsorAssets.ownerUserId, p.ownerUserId),
            lte(sponsorAssets.expiresAt, now),
            sql`not exists (select 1 from sponsor_version_assets where asset_id = ${sponsorAssets.id})`,
          ),
        );
      if (unreferenced.length)
        await tx
          .update(sponsorAssets)
          .set({ state: "deleting" })
          .where(
            inArray(
              sponsorAssets.id,
              unreferenced.map((a) => a.id),
            ),
          );
      return unreferenced;
    });
    // Derivatives hold a restrictive source FK; remove them before their originals.
    for (const asset of keys.sort(
      (a, b) =>
        Number(Boolean(b.sourceAssetId)) - Number(Boolean(a.sourceAssetId)),
    )) {
      const storage = privateSponsorStorage();
      // A freeze can finish before a DB transaction fails. Its deterministic
      // source key must be removed at expiry too.
      const frozenKey = asset.stagingKey.replace(
        /\/staging\/[^/]+\.([a-z0-9]+)$/,
        "/source/original.$1",
      );
      for (const key of new Set([
        asset.stagingKey,
        asset.objectKey ?? frozenKey,
      ]))
        await storage.delete(key);
      await withSponsorWrite(async (tx) => {
        await tx
          .delete(sponsorAssets)
          .where(
            and(
              eq(sponsorAssets.id, asset.id),
              eq(sponsorAssets.state, "deleting"),
              sql`not exists (select 1 from sponsor_version_assets where asset_id = ${sponsorAssets.id})`,
            ),
          );
      });
      removed++;
    }
  }
  removed += await cleanupExpiredPaidUploads(now);
  return { expired: expired.length, removed };
}

async function cleanupExpiredPaidUploads(now: Date) {
  const candidates = await getDatabase()!.select({ id: sponsorAssets.id, owner: sponsorAssets.ownerUserId }).from(sponsorAssets).where(and(
    lte(sponsorAssets.expiresAt, now),
    sql`exists (select 1 from sponsor_checkouts where id = ${sponsorAssets.checkoutId} and state = 'completed')`,
    sql`not exists (select 1 from sponsor_version_assets where asset_id = ${sponsorAssets.id})`,
  )).orderBy(sql`case when ${sponsorAssets.kind} = 'original' then 1 else 0 end`).limit(25);
  let removed = 0;
  for (const candidate of candidates) {
    const deleted = await withSponsorWrite(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"sponsorship:" + candidate.owner},0))`);
      const [asset] = await tx.select().from(sponsorAssets).where(and(eq(sponsorAssets.id, candidate.id), lte(sponsorAssets.expiresAt,now), sql`not exists (select 1 from sponsor_version_assets where asset_id = ${sponsorAssets.id})`, sql`not exists (select 1 from sponsor_assets child where child.source_asset_id = ${sponsorAssets.id})`));
      if (!asset) return false;
      const storage = privateSponsorStorage();
      for (const key of new Set([asset.stagingKey, asset.objectKey ?? asset.stagingKey.replace(/\/staging\/[^/]+\.([a-z0-9]+)$/, "/source/original.$1")])) await storage.delete(key);
      await tx.delete(sponsorAssets).where(eq(sponsorAssets.id, asset.id));
      return true;
    });
    if (deleted) removed++;
  }
  return removed;
}
