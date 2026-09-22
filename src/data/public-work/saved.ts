import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDatabase } from "@/db/client";
import { logos, posts, savedPosts, websites } from "@/db/schema";
import { SAVED_CATEGORIES, type SavedCategory } from "@/domain/saved-post";
import type { WorkCardData } from "@/domain/work-card";
import { evaluationTime } from "./clock";
import { mapPostCard } from "./design-presentation";
import { mapPublishedLogo } from "./logo-presentation";
import { decodeSavedCursor, encodeSavedCursor } from "./saved-cursor";
import { completeWebsiteRecordingPredicate, hasCompleteRecording, mapPublishedWebsite } from "./website-presentation";

export const SAVED_POST_PAGE_SIZE = 16;

export const savedCountRequestSchema = z.strictObject({
  scope: z.strictObject({ kind: z.literal("saved"), userId: z.string().min(1) }),
  filters: z.strictObject({ category: z.enum(SAVED_CATEGORIES).optional() }).optional(),
});
export const savedPageRequestSchema = savedCountRequestSchema.extend({
  order: z.literal("saved-desc"),
  cursor: z.string().min(1).nullable().optional(),
});
export type SavedWorkPageRequest = z.infer<typeof savedPageRequestSchema>;
export type SavedWorkCountRequest = z.infer<typeof savedCountRequestSchema>;
export type SavedWorkCounts = { total: number; categories: Partial<Record<SavedCategory, number>> };

const savedCategory = sql<SavedCategory>`case when ${savedPosts.logoId} is not null then 'Logos' when ${savedPosts.websiteId} is not null then 'Websites' else ${posts.category} end`;

function eligibleSavedWhere(request: SavedWorkCountRequest, now: Date) {
  const published = (table: typeof posts | typeof logos | typeof websites) =>
    and(eq(table.status, "published"), isNotNull(table.publishedAt), lte(table.publishedAt, now));
  return and(
    eq(savedPosts.userId, request.scope.userId),
    or(published(posts), published(logos), and(published(websites), completeWebsiteRecordingPredicate())),
    request.filters?.category ? eq(savedCategory, request.filters.category) : undefined,
  );
}

export async function readSavedPage(request: SavedWorkPageRequest) {
  const binding = { userId: request.scope.userId, category: request.filters?.category };
  const cursor = request.cursor ? decodeSavedCursor(request.cursor, binding) : null;
  if (request.cursor && !cursor) throw new Error("Invalid saved-work cursor.");
  const database = requireDatabase();
  const now = evaluationTime();
  // Membership and eligibility share the statement that projects every card
  // relation, so candidates cannot disappear between selection and hydration.
  const eligible = database.select({ id: savedPosts.id }).from(savedPosts)
    .leftJoin(posts, eq(savedPosts.postId, posts.id))
    .leftJoin(logos, eq(savedPosts.logoId, logos.id))
    .leftJoin(websites, eq(savedPosts.websiteId, websites.id))
    .where(eligibleSavedWhere(request, now));
  const rows = await database.query.savedPosts.findMany({
    extras: {
      // Date truncates PostgreSQL microseconds; keep the exact traversal key.
      cursorSavedAt: sql<string>`to_char(${savedPosts.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as("cursor_saved_at"),
    },
    where: and(
      inArray(savedPosts.id, eligible),
      cursor ? or(
        lt(savedPosts.createdAt, sql`${cursor.savedAt}::timestamptz`),
        and(eq(savedPosts.createdAt, sql`${cursor.savedAt}::timestamptz`), lt(savedPosts.id, cursor.id)),
      ) : undefined,
    ),
    orderBy: [desc(savedPosts.createdAt), desc(savedPosts.id)],
    limit: SAVED_POST_PAGE_SIZE + 1,
    with: {
      post: { with: { creator: true, media: { orderBy: (media) => [asc(media.position)] } } },
      logo: { with: { creator: true, media: { orderBy: (media) => [asc(media.createdAt)] } } },
      website: { with: {
        creator: true,
        media: { orderBy: (media) => [asc(media.createdAt)] },
        sections: { orderBy: (section) => [asc(section.position)] },
      } },
    },
  });
  const items = rows.slice(0, SAVED_POST_PAGE_SIZE).map((row): WorkCardData => {
    const work = row.websiteId ? row.website : row.logoId ? row.logo : row.post;
    if (!work || work.status !== "published" || !work.publishedAt || work.publishedAt > now) {
      throw new Error(`Saved work ${row.id} has inconsistent presentation or publication.`);
    }
    if (row.websiteId && row.website) {
      if (!hasCompleteRecording(row.website)) throw new Error(`Saved website ${row.websiteId} has incomplete presentation.`);
      const website = mapPublishedWebsite(row.website);
      return { id: website.id, kind: "website", category: "Websites", website };
    }
    if (row.logoId && row.logo) {
      const logo = mapPublishedLogo(row.logo);
      return { id: logo.id, kind: "logo", category: "Logos", logo };
    }
    if (!row.post) throw new Error(`Saved design ${row.postId} has missing presentation.`);
    return {
      ...mapPostCard({ ...row.post, mediaCount: row.post.media.length, media: row.post.media.slice(0, 1) }),
      category: row.post.category as SavedCategory,
    };
  });
  const last = rows.slice(0, SAVED_POST_PAGE_SIZE).at(-1);
  return {
    items,
    nextCursor: rows.length > SAVED_POST_PAGE_SIZE && last
      ? encodeSavedCursor({ savedAt: last.cursorSavedAt, id: last.id }, binding)
      : null,
  };
}

export async function readSavedCounts(request: SavedWorkCountRequest): Promise<SavedWorkCounts> {
  const database = requireDatabase();
  const now = evaluationTime();
  const rows = await database.select({ category: savedCategory, count: sql<number>`count(*)::int` })
    .from(savedPosts)
    .leftJoin(posts, eq(savedPosts.postId, posts.id))
    .leftJoin(logos, eq(savedPosts.logoId, logos.id))
    .leftJoin(websites, eq(savedPosts.websiteId, websites.id))
    .where(eligibleSavedWhere(request, now))
    .groupBy(savedCategory);
  const categories: SavedWorkCounts["categories"] = {};
  let total = 0;
  for (const row of rows) {
    categories[row.category] = Number(row.count);
    total += Number(row.count);
  }
  return { total, categories };
}
