import "server-only";

import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { websiteMedia, websites } from "@/db/schema";
import type { Website } from "@/domain/website";
import type { PostView } from "@/domain/post";
import { readWorkPage } from "./public-work";
import { publicCreatorPredicate } from "./public-work/creator-visibility";

// Compatibility for existing non-archive consumers; not part of the reads API.
export { mapPublishedWebsite, hasCompleteRecording, completeWebsiteRecordingPredicate } from "./public-work/website-presentation";
export { PUBLISHED_WEBSITES_CACHE_TAG } from "./public-work/cache";


export async function getPublishedWebsites({ view = "latest" }: { view?: PostView } = {}): Promise<Website[]> {
  if (!getDatabase()) return [];
  const page = await readWorkPage({
    scope: { kind: "website-archive" },
    filters: { view },
    order: "publication-desc",
  });
  return page.items;
}

export async function getPublishedWebsiteAsset(id: string) {
  const database = getDatabase();
  if (!database) return null;
  const row = await database.query.websites.findFirst({
    where: and(eq(websites.id, id), eq(websites.status, "published"), publicCreatorPredicate(websites.creatorId)),
    columns: { slug: true },
    with: {
      media: {
        where: eq(websiteMedia.role, "recording"),
        columns: { url: true, mimeType: true, sourceMimeType: true },
      },
    },
  });
  const recording = row?.media[0];
  if (!row || !recording) return null;
  return {
    slug: row.slug,
    url: recording.url,
    mimeType: recording.mimeType ?? recording.sourceMimeType,
  };
}
