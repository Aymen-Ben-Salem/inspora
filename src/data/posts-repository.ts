import "server-only";

import { and, asc, desc, eq, gt, lt, lte, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDatabase } from "@/db/client";
import { creators, postMedia, posts } from "@/db/schema";
import {
  isPostCategory,
  type MediaType,
  type Post,
  type PostCategory,
  type PostView,
} from "@/domain/post";
import { MEDIA_STORAGE_PROVIDERS } from "../storage/types";

import {
  decodePostCursor,
  encodePostCursor,
  paginatePostArray,
  POST_PAGE_SIZE,
  type PostPage,
} from "./post-pagination";
import { seedPosts } from "./seed-posts";

export const PUBLISHED_POSTS_CACHE_TAG = "published-posts";

const PUBLISHED_POSTS_CACHE_LIFE = {
  stale: 300,
  revalidate: 3600,
  expire: 86400,
} as const;

type PostRow = typeof posts.$inferSelect;
type CreatorRow = typeof creators.$inferSelect;
type MediaRow = typeof postMedia.$inferSelect;
type PostRecord = PostRow & { creator: CreatorRow; media: MediaRow[] };
type AdjacentPost = Pick<Post, "slug" | "title">;
type PostPosition = Pick<Post, "id" | "createdAt" | "slug" | "title">;

function applyPublishedPostCache() {
  cacheLife(PUBLISHED_POSTS_CACHE_LIFE);
  cacheTag(PUBLISHED_POSTS_CACHE_TAG);
}

function mapPost(row: PostRecord): Post {
  if (!isPostCategory(row.category)) {
    throw new Error(`Unsupported post category: ${row.category}`);
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    creator: {
      id: row.creator.id,
      name: row.creator.name,
      handle: row.creator.handle ?? undefined,
      url: row.creator.url ?? undefined,
      avatarUrl: row.creator.avatarUrl,
    },
    description: row.description,
    category: row.category,
    industries: row.industries,
    colors: row.colors,
    styles: row.styles,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt.toISOString(),
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    isFeatured: row.isFeatured,
    media: row.media.map((media) => ({
      id: media.id,
      type: media.type as MediaType,
      url: media.url,
      posterUrl: media.posterUrl ?? undefined,
      storageProvider: MEDIA_STORAGE_PROVIDERS.some(
        (provider) => provider === media.storageProvider,
      )
        ? (media.storageProvider as NonNullable<Post["media"][number]["storageProvider"]>)
        : undefined,
      mimeType: media.mimeType ?? undefined,
      sizeBytes: media.sizeBytes ?? undefined,
      variants: media.variants,
      alt: media.alt,
      width: media.width,
      height: media.height,
      position: media.position,
    })),
  };
}

function publishedWhere(now: Date) {
  return and(eq(posts.status, "published"), lte(posts.publishedAt, now));
}

function fallbackNavigation(post: PostPosition) {
  const currentIndex = seedPosts.findIndex((candidate) => candidate.id === post.id);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;

  return {
    previousPost:
      seedPosts[(safeIndex - 1 + seedPosts.length) % seedPosts.length] ?? post,
    nextPost: seedPosts[(safeIndex + 1) % seedPosts.length] ?? post,
  } satisfies { previousPost: AdjacentPost; nextPost: AdjacentPost };
}

