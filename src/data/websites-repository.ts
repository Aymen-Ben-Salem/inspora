import "server-only";

import { and, asc, desc, eq, lte } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDatabase } from "@/db/client";
import { creators, websiteMedia, websites, websiteSections } from "@/db/schema";
import {
  isWebsiteMediaRole,
  type Website,
  type WebsiteMedia,
} from "@/domain/website";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";

export const PUBLISHED_WEBSITES_CACHE_TAG = "published-websites";

const PUBLISHED_WEBSITES_CACHE_LIFE = {
  stale: 300,
  revalidate: 21600,
  expire: 604800,
} as const;

type WebsiteRow = typeof websites.$inferSelect;
type CreatorRow = typeof creators.$inferSelect;
type MediaRow = typeof websiteMedia.$inferSelect;
type SectionRow = typeof websiteSections.$inferSelect;
type PublicWebsiteRecord = WebsiteRow & {
  creator: CreatorRow;
  media: MediaRow[];
  sections: SectionRow[];
};

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function mapMedia(media: MediaRow): WebsiteMedia {
  if (!isWebsiteMediaRole(media.role)) throw new Error(`Unsupported website media role: ${media.role}`);
  return {
    id: media.id,
    role: media.role,
    url: media.url,
    storageProvider: isStorageProvider(media.storageProvider)
      ? (media.storageProvider as WebsiteMedia["storageProvider"])
      : undefined,
    mimeType: media.mimeType ?? undefined,
    sourceMimeType: media.sourceMimeType ?? undefined,
    sizeBytes: media.sizeBytes ?? undefined,
    alt: media.alt,
    width: media.width,
    height: media.height,
  };
}

export function mapPublishedWebsite(row: PublicWebsiteRecord): Website {
  const media = row.media.map(mapMedia);
  const fullPage = media.find((item) => item.role === "full_page");
  const favicon = media.find((item) => item.role === "favicon");
  if (!fullPage || !favicon) throw new Error(`Published website ${row.id} has incomplete media.`);
  if (!row.publishedAt) throw new Error(`Published website ${row.id} has no publish date.`);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline,
    creator: {
      id: row.creator.id,
      name: row.creator.name,
      handle: row.creator.handle ?? undefined,
      url: row.creator.url ?? undefined,
      avatarUrl: row.creator.avatarUrl,
      avatarStorageProvider: isStorageProvider(row.creator.avatarStorageProvider)
        ? (row.creator.avatarStorageProvider as Website["creator"]["avatarStorageProvider"])
        : undefined,
    },
    description: row.description,
    categories: row.categories,
    themes: row.themes,
    colors: row.colors,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt.toISOString(),
    fullPage,
    favicon,
    sections: row.sections.map((section) => ({
      id: section.id,
      label: section.label,
      top: section.top,
      height: section.height,
      position: section.position,
    })),
  };
}

export async function getPublishedWebsites(): Promise<Website[]> {
  "use cache";
  cacheLife(PUBLISHED_WEBSITES_CACHE_LIFE);
  cacheTag(PUBLISHED_WEBSITES_CACHE_TAG);

  const database = getDatabase();
  if (!database) return [];
  const rows = await database.query.websites.findMany({
    where: and(eq(websites.status, "published"), lte(websites.publishedAt, new Date())),
    orderBy: [desc(websites.publishedAt), desc(websites.id)],
    with: {
      creator: true,
      media: { orderBy: [asc(websiteMedia.createdAt)] },
      sections: { orderBy: [asc(websiteSections.position)] },
    },
  });
  return rows.map(mapPublishedWebsite);
}

export async function getPublishedWebsiteAsset(id: string) {
  const database = getDatabase();
  if (!database) return null;
  const row = await database.query.websites.findFirst({
    where: and(eq(websites.id, id), eq(websites.status, "published")),
    columns: { slug: true },
    with: {
      media: {
        where: eq(websiteMedia.role, "full_page"),
        columns: {
          url: true,
          storageProvider: true,
          storageKey: true,
          mimeType: true,
        },
      },
    },
  });
  const media = row?.media[0];
  if (!row || !media) return null;
  return {
    slug: row.slug,
    url: media.url,
    storageProvider: media.storageProvider,
    storageKey: media.storageKey,
    mimeType: media.mimeType,
  };
}
