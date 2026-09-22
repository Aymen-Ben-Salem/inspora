import "server-only";

import { and, asc, desc, eq, isNotNull, lte } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { requireDatabase } from "@/db/client";
import { websiteMedia, websites, websiteSections } from "@/db/schema";
import type { Website } from "@/domain/website";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";
import { PUBLIC_WORK_CACHE_LIFE, PUBLISHED_WEBSITES_CACHE_TAG } from "./cache";
import { evaluationTime } from "./clock";
import { completeWebsiteRecordingPredicate, hasCompleteRecording, mapPublishedWebsite } from "./website-presentation";

const requestSchema = z.strictObject({
  scope: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("website-archive") })]),
  filters: z.strictObject({ view: z.enum(["latest", "featured"]).optional() }).optional(),
  order: z.literal("publication-desc"),
  // This complete-array scope has no continuation. Other scopes can extend it.
  cursor: z.null().optional(),
});

export type WorkPageRequest = {
  scope: { kind: "website-archive" };
  filters?: { view?: "latest" | "featured" };
  order: "publication-desc";
  cursor?: string | null;
};
export type WorkPage = { items: Website[]; nextCursor: string | null };

export async function readWorkPage(request: WorkPageRequest): Promise<WorkPage> {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) throw new Error("Unsupported public-work page request.");
  return readWebsiteArchive(parsed.data.filters?.view ?? "latest");
}

async function readWebsiteArchive(view: "latest" | "featured"): Promise<WorkPage> {
  "use cache";
  cacheLife(PUBLIC_WORK_CACHE_LIFE);
  cacheTag(PUBLISHED_WEBSITES_CACHE_TAG, PUBLIC_CREATOR_PROFILES_CACHE_TAG);

  const database = requireDatabase();
  const now = evaluationTime();
  // Drizzle selects and hydrates using one SQL statement. Its lateral JSON
  // projections preserve one result per website (see README).
  const rows = await database.query.websites.findMany({
    where: and(
      eq(websites.status, "published"),
      isNotNull(websites.publishedAt),
      lte(websites.publishedAt, now),
      completeWebsiteRecordingPredicate(),
      view === "featured" ? eq(websites.isFeatured, true) : undefined,
    ),
    orderBy: [desc(websites.publishedAt), desc(websites.id)],
    with: {
      creator: true,
      media: { orderBy: [asc(websiteMedia.createdAt)] },
      sections: { orderBy: [asc(websiteSections.position)] },
    },
  });
  const items = rows.map((row) => {
    if (row.status !== "published" || !row.publishedAt || row.publishedAt > now || !hasCompleteRecording(row)) {
      throw new Error("Public website " + row.id + " has inconsistent or incomplete presentation.");
    }
    return mapPublishedWebsite(row);
  });
  return { items, nextCursor: null };
}
