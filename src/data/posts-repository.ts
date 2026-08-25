import "server-only";

import { and, asc, desc, eq, gt, lt, lte, ne, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDatabase } from "@/db/client";
import { creators, postMedia, posts } from "@/db/schema";
import {
  isPostCategory,
  type MediaType,
  type Post,
  type PostCardData,
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
const ADJACENT_POSTS_CACHE_VERSION = 2;
const PUBLISHED_SLUG_QUERY_ATTEMPTS = 4;
const PUBLISHED_SLUG_RETRY_DELAY_MS = 250;

const PUBLISHED_POSTS_CACHE_LIFE = {
  stale: 300,
  revalidate: 21600,
  expire: 604800,
} as const;

type PostRow = typeof posts.$inferSelect;
type CreatorRow = typeof creators.$inferSelect;
type MediaRow = typeof postMedia.$inferSelect;
type PublicCreatorRow = Pick<
  CreatorRow,
  "id" | "name" | "handle" | "url" | "avatarUrl" | "avatarStorageProvider"
>;
type PublicMediaRow = Pick<
  MediaRow,
  | "id"
  | "type"
  | "url"
  | "posterUrl"
  | "storageProvider"
  | "mimeType"
  | "sourceMimeType"
  | "sizeBytes"
  | "variants"
  | "videoPreview"
  | "alt"
  | "width"
  | "height"
  | "position"
>;
type PostCardCreatorRow = Pick<
  CreatorRow,
  "name" | "avatarUrl" | "avatarStorageProvider"
>;
type PostCardMediaRow = Pick<
  MediaRow,
  | "id"
  | "type"
  | "url"
  | "posterUrl"
  | "storageProvider"
  | "variants"
  | "videoPreview"
  | "alt"
  | "width"
  | "height"
>;
type PostRecord = Pick<
  PostRow,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "category"
  | "industries"
  | "colors"
  | "styles"
  | "sourceUrl"
  | "createdAt"
  | "publishedAt"
  | "isFeatured"
> & { creator: PublicCreatorRow; media: PublicMediaRow[] };
type PostCardRecord = Pick<PostRow, "id" | "slug" | "title" | "createdAt"> & {
  creator: PostCardCreatorRow;
  media: PostCardMediaRow[];
  mediaCount: number;
};
type AdjacentPost = Pick<Post, "slug" | "title">;
type PostPosition = Pick<Post, "id" | "createdAt" | "slug" | "title">;

const PUBLIC_CREATOR_COLUMNS = {
  id: true,
  name: true,
  handle: true,
  url: true,
  avatarUrl: true,
  avatarStorageProvider: true,
} as const;

const PUBLIC_MEDIA_COLUMNS = {
  id: true,
  type: true,
  url: true,
  posterUrl: true,
  storageProvider: true,
  mimeType: true,
  sourceMimeType: true,
  sizeBytes: true,
  variants: true,
  videoPreview: true,
  alt: true,
  width: true,
  height: true,
  position: true,
} as const;

const POST_CARD_CREATOR_COLUMNS = {
  name: true,
  avatarUrl: true,
  avatarStorageProvider: true,
} as const;

const POST_CARD_MEDIA_COLUMNS = {
  id: true,
  type: true,
  url: true,
  posterUrl: true,
  storageProvider: true,
  variants: true,
  videoPreview: true,
  alt: true,
  width: true,
  height: true,
} as const;

const PUBLIC_POST_COLUMNS = {
  id: true,
  slug: true,
  title: true,
  description: true,
  category: true,
  industries: true,
  colors: true,
  styles: true,
  sourceUrl: true,
  createdAt: true,
  publishedAt: true,
  isFeatured: true,
} as const;

function applyPublishedPostCache() {
  cacheLife(PUBLISHED_POSTS_CACHE_LIFE);
  cacheTag(PUBLISHED_POSTS_CACHE_TAG);
}

function mapCreator(row: PublicCreatorRow): Post["creator"] {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle ?? undefined,
    url: row.url ?? undefined,
    avatarUrl: row.avatarUrl,
    avatarStorageProvider: MEDIA_STORAGE_PROVIDERS.some(
      (provider) => provider === row.avatarStorageProvider,
    )
      ? (row.avatarStorageProvider as NonNullable<
          Post["creator"]["avatarStorageProvider"]
        >)
      : undefined,
  };
}

function mapMedia(row: PublicMediaRow): Post["media"][number] {
  return {
    id: row.id,
    type: row.type as MediaType,
    url: row.url,
    posterUrl: row.posterUrl ?? undefined,
    storageProvider: MEDIA_STORAGE_PROVIDERS.some(
      (provider) => provider === row.storageProvider,
    )
      ? (row.storageProvider as NonNullable<Post["media"][number]["storageProvider"]>)
      : undefined,
    mimeType: row.mimeType ?? undefined,
    sourceMimeType: row.sourceMimeType ?? undefined,
    sizeBytes: row.sizeBytes ?? undefined,
    variants: row.variants,
    videoPreview: row.videoPreview ?? undefined,
    alt: row.alt,
    width: row.width,
    height: row.height,
    position: row.position,
  };
}

