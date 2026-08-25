import "server-only";

import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDatabase } from "@/db/client";
import { sponsors } from "@/db/schema";
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
    if (current.message.includes('relation "sponsors" does not exist')) return true;
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
