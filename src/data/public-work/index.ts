import "server-only";

import { and, asc, desc, eq, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { requireDatabase } from "@/db/client";
import { logoMedia, logos, postMedia, posts, websiteMedia, websites, websiteSections } from "@/db/schema";
import type { Logo } from "@/domain/logo";
import { POST_CATEGORIES, type PostCardData, type PostCategory, type PostView } from "@/domain/post";
import type { Website } from "@/domain/website";
import type { WorkCardData } from "@/domain/work-card";
import { readSavedCounts, readSavedPage, savedCountRequestSchema, savedPageRequestSchema, type SavedWorkCountRequest, type SavedWorkPageRequest } from "./saved";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";
import { PUBLIC_WORK_CACHE_LIFE, PUBLISHED_LOGOS_CACHE_TAG, PUBLISHED_POSTS_CACHE_TAG, PUBLISHED_WEBSITES_CACHE_TAG } from "./cache";
import { evaluationTime } from "./clock";
import { decodePersistedDesignArchiveCursor, encodeDesignArchiveCursor, InvalidPublicWorkCursorError, type DesignArchiveCursorKeys } from "./cursor";
import { mapPostCard } from "./design-presentation";
import { mapPublishedLogo } from "./logo-presentation";
import { completeWebsiteRecordingPredicate, hasCompleteRecording, mapPublishedWebsite } from "./website-presentation";

import { creatorCountRequestSchema, creatorPageRequestSchema, creatorScopeSchema, readCreatorCounts, readCreatorPage, readCreatorIdentities, type CreatorWorkCountRequest, type CreatorWorkPageRequest } from "./creator";

const websiteArchiveRequestSchema = z.strictObject({
  scope: z.strictObject({ kind: z.literal("website-archive") }),
  filters: z.strictObject({ view: z.enum(["latest", "featured"]).optional() }).optional(),
  order: z.literal("publication-desc"),
  cursor: z.null().optional(),
});
const designArchiveRequestSchema = z.strictObject({
  scope: z.strictObject({ kind: z.literal("design-archive") }),
  filters: z.strictObject({
    category: z.enum(POST_CATEGORIES).optional(),
    view: z.enum(["latest", "featured"]).optional(),
  }).optional(),
  order: z.literal("created-desc"),
  cursor: z.string().min(1).optional().nullable(),
});
const logoArchiveRequestSchema = z.strictObject({
  scope: z.strictObject({ kind: z.literal("logo-archive") }),
  order: z.literal("created-desc"),
  cursor: z.null().optional(),
});
const requestSchema = z.union([
  creatorPageRequestSchema,
  savedPageRequestSchema,
  websiteArchiveRequestSchema,
  designArchiveRequestSchema,
  logoArchiveRequestSchema,
]);

export type WebsiteArchiveRequest = {
  scope: { kind: "website-archive" };
  filters?: { view?: "latest" | "featured" };
  order: "publication-desc";
  cursor?: string | null;
};
export type DesignArchiveRequest = {
  scope: { kind: "design-archive" };
  filters?: { category?: PostCategory; view?: PostView };
  order: "created-desc";
  cursor?: string | null;
};
export type LogoArchiveRequest = {
  scope: { kind: "logo-archive" };
  order: "created-desc";
  cursor?: string | null;
};
export type WorkPageRequest = WebsiteArchiveRequest | DesignArchiveRequest | LogoArchiveRequest | SavedWorkPageRequest | CreatorWorkPageRequest;
export type WorkPage<Item = Website | PostCardData | Logo | WorkCardData> = {
  items: Item[];
  nextCursor: string | null;
};

export function readWorkPage(request: WebsiteArchiveRequest): Promise<WorkPage<Website>>;
export function readWorkPage(request: DesignArchiveRequest): Promise<WorkPage<PostCardData>>;
export function readWorkPage(request: LogoArchiveRequest): Promise<WorkPage<Logo>>;
export function readWorkPage(request: SavedWorkPageRequest): Promise<WorkPage<WorkCardData>>;
export function readWorkPage(request: CreatorWorkPageRequest): Promise<WorkPage<WorkCardData>>;
export async function readWorkPage(request: WorkPageRequest): Promise<WorkPage> {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) throw new Error("Unsupported public-work page request.");

  if (parsed.data.scope.kind === "creator") return readCreatorPage(creatorPageRequestSchema.parse(parsed.data));

  if (parsed.data.scope.kind === "saved") return readSavedPage(savedPageRequestSchema.parse(parsed.data));

  if (parsed.data.scope.kind === "website-archive") {
    const websiteRequest = websiteArchiveRequestSchema.parse(parsed.data);
    return readWebsiteArchive(websiteRequest.filters?.view ?? "latest");
  }
  if (parsed.data.scope.kind === "logo-archive") return readLogoArchive();

  const designRequest = designArchiveRequestSchema.parse(parsed.data);
  const binding = {
    category: designRequest.filters?.category,
    view: designRequest.filters?.view ?? "latest",
  };
  const cursor = designRequest.cursor
    ? decodePersistedDesignArchiveCursor(designRequest.cursor, binding)
    : null;
  if (designRequest.cursor && !cursor) throw new InvalidPublicWorkCursorError();
  return readDesignArchive(binding.category, binding.view, cursor);
}

