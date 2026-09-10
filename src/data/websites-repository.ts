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
import type { PostView } from "@/domain/post";
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
  if (!isWebsiteMediaRole(media.role)) {
    throw new Error(`Unsupported website media role: ${media.role}`);
  }
  return {
    id: media.id,
    role: media.role,
    url: media.url,
    posterUrl: media.posterUrl ?? undefined,
    storageProvider: isStorageProvider(media.storageProvider)
      ? (media.storageProvider as WebsiteMedia["storageProvider"])
      : undefined,
    mimeType: media.mimeType ?? undefined,
    sourceMimeType: media.sourceMimeType ?? undefined,
    sizeBytes: media.sizeBytes ?? undefined,
    variants: media.variants,
    videoPreview: media.videoPreview ?? undefined,
    alt: media.alt,
    width: media.width,
    height: media.height,
  };
}

export function mapPublishedWebsite(row: PublicWebsiteRecord): Website {
  const media = row.media.map(mapMedia);
  const recording = media.find((item) => item.role === "recording");
  const favicon = media.find((item) => item.role === "favicon");
  if (!recording?.posterUrl || !recording.videoPreview || !favicon) {
    throw new Error(`Published website ${row.id} has incomplete recording media.`);
  }
  if (!row.publishedAt) throw new Error(`Published website ${row.id} has no publish date.`);

  const sections = row.sections.map((section) => {
    if (!section.imageUrl || !section.imageWidth || !section.imageHeight) {
      throw new Error(`Published website ${row.id} has incomplete section media.`);
    }
    return {
      id: section.id,
      label: section.label,
      alt: section.imageAlt,
      url: section.imageUrl,
      storageProvider: isStorageProvider(section.imageStorageProvider)
        ? (section.imageStorageProvider as Website["sections"][number]["storageProvider"])
        : undefined,
      mimeType: section.imageMimeType ?? undefined,
      sourceMimeType: section.imageSourceMimeType ?? undefined,
      sizeBytes: section.imageSizeBytes ?? undefined,
      variants: section.imageVariants,
      width: section.imageWidth,
      height: section.imageHeight,
      position: section.position,
    };
  });

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
    isFeatured: row.isFeatured,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt.toISOString(),
    recording: { ...recording, posterUrl: recording.posterUrl, videoPreview: recording.videoPreview },
    favicon,
    sections,
  };
}

function hasCompleteRecording(row: PublicWebsiteRecord) {
  const recording = row.media.find((media) => media.role === "recording");
  return Boolean(
    recording?.posterUrl &&
      recording.videoPreview &&
      row.media.some((media) => media.role === "favicon") &&
      row.sections.length > 0 &&
      row.sections.every(
        (section) => section.imageUrl && section.imageWidth && section.imageHeight,
      ),
  );
}

export async function getPublishedWebsites({
  view = "latest",
}: {
  view?: PostView;
} = {}): Promise<Website[]> {
  "use cache";
  cacheLife(PUBLISHED_WEBSITES_CACHE_LIFE);
  cacheTag(PUBLISHED_WEBSITES_CACHE_TAG);

  const database = getDatabase();
  if (!database) return [];
  const rows = await database.query.websites.findMany({
    where: and(
      eq(websites.status, "published"),
      lte(websites.publishedAt, new Date()),
      view === "featured" ? eq(websites.isFeatured, true) : undefined,
    ),
    orderBy: [desc(websites.publishedAt), desc(websites.id)],
    with: {
      creator: true,
      media: { orderBy: [asc(websiteMedia.createdAt)] },
      sections: { orderBy: [asc(websiteSections.position)] },
    },
  });
  return rows.filter(hasCompleteRecording).map(mapPublishedWebsite);
}

export async function getPublishedWebsiteAsset(
  id: string,
  sectionId?: string,
) {
  const database = getDatabase();
  if (!database) return null;
  const row = await database.query.websites.findFirst({
    where: and(eq(websites.id, id), eq(websites.status, "published")),
    columns: { slug: true },
    with: sectionId
      ? {
          sections: {
            where: eq(websiteSections.id, sectionId),
            columns: {
              id: true,
              label: true,
              imageUrl: true,
              imageStorageProvider: true,
              imageStorageKey: true,
              imageMimeType: true,
            },
          },
        }
      : {
          media: {
            where: eq(websiteMedia.role, "recording"),
            columns: {
              url: true,
              storageProvider: true,
              storageKey: true,
              mimeType: true,
              sourceMimeType: true,
            },
          },
        },
  });
  if (!row) return null;

  if (sectionId && "sections" in row) {
    const section = (row.sections as SectionRow[])[0];
    if (!section?.imageUrl) return null;
    return {
      kind: "section" as const,
      slug: row.slug,
      label: section.label,
      url: section.imageUrl,
      storageProvider: section.imageStorageProvider,
      storageKey: section.imageStorageKey,
      mimeType: section.imageMimeType,
    };
  }

  if ("media" in row) {
    const recording = (row.media as MediaRow[])[0];
    if (!recording) return null;
    return {
      kind: "recording" as const,
      slug: row.slug,
      url: recording.url,
      storageProvider: recording.storageProvider,
      storageKey: recording.storageKey,
      mimeType: recording.mimeType ?? recording.sourceMimeType,
    };
  }

  return null;
}