function mapPost(row: PostRecord): Post {
  if (!isPostCategory(row.category)) {
    throw new Error(`Unsupported post category: ${row.category}`);
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    creator: mapCreator(row.creator),
    description: row.description,
    category: row.category,
    industries: row.industries,
    colors: row.colors,
    styles: row.styles,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt.toISOString(),
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    isFeatured: row.isFeatured,
    media: row.media.map(mapMedia),
  };
}

function mapPostCard(row: PostCardRecord): PostCardData {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    creator: {
      name: row.creator.name,
      avatarUrl: row.creator.avatarUrl,
      avatarStorageProvider: MEDIA_STORAGE_PROVIDERS.some(
        (provider) => provider === row.creator.avatarStorageProvider,
      )
        ? (row.creator.avatarStorageProvider as NonNullable<
            PostCardData["creator"]["avatarStorageProvider"]
          >)
        : undefined,
    },
    createdAt: row.createdAt.toISOString(),
    media: row.media.map((media) => ({
      id: media.id,
      type: media.type as MediaType,
      url: media.url,
      posterUrl: media.posterUrl ?? undefined,
      storageProvider: MEDIA_STORAGE_PROVIDERS.some(
        (provider) => provider === media.storageProvider,
      )
        ? (media.storageProvider as NonNullable<
            PostCardData["media"][number]["storageProvider"]
          >)
        : undefined,
      variants: media.variants,
      videoPreview: media.videoPreview ?? undefined,
      alt: media.alt,
      width: media.width,
      height: media.height,
    })),
    mediaCount: row.mediaCount,
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
      columns: {
        id: true,
        slug: true,
        title: true,
        createdAt: true,
      },
      extras: {
        mediaCount: sql<number>`(
          select count(*)::int
          from "post_media" as "media_count_rows"
          where "media_count_rows"."post_id" = ${posts.id}
        )`.as("media_count"),
      },
      where: and(
        publishedWhere(now),
        category ? eq(posts.category, category) : undefined,
        view === "featured" ? eq(posts.isFeatured, true) : undefined,
        cursorCondition,
      ),
      orderBy: [desc(posts.createdAt), desc(posts.id)],
      limit: POST_PAGE_SIZE + 1,
      with: {
        creator: { columns: POST_CARD_CREATOR_COLUMNS },
        media: {
          columns: POST_CARD_MEDIA_COLUMNS,
          orderBy: [asc(postMedia.position)],
          limit: 1,
        },
      },
    });
    const items = rows.slice(0, POST_PAGE_SIZE).map(mapPostCard);
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
      columns: PUBLIC_POST_COLUMNS,
      where: and(
        publishedWhere(new Date()),
        eq(posts.slug, slug),
      ),
      with: {
        creator: { columns: PUBLIC_CREATOR_COLUMNS },
        media: {
          columns: PUBLIC_MEDIA_COLUMNS,
          orderBy: [asc(postMedia.position)],
        },
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

  let lastCause: unknown;

  for (let attempt = 1; attempt <= PUBLISHED_SLUG_QUERY_ATTEMPTS; attempt += 1) {
    try {
      const rows = await database.query.posts.findMany({
        columns: { slug: true },
        where: publishedWhere(new Date()),
        orderBy: [desc(posts.createdAt), desc(posts.id)],
      });
      return rows.map((post) => post.slug);
    } catch (cause) {
      lastCause = cause;

      if (attempt < PUBLISHED_SLUG_QUERY_ATTEMPTS) {
        await new Promise((resolve) => {
          setTimeout(
            resolve,
            PUBLISHED_SLUG_RETRY_DELAY_MS * 2 ** (attempt - 1),
          );
        });
      }
    }
  }

  throw new Error("Could not load published post slugs.", {
    cause: lastCause,
  });
}

export function getAdjacentPosts(post: PostPosition): Promise<{
  previousPost: AdjacentPost;
  nextPost: AdjacentPost;
}> {
  return getAdjacentPostsCached(post, ADJACENT_POSTS_CACHE_VERSION);
}

async function getAdjacentPostsCached(
  post: PostPosition,
  cacheVersion: number,
): Promise<{
  previousPost: AdjacentPost;
  nextPost: AdjacentPost;
}> {
  "use cache";

  void cacheVersion;
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
          ne(posts.id, post.id),
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
          ne(posts.id, post.id),
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