async function readWebsiteArchive(view: "latest" | "featured"): Promise<WorkPage<Website>> {
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

async function readLogoArchive(): Promise<WorkPage<Logo>> {
  "use cache";
  cacheLife(PUBLIC_WORK_CACHE_LIFE);
  cacheTag(PUBLISHED_LOGOS_CACHE_TAG, PUBLIC_CREATOR_PROFILES_CACHE_TAG);

  const database = requireDatabase();
  const now = evaluationTime();
  const rows = await database.query.logos.findMany({
    where: and(
      eq(logos.status, "published"),
      isNotNull(logos.publishedAt),
      lte(logos.publishedAt, now),
    ),
    orderBy: [desc(logos.createdAt), desc(logos.id)],
    with: {
      creator: true,
      media: { orderBy: [asc(logoMedia.createdAt)], limit: 1 },
    },
  });
  const items = rows.map((row) => {
    if (row.status !== "published" || !row.publishedAt || row.publishedAt > now) {
      throw new Error(`Public logo ${row.id} has inconsistent publication data.`);
    }
    return mapPublishedLogo(row);
  });
  return { items, nextCursor: null };
}

async function readDesignArchive(
  category: PostCategory | undefined,
  view: PostView,
  cursor: DesignArchiveCursorKeys | null,
): Promise<WorkPage<PostCardData>> {
  "use cache";
  cacheLife(PUBLIC_WORK_CACHE_LIFE);
  cacheTag(PUBLISHED_POSTS_CACHE_TAG, PUBLIC_CREATOR_PROFILES_CACHE_TAG);

  const database = requireDatabase();
  const now = evaluationTime();
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const rows = await database.query.posts.findMany({
    columns: {
      id: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      category: true,
      isFeatured: true,
    },
    extras: {
      mediaCount: sql<number>`(
        select count(*)::int
        from "post_media" as "media_count_rows"
        where "media_count_rows"."post_id" = ${posts.id}
      )`.as("media_count"),
    },
    where: and(
      eq(posts.status, "published"),
      isNotNull(posts.publishedAt),
      lte(posts.publishedAt, now),
      category ? eq(posts.category, category) : undefined,
      view === "featured" ? eq(posts.isFeatured, true) : undefined,
      cursor && cursorDate
        ? or(
            lt(posts.createdAt, cursorDate),
            and(eq(posts.createdAt, cursorDate), lt(posts.id, cursor.id)),
          )
        : undefined,
    ),
    orderBy: [desc(posts.createdAt), desc(posts.id)],
    limit: 17,
    with: {
      creator: {
        columns: {
          name: true,
          username: true,
          avatarUrl: true,
          avatarStorageProvider: true,
        },
      },
      media: {
        columns: {
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
        },
        orderBy: [asc(postMedia.position)],
        limit: 1,
      },
    },
  });

  const items = rows.slice(0, 16).map((row): PostCardData => {
    if (row.status !== "published" || !row.publishedAt || row.publishedAt > now) {
      throw new Error(`Public design ${row.id} has inconsistent publication data.`);
    }
    return mapPostCard(row);
  });
  const finalItem = items.at(-1);

  return {
    items,
    nextCursor:
      rows.length > 16 && finalItem
        ? encodeDesignArchiveCursor(
            { createdAt: finalItem.createdAt, id: finalItem.id },
            { category, view },
          )
        : null,
  };
}

export function readWorkCounts(request: CreatorWorkCountRequest): ReturnType<typeof readCreatorCounts>;
export function readWorkCounts(request: SavedWorkCountRequest): ReturnType<typeof readSavedCounts>;
export async function readWorkCounts(request: SavedWorkCountRequest | CreatorWorkCountRequest) {
  if (request.scope.kind === "creator") {
    const parsed = creatorCountRequestSchema.safeParse(request);
    if (!parsed.success) throw new Error("Unsupported public-work count request.");
    return readCreatorCounts(parsed.data);
  }
  const parsed = savedCountRequestSchema.safeParse(request);
  if (!parsed.success) throw new Error("Unsupported public-work count request.");
  return readSavedCounts(parsed.data);
}

export async function readWorkIdentities(request: { scope: z.infer<typeof creatorScopeSchema> }) {
  const parsed = z.strictObject({ scope: creatorScopeSchema }).safeParse(request);
  if (!parsed.success) throw new Error("Unsupported public-work identity request.");
  return readCreatorIdentities(parsed.data.scope);
}
