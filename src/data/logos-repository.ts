import "server-only";

import { and, eq, lte } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { logos } from "@/db/schema";
import type { Logo } from "@/domain/logo";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";
import { readWorkPage } from "./public-work";

export { PUBLISHED_LOGOS_CACHE_TAG } from "./public-work/cache";
export { mapPublishedLogo } from "./public-work/logo-presentation";

export type PublishedLogoAsset = {
  mimeType?: string;
  slug: string;
  storageKey?: string;
  storageProvider?: Logo["media"]["storageProvider"];
  url: string;
};

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

export async function getPublishedLogos(): Promise<Logo[]> {
  const database = getDatabase();
  if (!database) return [];

  try {
    const page = await readWorkPage({
      scope: { kind: "logo-archive" },
      order: "created-desc",
    });
    return page.items;
  } catch (cause) {
    throw new Error("Could not load logos.", { cause });
  }
}

export async function getPublishedLogoAsset(
  id: string,
): Promise<PublishedLogoAsset | undefined> {
  const database = getDatabase();
  if (!database) return undefined;

  const row = await database.query.logos.findFirst({
    columns: { slug: true },
    where: and(
      eq(logos.id, id),
      eq(logos.status, "published"),
      lte(logos.publishedAt, new Date()),
    ),
    with: {
      media: {
        columns: {
          mimeType: true,
          storageKey: true,
          storageProvider: true,
          url: true,
        },
        limit: 1,
      },
    },
  });
  const media = row?.media[0];
  if (!row || !media) return undefined;

  return {
    slug: row.slug,
    url: media.url,
    mimeType: media.mimeType ?? undefined,
    storageKey: media.storageKey ?? undefined,
    storageProvider: isStorageProvider(media.storageProvider)
      ? (media.storageProvider as NonNullable<
          PublishedLogoAsset["storageProvider"]
        >)
      : undefined,
  };
}
