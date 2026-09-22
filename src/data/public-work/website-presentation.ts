import "server-only";
import { sql } from "drizzle-orm";
import { creators, websiteMedia, websites, websiteSections } from "@/db/schema";
import { isWebsiteMediaRole, type Website, type WebsiteMedia } from "@/domain/website";
import { isMediaStorageProvider } from "@/storage/types";

type WebsiteRow = typeof websites.$inferSelect;
type CreatorRow = typeof creators.$inferSelect;
type MediaRow = typeof websiteMedia.$inferSelect;
type SectionRow = typeof websiteSections.$inferSelect;
type PublicWebsiteRecord = WebsiteRow & {
  creator: CreatorRow;
  media: MediaRow[];
  sections: SectionRow[];
};

function mapMedia(media: MediaRow): WebsiteMedia {
  if (!isWebsiteMediaRole(media.role)) {
    throw new Error(`Unsupported website media role: ${media.role}`);
  }
  return {
    id: media.id,
    role: media.role,
    url: media.url,
    posterUrl: media.posterUrl ?? undefined,
    storageProvider: isMediaStorageProvider(media.storageProvider)
      ? media.storageProvider
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
  // Legacy screenshots remain stored, but the public UI uses recording media.
  const media = row.media.filter((item) => item.role !== "full_page").map(mapMedia);
  const recording = media.find((item) => item.role === "recording");
  const favicon = media.find((item) => item.role === "favicon");
  if (!recording?.posterUrl || recording.videoPreview == null || !favicon) {
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
      storageProvider: isMediaStorageProvider(section.imageStorageProvider)
        ? section.imageStorageProvider
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
      username: row.creator.username ?? undefined,
      handle: row.creator.handle ?? undefined,
      url: row.creator.url ?? undefined,
      avatarUrl: row.creator.avatarUrl,
      avatarStorageProvider: isMediaStorageProvider(row.creator.avatarStorageProvider)
        ? row.creator.avatarStorageProvider
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

export function hasCompleteRecording(row: PublicWebsiteRecord) {
  const recording = row.media.find((media) => media.role === "recording");
  return Boolean(
    recording?.posterUrl &&
      recording.videoPreview != null &&
      row.media.some((media) => media.role === "favicon") &&
      row.sections.length > 0 &&
      row.sections.every(
        (section) => section.imageUrl && section.imageWidth && section.imageHeight,
      ),
  );
}

// SQL equivalent of hasCompleteRecording, applied before mixed-feed limits and
// counts so legacy screenshot-only entries cannot create empty pages or totals.
export function completeWebsiteRecordingPredicate() {
  return sql`exists (
    select 1 from website_media recording
    where recording.website_id = ${websites.id} and recording.role = 'recording'
      and coalesce(recording.poster_url, '') <> ''
      and recording.video_preview is not null
      and recording.video_preview <> 'null'::jsonb
  ) and exists (
    select 1 from website_media favicon
    where favicon.website_id = ${websites.id} and favicon.role = 'favicon'
  ) and exists (
    select 1 from website_sections section
    where section.website_id = ${websites.id}
  ) and not exists (
    select 1 from website_sections section
    where section.website_id = ${websites.id}
      and (coalesce(section.image_url, '') = ''
        or coalesce(section.image_width, 0) = 0
        or coalesce(section.image_height, 0) = 0)
  )`;
}
