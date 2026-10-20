import "server-only";

import { and, eq, gt, isNull, isNotNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { cacheLife, cacheTag } from "next/cache";

import { getDatabase } from "@/db/client";
import {
  sponsorAccounts,
  sponsorCampaignVersions,
  sponsorIdentities,
  sponsorSeats,
  sponsors,
} from "@/db/schema";
import { sponsorshipEnabled } from "@/features/sponsorship/config";
import type { ActiveSponsor } from "@/domain/sponsor";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";

export const SPONSOR_CACHE_TAG = "active-sponsor";

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function isMissingTableError(error: unknown): boolean {
  let current = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === "42P01") return true;
    if (current.message.includes('relation "sponsors" does not exist'))
      return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function getActiveSponsor(): Promise<ActiveSponsor | null> {
  "use cache";
  cacheTag(SPONSOR_CACHE_TAG);
  cacheLife({
    stale: 300,
    revalidate: 21600,
    expire: 604800,
  });

  const database = getDatabase();
  if (!database) return null;

  try {
    const rows = await database
      .select()
      .from(sponsors)
      .where(eq(sponsors.isActive, true))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      url: row.url,
      tagline: row.tagline ?? undefined,
      mediaType: row.mediaType as "image" | "video",
      mediaUrl: row.mediaUrl ?? undefined,
      mediaPosterUrl: row.mediaPosterUrl ?? undefined,
      mediaStorageProvider: isStorageProvider(row.mediaStorageProvider)
        ? (row.mediaStorageProvider as ActiveSponsor["mediaStorageProvider"])
        : undefined,
      mediaWidth: row.mediaWidth,
      mediaHeight: row.mediaHeight,
      mediaVariants: row.mediaVariants,
      mediaVideoPreview: row.mediaVideoPreview ?? undefined,
      mediaAlt: row.mediaAlt,
      iconUrl: row.iconUrl ?? undefined,
      iconStorageProvider: isStorageProvider(row.iconStorageProvider)
        ? (row.iconStorageProvider as ActiveSponsor["iconStorageProvider"])
        : undefined,
    };
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error("Failed to query active sponsor", error);
    }
    return null;
  }
}

export async function getActiveSponsors(): Promise<ActiveSponsor[]> {
  if (!sponsorshipEnabled()) {
    const legacy = await getActiveSponsor();
    return legacy ? [legacy] : [];
  }
  await connection();
  const db = getDatabase();
  if (!db) return [];
  const now = new Date();
  const rows = await db
    .select({
      campaign: sponsors,
      paidThrough: sponsorAccounts.paidThrough,
      versionId: sponsorCampaignVersions.id,
      feedDescription: sql<string | null>`${sponsorCampaignVersions.creative}->>'feedDescription'`,
    })
    .from(sponsors)
    .innerJoin(sponsorAccounts, eq(sponsors.accountId, sponsorAccounts.id))
    .innerJoin(
      sponsorIdentities,
      eq(sponsorAccounts.ownerUserId, sponsorIdentities.userId),
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
      and(
        eq(sponsorCampaignVersions.campaignId, sponsors.id),
        eq(sponsorCampaignVersions.revision, sponsors.revision),
      ),
    )
    .where(
      and(
        eq(sponsors.campaignState, "published"),
        isNull(sponsors.deletedAt),
        isNotNull(sponsors.iconUrl),
        isNotNull(sponsors.wordmarkUrl),
        sql`(${sponsors.mediaUrl} is null or (${sponsors.mediaType} <> 'video' or (${sponsors.mediaPosterUrl} is not null and ${sponsors.mediaVideoPreview} is not null)))`,
        eq(sponsorAccounts.state, "active"),
        eq(sponsorIdentities.state, "allowed"),
        gt(sponsorAccounts.paidThrough, now),
      ),
    )
    .orderBy(sponsorSeats.slot)
    .limit(4);
  return rows.map(({ campaign: row, paidThrough, versionId, feedDescription }) => ({
    id: row.id,
    versionId,
    title: row.title,
    url: row.url,
    tagline: row.tagline ?? undefined,
    feedDescription: feedDescription ?? undefined,
    mediaType: row.mediaType as "image" | "video",
    mediaUrl: row.mediaUrl ?? undefined,
    mediaPosterUrl: row.mediaPosterUrl ?? undefined,
    mediaStorageProvider: row.mediaStorageProvider === "r2" ? "r2" : undefined,
    mediaWidth: row.mediaWidth,
    mediaHeight: row.mediaHeight,
    mediaVariants: row.mediaVariants,
    mediaVideoPreview: row.mediaVideoPreview ?? undefined,
    mediaAlt: row.mediaAlt,
    iconUrl: row.iconUrl ?? undefined,
    iconStorageProvider: row.iconStorageProvider === "r2" ? "r2" : undefined,
    wordmarkUrl: row.wordmarkUrl ?? undefined,
    paidThrough: paidThrough!.toISOString(),
    serverTime: now.toISOString(),
  }));
}

// Keep the ticket02 and Design callers on the shared eligibility query.
export const getDesignSponsors = getActiveSponsors;
