import "server-only";

import { and, eq, inArray, lte, or, sql } from "drizzle-orm";

import { getDatabase, requireDatabase } from "@/db/client";
import { posts, savedPosts, logos, websites } from "@/db/schema";
import type { SavedCategory } from "@/domain/saved-post";
import type { WorkCardData } from "@/domain/work-card";
import { readWorkCounts, readWorkPage } from "./public-work";
import { decodeSavedCursor } from "./public-work/saved-cursor";
export { decodeSavedCursor as decodeSavedPostCursor, encodeSavedCursor as encodeSavedPostCursor } from "./public-work/saved-cursor";

export { SAVED_POST_PAGE_SIZE } from "./public-work/saved";
export const MAX_SAVED_STATUS_IDS = 100;

export type SavedPostPage = {
  items: SavedPostCardData[];
  nextCursor: string | null;
};

export type SavedPostCounts = Partial<Record<SavedCategory, number>>;
export type SavedPostCardData = WorkCardData;

const savedTargetId = sql<string>`coalesce(${savedPosts.postId}, ${savedPosts.logoId}, ${savedPosts.websiteId})`;

export class SavedPostUnavailableError extends Error {
  constructor() {
    super("This post is not available to save.");
    this.name = "SavedPostUnavailableError";
  }
}

export async function getSavedPostIdsForUser(
  userId: string,
  candidatePostIds: string[],
) {
  const postIds = Array.from(new Set(candidatePostIds)).slice(
    0,
    MAX_SAVED_STATUS_IDS,
  );
  if (postIds.length === 0) return [];

  const database = getDatabase();
  if (!database) return [];

  const rows = await database
    .select({ postId: savedTargetId })
    .from(savedPosts)
    .where(
      and(
        eq(savedPosts.userId, userId),
        or(inArray(savedPosts.postId, postIds), inArray(savedPosts.logoId, postIds), inArray(savedPosts.websiteId, postIds)),
      ),
    );
  return rows.map((row) => row.postId);
}

export async function savePostForUser(userId: string, postId: string) {
  const database = requireDatabase();
  const targets = [
    { table: posts, key: "postId" },
    { table: logos, key: "logoId" },
    { table: websites, key: "websiteId" },
  ] as const;
  for (const { table, key } of targets) {
    const [item] = await database.select({ id: table.id }).from(table)
      .where(and(eq(table.id, postId), eq(table.status, "published"), lte(table.publishedAt, new Date())))
      .limit(1);
    if (!item) continue;
    await database.insert(savedPosts).values({ userId, [key]: postId }).onConflictDoNothing();
    return;
  }
  throw new SavedPostUnavailableError();
}

export async function unsavePostForUser(userId: string, postId: string) {
  const database = requireDatabase();
  await database
    .delete(savedPosts)
    .where(
      and(eq(savedPosts.userId, userId), or(eq(savedPosts.postId, postId), eq(savedPosts.logoId, postId), eq(savedPosts.websiteId, postId))),
    );
}

export async function getSavedPostPage({
  userId,
  category,
  cursor,
}: {
  userId: string;
  category?: SavedCategory;
  cursor?: string | null;
}): Promise<SavedPostPage> {
  if (cursor && !decodeSavedCursor(cursor, { userId, category })) {
    throw new Error("Invalid saved-post cursor.");
  }
  if (!getDatabase()) return { items: [], nextCursor: null };
  return readWorkPage({
    scope: { kind: "saved", userId },
    filters: { category },
    order: "saved-desc",
    cursor,
  });
}

export async function getSavedPostCounts(userId: string) {
  if (!getDatabase()) return { total: 0, categories: {} as SavedPostCounts };
  return readWorkCounts({ scope: { kind: "saved", userId } });
}
