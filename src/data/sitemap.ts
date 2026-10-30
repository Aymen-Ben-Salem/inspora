import "server-only";

import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { requireDatabase } from "@/db/client";
import { creators, creatorUsernameAliases, posts, profileAccounts } from "@/db/schema";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";
import { absoluteUrl } from "@/lib/seo";
import { PUBLISHED_POSTS_CACHE_TAG } from "./public-work/cache";
import { publicCreatorPredicate } from "./public-work/creator-visibility";

export async function readPublicSitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  // Admin/owner/claim mutations already expire these tags after committing.
  // Bound the fallback too, for scheduled publications and out-of-band edits.
  cacheTag(PUBLISHED_POSTS_CACHE_TAG, PUBLIC_CREATOR_PROFILES_CACHE_TAG);
  cacheLife({ stale: 0, revalidate: 240, expire: 300 });

  const database = requireDatabase();
  const notDevelopmentFixture = sql`coalesce(lower(trim(${creators.handle})), '') not like 'dev-%'`;
  const [designs, profiles] = await Promise.all([
    database.select({ slug: posts.slug }).from(posts)
      .innerJoin(creators, eq(creators.id, posts.creatorId))
      .where(and(
        eq(posts.status, "published"),
        lte(posts.publishedAt, new Date()),
        publicCreatorPredicate(posts.creatorId),
        notDevelopmentFixture,
      )).orderBy(asc(posts.slug)),
    database.select({ username: creators.username }).from(creators)
      .leftJoin(profileAccounts, eq(profileAccounts.userId, creators.ownerUserId))
      .innerJoin(creatorUsernameAliases, and(
        eq(creatorUsernameAliases.creatorId, creators.id),
        eq(creatorUsernameAliases.username, creators.username),
        eq(creatorUsernameAliases.isCurrent, true),
      ))
      .where(and(
        isNotNull(creators.username),
        isNull(creators.trashedAt),
        notDevelopmentFixture,
        or(isNull(creators.ownerUserId), eq(profileAccounts.status, "active")),
      )).orderBy(asc(creators.username)),
  ]);

  // Logos, icons and websites currently have archive pages, not detail URLs.
  // Keep the same canonical domain used by page metadata, including on Preview.
  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    ...["/logos", "/websites"].map(path => ({ url: absoluteUrl(path), changeFrequency: "weekly" as const, priority: 0.8 })),
    ...["/info", "/sponsor"].map(path => ({ url: absoluteUrl(path), changeFrequency: "monthly" as const, priority: 0.6 })),
    ...designs.map(({ slug }) => ({ url: absoluteUrl(`/posts/${encodeURIComponent(slug)}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    ...profiles.flatMap(({ username }) => username ? [{ url: absoluteUrl(`/creators/${encodeURIComponent(username)}`), changeFrequency: "weekly" as const, priority: 0.7 }] : []),
  ];
}
