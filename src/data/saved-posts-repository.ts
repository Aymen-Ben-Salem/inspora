import "server-only";

import { and, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";

import { getDatabase, requireDatabase } from "@/db/client";
import { posts, savedPosts, logos, websites } from "@/db/schema";
import type { SavedCategory } from "@/domain/saved-post";
import type { WorkCardData } from "@/domain/work-card";
import { mapPublishedLogo } from "./logos-repository";
import { mapPublishedWebsite } from "./websites-repository";

import { getPostCardsByIds } from "./posts-repository";

export const SAVED_POST_PAGE_SIZE = 16;
export const MAX_SAVED_STATUS_IDS = 100;

type SavedPostCursor = {
  savedAt: string;
  id: string;
};

export type SavedPostPage = {
  items: SavedPostCardData[];
  nextCursor: string | null;
};

export type SavedPostCounts = Partial<Record<SavedCategory, number>>;
export type SavedPostCardData = WorkCardData;

const savedTargetId = sql<string>`coalesce(${savedPosts.postId}, ${savedPosts.logoId}, ${savedPosts.websiteId})`;
const savedCategory = sql<SavedCategory>`case when ${savedPosts.logoId} is not null then 'Logos' when ${savedPosts.websiteId} is not null then 'Websites' else ${posts.category} end`;

export class SavedPostUnavailableError extends Error {
  constructor() {
    super("This post is not available to save.");
    this.name = "SavedPostUnavailableError";
  }
}

function publishedWhere(now: Date) {
  return or(...[posts, logos, websites].map((table) =>
    and(eq(table.status, "published"), lte(table.publishedAt, now)),
  ));
}

export function encodeSavedPostCursor(cursor: SavedPostCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSavedPostCursor(value: string): SavedPostCursor | null {
  try {
    const candidate: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.savedAt !== "string" ||
      Number.isNaN(Date.parse(record.savedAt)) ||
      typeof record.id !== "string" ||
      record.id.length === 0 ||
      record.id.length > 128
    ) {
      return null;
    }
    return { savedAt: record.savedAt, id: record.id };
  } catch {
    return null;
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
  const decodedCursor = cursor ? decodeSavedPostCursor(cursor) : null;
  if (cursor && !decodedCursor) throw new Error("Invalid saved-post cursor.");

  const database = getDatabase();
  if (!database) return { items: [], nextCursor: null };

  const cursorDate = decodedCursor ? new Date(decodedCursor.savedAt) : null;
  const cursorWhere =
    decodedCursor && cursorDate
      ? or(
          lt(savedPosts.createdAt, cursorDate),
          and(
            eq(savedPosts.createdAt, cursorDate),
            lt(savedPosts.id, decodedCursor.id),
          ),
        )
      : undefined;

  const rows = await database
    .select({
      id: savedPosts.id,
      postId: savedTargetId,
      logoId: savedPosts.logoId,
      websiteId: savedPosts.websiteId,
      savedAt: savedPosts.createdAt,
      category: savedCategory,
    })
    .from(savedPosts)
    .leftJoin(posts, eq(savedPosts.postId, posts.id))
    .leftJoin(logos, eq(savedPosts.logoId, logos.id))
    .leftJoin(websites, eq(savedPosts.websiteId, websites.id))
    .where(
      and(
        eq(savedPosts.userId, userId),
        publishedWhere(new Date()),
        category ? eq(savedCategory, category) : undefined,
        cursorWhere,
      ),
    )
    .orderBy(desc(savedPosts.createdAt), desc(savedPosts.id))
    .limit(SAVED_POST_PAGE_SIZE + 1);

  const pageRows = rows.slice(0, SAVED_POST_PAGE_SIZE);
  const logoIds = pageRows.flatMap((row) => row.logoId ? [row.logoId] : []);
  const websiteIds = pageRows.flatMap((row) => row.websiteId ? [row.websiteId] : []);
  const [cards, logoRows, websiteRows] = await Promise.all([
    getPostCardsByIds(pageRows.filter((row) => !row.logoId && !row.websiteId).map((row) => row.postId)),
    logoIds.length ? database.query.logos.findMany({ where: inArray(logos.id, logoIds), with: { creator: true, media: true } }) : [],
    websiteIds.length ? database.query.websites.findMany({ where: inArray(websites.id, websiteIds), with: { creator: true, media: true, sections: { orderBy: (sections, { asc }) => [asc(sections.position)] } } }) : [],
  ]);
  const logosById = new Map(logoRows.map((row) => [row.id, mapPublishedLogo(row)]));
  const websitesById = new Map(websiteRows.map((row) => [row.id, mapPublishedWebsite(row)]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const items = pageRows
    .map((row): SavedPostCardData | undefined => {
      if (row.logoId) {
        const logo = logosById.get(row.logoId);
        return logo ? { id: logo.id, kind: "logo", category: "Logos", logo } : undefined;
      }
      if (row.websiteId) {
        const website = websitesById.get(row.websiteId);
        return website ? { id: website.id, kind: "website", category: "Websites", website } : undefined;
      }
      const card = cardsById.get(row.postId);
      return card
        ? { ...card, category: row.category }
        : undefined;
    })
    .filter((card): card is SavedPostCardData => Boolean(card));
  const finalRow = pageRows.at(-1);

  return {
    items,
    nextCursor:
      rows.length > SAVED_POST_PAGE_SIZE && finalRow
        ? encodeSavedPostCursor({
            savedAt: finalRow.savedAt.toISOString(),
            id: finalRow.id,
          })
        : null,
  };
}

export async function getSavedPostCounts(userId: string) {
  const database = getDatabase();
  if (!database) return { total: 0, categories: {} as SavedPostCounts };

  const rows = await database
    .select({
      category: savedCategory,
      count: sql<number>`count(*)::int`,
    })
    .from(savedPosts)
    .leftJoin(posts, eq(savedPosts.postId, posts.id))
    .leftJoin(logos, eq(savedPosts.logoId, logos.id))
    .leftJoin(websites, eq(savedPosts.websiteId, websites.id))
    .where(and(eq(savedPosts.userId, userId), publishedWhere(new Date())))
    .groupBy(savedCategory);

  const categories: SavedPostCounts = {};
  let total = 0;
  for (const row of rows) {
    const count = Number(row.count);
    total += count;
    categories[row.category] = count;
  }
  return { total, categories };
}
