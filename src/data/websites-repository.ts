import "server-only";

import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { websiteMedia, websites, websiteSections } from "@/db/schema";
import type { Website } from "@/domain/website";
import type { PostView } from "@/domain/post";
import { readWorkPage } from "./public-work";

// Compatibility for existing non-archive consumers; not part of the reads API.
export { mapPublishedWebsite, hasCompleteRecording, completeWebsiteRecordingPredicate } from "./public-work/website-presentation";
export { PUBLISHED_WEBSITES_CACHE_TAG } from "./public-work/cache";

type MediaRow = typeof websiteMedia.$inferSelect;
type SectionRow = typeof websiteSections.$inferSelect;

export async function getPublishedWebsites({ view = "latest" }: { view?: PostView } = {}): Promise<Website[]> {
  if (!getDatabase()) return [];
  const page = await readWorkPage({
    scope: { kind: "website-archive" },
    filters: { view },
    order: "publication-desc",
  });
  return page.items;
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