export async function getPostPage({
  category,
  view = "latest",
  cursor,
}: {
  category?: PostCategory;
  view?: PostView;
  cursor?: string | null;
} = {}): Promise<PostPage> {
  "use cache";

  applyPublishedPostCache();

  const decodedCursor = cursor ? decodePostCursor(cursor) : null;
  if (cursor && !decodedCursor) throw new Error("Invalid post cursor.");

  const database = getDatabase();
  if (!database) return paginatePostArray(seedPosts, { category, view, cursor });

  const now = new Date();
  const cursorDate = decodedCursor ? new Date(decodedCursor.createdAt) : null;
  const cursorCondition =
    decodedCursor && cursorDate
      ? or(
          lt(posts.createdAt, cursorDate),
          and(
            eq(posts.createdAt, cursorDate),
            lt(posts.id, decodedCursor.id),
          ),
        )
      : undefined;

  try {
    const rows = await database.query.posts.findMany({
      where: and(
        publishedWhere(now),
        category ? eq(posts.category, category) : undefined,
        view === "featured" ? eq(posts.isFeatured, true) : undefined,
        cursorCondition,
      ),
      orderBy: [desc(posts.createdAt), desc(posts.id)],
      limit: POST_PAGE_SIZE + 1,
      with: {
        creator: true,
        media: { orderBy: [asc(postMedia.position)] },
      },
    });
    const items = rows.slice(0, POST_PAGE_SIZE).map(mapPost);
    const finalPost = items.at(-1);

    return {
      items,
      nextCursor:
        rows.length > POST_PAGE_SIZE && finalPost
          ? encodePostCursor({
              createdAt: finalPost.createdAt,
              id: finalPost.id,
            })
          : null,
    };
  } catch (cause) {
    throw new Error("Could not load posts.", { cause });
  }
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  "use cache";

  applyPublishedPostCache();

  const database = getDatabase();
  if (!database) return seedPosts.find((post) => post.slug === slug) ?? null;

  try {
    const row = await database.query.posts.findFirst({
      where: and(
        publishedWhere(new Date()),
        eq(posts.slug, slug),
      ),
      with: {
        creator: true,
        media: { orderBy: [asc(postMedia.position)] },
      },
    });

    return row ? mapPost(row) : null;
  } catch (cause) {
    throw new Error("Could not load post.", { cause });
  }
}

export async function getPublishedSlugs(): Promise<string[]> {
  "use cache";

  applyPublishedPostCache();

  const database = getDatabase();
  if (!database) return seedPosts.map((post) => post.slug);

  try {
    const rows = await database.query.posts.findMany({
      columns: { slug: true },
      where: publishedWhere(new Date()),
      orderBy: [desc(posts.createdAt), desc(posts.id)],
    });
    return rows.map((post) => post.slug);
  } catch (cause) {
    throw new Error("Could not load published post slugs.", { cause });
  }
}

export async function getAdjacentPosts(post: PostPosition): Promise<{
  previousPost: AdjacentPost;
  nextPost: AdjacentPost;
}> {
  "use cache";

  applyPublishedPostCache();

  const database = getDatabase();
  if (!database) return fallbackNavigation(post);

  const createdAt = new Date(post.createdAt);
  const now = new Date();
  const columns = { slug: true, title: true } as const;

  try {
    const [previousPost, nextPost] = await Promise.all([
      database.query.posts.findFirst({
        columns,
        where: and(
          publishedWhere(now),
          or(
            gt(posts.createdAt, createdAt),
            and(eq(posts.createdAt, createdAt), gt(posts.id, post.id)),
          ),
        ),
        orderBy: [asc(posts.createdAt), asc(posts.id)],
      }),
      database.query.posts.findFirst({
        columns,
        where: and(
          publishedWhere(now),
          or(
            lt(posts.createdAt, createdAt),
            and(eq(posts.createdAt, createdAt), lt(posts.id, post.id)),
          ),
        ),
        orderBy: [desc(posts.createdAt), desc(posts.id)],
      }),
    ]);

    const [wrappedPrevious, wrappedNext] = await Promise.all([
      previousPost
        ? Promise.resolve(previousPost)
        : database.query.posts.findFirst({
            columns,
            where: publishedWhere(now),
            orderBy: [asc(posts.createdAt), asc(posts.id)],
          }),
      nextPost
        ? Promise.resolve(nextPost)
        : database.query.posts.findFirst({
            columns,
            where: publishedWhere(now),
            orderBy: [desc(posts.createdAt), desc(posts.id)],
          }),
    ]);

    return {
      previousPost: wrappedPrevious ?? post,
      nextPost: wrappedNext ?? post,
    };
  } catch (cause) {
    throw new Error("Could not load post navigation.", { cause });
  }
}
