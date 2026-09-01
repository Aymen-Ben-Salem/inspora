import "server-only";

import { and, asc, desc, eq, lte } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDatabase } from "@/db/client";
import { creators, logoMedia, logos } from "@/db/schema";
import { isLogoKind, type Logo } from "@/domain/logo";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";

export const PUBLISHED_LOGOS_CACHE_TAG = "published-logos";

const PUBLISHED_LOGOS_CACHE_LIFE = {
  stale: 300,
  revalidate: 21600,
  expire: 604800,
} as const;

type LogoRow = typeof logos.$inferSelect;
type CreatorRow = typeof creators.$inferSelect;
type MediaRow = typeof logoMedia.$inferSelect;
type PublicLogoRecord = LogoRow & { creator: CreatorRow; media: MediaRow[] };

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

export function mapPublishedLogo(row: PublicLogoRecord): Logo {
  if (!isLogoKind(row.kind)) throw new Error(`Unsupported logo kind: ${row.kind}`);
  const media = row.media[0];
  if (!media) throw new Error(`Published logo ${row.id} has no media.`);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    creator: {
      id: row.creator.id,
      name: row.creator.name,
      handle: row.creator.handle ?? undefined,
      url: row.creator.url ?? undefined,
      avatarUrl: row.creator.avatarUrl,
      avatarStorageProvider: isStorageProvider(row.creator.avatarStorageProvider)
        ? (row.creator.avatarStorageProvider as NonNullable<
            Logo["creator"]["avatarStorageProvider"]
          >)
        : undefined,
    },
    description: row.description,
    industry: row.industry,
    colors: row.colors,
    styles: row.styles,
    shape: row.shape,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt.toISOString(),
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    media: {
      id: media.id,
      url: media.url,
      storageProvider: isStorageProvider(media.storageProvider)
        ? (media.storageProvider as NonNullable<Logo["media"]["storageProvider"]>)
        : undefined,
      mimeType: media.mimeType ?? undefined,
      sourceMimeType: media.sourceMimeType ?? undefined,
      sizeBytes: media.sizeBytes ?? undefined,
      variants: media.variants,
      alt: media.alt,
      width: media.width,
      height: media.height,
    },
  };
}

export async function getPublishedLogos(): Promise<Logo[]> {
  "use cache";

  cacheLife(PUBLISHED_LOGOS_CACHE_LIFE);
  cacheTag(PUBLISHED_LOGOS_CACHE_TAG);

  const database = getDatabase();
  if (!database) return [];

  try {
    const rows = await database.query.logos.findMany({
      where: and(eq(logos.status, "published"), lte(logos.publishedAt, new Date())),
      orderBy: [desc(logos.createdAt), desc(logos.id)],
      with: {
        creator: true,
        media: { orderBy: [asc(logoMedia.createdAt)], limit: 1 },
      },
    });
    return rows.map(mapPublishedLogo);
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
