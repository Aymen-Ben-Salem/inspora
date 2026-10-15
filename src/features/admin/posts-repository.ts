import "server-only";
import { protectPublicationMedia } from "../submissions/publication-assets";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

import { requireAdmin } from "@/auth/require-admin";

import { requireDatabase } from "@/db/client";
import { adminAuditLogs, creators, postMedia, posts } from "@/db/schema";
import { withWriteTransaction, type WriteTx } from "@/db/write-client";
import { mapAdminCreatorAttribution } from "@/features/creators/identity/projections";
import {
  saveAdminCreatorForAttribution,
  type AdminPrincipal,
} from "@/features/creators/identity";
import type { MediaType } from "@/domain/post";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";

import type {
  AdminPostInput,
  AdminPostRecord,
  AdminPostStatus,
  ManagedMediaAsset,
} from "./types";
import { ADMIN_LIBRARY_PAGE_SIZE, adminThumbnailUrl, getAdminLibraryPagination, type AdminLibraryOptions } from "./library-pagination";

type PostRow = typeof posts.$inferSelect;
type CreatorRow = Parameters<typeof mapAdminCreatorAttribution>[0];
type MediaRow = typeof postMedia.$inferSelect;

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function mapAdminPost(
  row: PostRow & { creator: CreatorRow; media: MediaRow[] },
): AdminPostRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    creator: mapAdminCreatorAttribution(row.creator),
    description: row.description,
    category: row.category as AdminPostRecord["category"],
    industries: row.industries,
    colors: row.colors,
    styles: row.styles,
    sourceUrl: row.sourceUrl,
    isFeatured: row.isFeatured,
    status: row.status as AdminPostStatus,
    publishedAt: row.publishedAt?.toISOString(),
    archivedAt: row.archivedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    media: row.media.map((media) => ({
      type: media.type as MediaType,
      url: media.url,
      posterUrl: media.posterUrl ?? undefined,
      storageProvider: isStorageProvider(media.storageProvider)
        ? (media.storageProvider as AdminPostRecord["media"][number]["storageProvider"])
        : undefined,
      storageKey: media.storageKey ?? undefined,
      mimeType: media.mimeType ?? undefined,
      sourceMimeType: media.sourceMimeType ?? undefined,
      sizeBytes: media.sizeBytes ?? undefined,
      variants: media.variants,
      videoPreview: media.videoPreview ?? undefined,
      posterStorageKey: media.posterStorageKey ?? undefined,
      alt: media.alt,
      width: media.width,
      height: media.height,
    })),
  };
}

function mediaValues(postId: string, input: AdminPostInput) {
  return input.media.map((media, position) => ({
    postId,
    type: media.type,
    url: media.url,
    posterUrl: media.posterUrl,
    storageProvider: media.storageProvider,
    storageKey: media.storageKey,
    mimeType: media.mimeType,
    sourceMimeType: media.sourceMimeType,
    sizeBytes: media.sizeBytes,
    variants: media.variants ?? [],
    videoPreview: media.videoPreview,
    posterStorageKey: media.posterStorageKey,
    alt: media.alt,
    width: media.width,
    height: media.height,
    position,
  }));
}

function managedAssets(media: MediaRow[]): ManagedMediaAsset[] {
  return media.flatMap((item) =>
    isStorageProvider(item.storageProvider) && item.storageKey
      ? [
          {
            storageProvider: item.storageProvider as ManagedMediaAsset["storageProvider"],
            storageKey: item.storageKey,
            type: item.type as MediaType,
            variantStorageKeys: item.variants.map((variant) => variant.storageKey),
            videoPreviewStorageKey: item.videoPreview?.storageKey,
            posterStorageKey: item.posterStorageKey ?? undefined,
          },
        ]
      : [],
  );
}

function unretainedDesignAssets(
  candidates: ManagedMediaAsset[],
  input: AdminPostInput,
  avatarStorageKey?: string | null,
) {
  const retainedKeys = new Set([
    ...input.media.flatMap((media) => [
      media.storageKey,
      ...(media.variants ?? []).map((variant) => variant.storageKey),
      media.videoPreview?.storageKey,
      media.posterStorageKey,
    ]),
    avatarStorageKey,
  ]);
  const seen = new Set<string>();
  return candidates.flatMap((asset): ManagedMediaAsset[] => {
    const key = asset.storageProvider + ":" + asset.storageKey;
    if (retainedKeys.has(asset.storageKey) || seen.has(key)) return [];
    seen.add(key);
    return [{
      ...asset,
      ...(asset.variantStorageKeys ? {
        variantStorageKeys: asset.variantStorageKeys.filter((key) => !retainedKeys.has(key)),
      } : {}),
      ...(asset.videoPreviewStorageKey && retainedKeys.has(asset.videoPreviewStorageKey)
        ? { videoPreviewStorageKey: undefined } : {}),
      ...(asset.posterStorageKey && retainedKeys.has(asset.posterStorageKey)
        ? { posterStorageKey: undefined } : {}),
    }];
  });
}

function postValues(input: AdminPostInput, creatorId: string) {
  return {
    slug: input.slug,
    title: input.title,
    creatorId,
    description: input.description,
    category: input.category,
    industries: input.industries,
    colors: input.colors,
    styles: input.styles,
    sourceUrl: input.sourceUrl,
    isFeatured: input.isFeatured,
    status: input.status,
  };
}

export async function insertAdminPostInTransaction(
  tx: WriteTx,
  input: AdminPostInput,
  actorId: string,
  creatorId: string,
) {
  const id = randomUUID();
  const now = new Date();
  await tx.insert(posts).values({
    id,
    ...postValues(input, creatorId),
    publishedAt: input.status === "published" ? now : null,
    archivedAt: null,
    createdBy: actorId,
    updatedBy: actorId,
  });
  await protectPublicationMedia(tx, input.media);
  await tx.insert(postMedia).values(mediaValues(id, input));
  return { id, slug: input.slug };
}

export async function getAdminPosts(options: AdminLibraryOptions = {}) {
  await requireAdmin();
  const database = requireDatabase();
  const pagination = await getAdminLibraryPagination(database, posts, options);
  const rows = await database.query.posts.findMany({
    columns: { id: true, slug: true, title: true, category: true, isFeatured: true, status: true, createdAt: true },
    where: options.view === "featured" ? eq(posts.isFeatured, true) : undefined,
    orderBy: [desc(posts.createdAt), desc(posts.id)],
    limit: ADMIN_LIBRARY_PAGE_SIZE,
    offset: (pagination.page - 1) * ADMIN_LIBRARY_PAGE_SIZE,
    extras: (fields) => ({
      mediaCount: sql<number>`(select count(*)::int from post_media where post_media.post_id = ${fields.id})`.as("media_count"),
    }),
    with: {
      creator: { columns: { name: true } },
      media: {
        columns: { type: true, url: true, posterUrl: true, alt: true, width: true, sourceMimeType: true, variants: true },
        orderBy: [asc(postMedia.position)], limit: 1,
      },
    },
  });

  return { ...pagination, items: rows.map((row) => ({
    ...row,
    media: row.media.map(({ variants, ...media }) => ({
      ...media,
      url: media.type === "image" ? adminThumbnailUrl(media.url, variants) : media.url,
    })),
  })) };
}

export async function getAdminPostById(id: string) {
  const database = requireDatabase();
  const row = await database.query.posts.findFirst({
    where: eq(posts.id, id),
    with: {
      creator: true,
      media: { orderBy: [asc(postMedia.position)] },
    },
  });

  return row ? mapAdminPost(row) : null;
}

export async function createAdminPost(
  input: AdminPostInput,
  adminPrincipal: AdminPrincipal,
) {
  return withWriteTransaction(async (tx) => {
    const creator = await saveAdminCreatorForAttribution(
      tx,
      adminPrincipal,
      input.creator,
    );
    const now = new Date();
    const id = randomUUID();

    await tx.insert(posts).values({
      id,
      ...postValues(input, creator.creatorId),
      publishedAt: input.status === "published" ? now : null,
      archivedAt: null,
      createdBy: adminPrincipal.userId,
      updatedBy: adminPrincipal.userId,
    });
    await protectPublicationMedia(tx, input.media);
  await tx.insert(postMedia).values(mediaValues(id, input));
    await tx.insert(adminAuditLogs).values({
      actorId: adminPrincipal.userId,
      action: "post.created",
      resourceType: "post",
      resourceId: id,
      details: { slug: input.slug, status: input.status },
    });

    return {
      id,
      slug: input.slug,
      removedManagedMedia: unretainedDesignAssets(creator.displacedAvatarAssets, input),
    };
  });
}

export async function updateAdminPost(
  id: string,
  input: AdminPostInput,
  adminPrincipal: AdminPrincipal,
) {
  return withWriteTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .for("update");
    if (!existing) throw new Error("Post not found.");

    const existingMedia = await tx
      .select()
      .from(postMedia)
      .where(eq(postMedia.postId, id))
      .for("update");
    const creator = await saveAdminCreatorForAttribution(
      tx,
      adminPrincipal,
      input.creator,
    );
    const now = new Date();
    const publishedAt =
      input.status === "published" ? (existing.publishedAt ?? now) : null;
    const [savedCreator] = await tx
      .select({ avatarStorageKey: creators.avatarStorageKey })
      .from(creators)
      .where(eq(creators.id, creator.creatorId));
    const removedManagedMedia = unretainedDesignAssets(
      [...managedAssets(existingMedia), ...creator.displacedAvatarAssets],
      input,
      savedCreator?.avatarStorageKey,
    );

    await tx
      .update(posts)
      .set({
        ...postValues(input, creator.creatorId),
        publishedAt,
        archivedAt: null,
        updatedBy: adminPrincipal.userId,
        updatedAt: now,
      })
      .where(eq(posts.id, id));
    await tx.delete(postMedia).where(eq(postMedia.postId, id));
    await protectPublicationMedia(tx, input.media);
  await tx.insert(postMedia).values(mediaValues(id, input));
    await tx.insert(adminAuditLogs).values({
      actorId: adminPrincipal.userId,
      action: "post.updated",
      resourceType: "post",
      resourceId: id,
      details: {
        previousSlug: existing.slug,
        slug: input.slug,
        previousStatus: existing.status,
        status: input.status,
      },
    });

    return {
      id,
      slug: input.slug,
      previousSlug: existing.slug,
      removedManagedMedia,
    };
  });
}

export async function archiveAdminPost(id: string, actorId: string) {
  const database = requireDatabase();
  const now = new Date();
  const existing = await database.query.posts.findFirst({
    where: and(eq(posts.id, id), ne(posts.status, "archived")),
    columns: { id: true, slug: true },
  });

  if (!existing) throw new Error("Only active posts can be archived.");

  await database.batch([
    database
      .update(posts)
      .set({ status: "archived", archivedAt: now, updatedAt: now, updatedBy: actorId })
      .where(and(eq(posts.id, id), ne(posts.status, "archived"))),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "post.archived",
      resourceType: "post",
      resourceId: id,
      details: { slug: existing.slug },
    }),
  ]);

  return existing;
}

export async function setAdminPostFeatured(
  id: string,
  isFeatured: boolean,
  actorId: string,
) {
  const database = requireDatabase();
  const existing = await database.query.posts.findFirst({
    where: eq(posts.id, id),
    columns: { id: true, slug: true, isFeatured: true },
  });

  if (!existing) throw new Error("Post not found.");
  if (existing.isFeatured === isFeatured) return existing;

  const now = new Date();
  await database.batch([
    database
      .update(posts)
      .set({ isFeatured, updatedAt: now, updatedBy: actorId })
      .where(eq(posts.id, id)),
    database.insert(adminAuditLogs).values({
      actorId,
      action: isFeatured ? "post.featured" : "post.unfeatured",
      resourceType: "post",
      resourceId: id,
      details: {
        slug: existing.slug,
        previousIsFeatured: existing.isFeatured,
        isFeatured,
      },
    }),
  ]);

  return { ...existing, isFeatured };
}

export async function deleteArchivedPost(id: string, actorId: string) {
  const database = requireDatabase();
  const existing = await database.query.posts.findFirst({
    where: and(eq(posts.id, id), eq(posts.status, "archived")),
    with: { media: true },
  });

  if (!existing) throw new Error("Archive the post before deleting it permanently.");

  const removedManagedMedia = managedAssets(existing.media);

  await database.batch([
    database
      .delete(posts)
      .where(and(eq(posts.id, id), eq(posts.status, "archived"))),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "post.deleted",
      resourceType: "post",
      resourceId: id,
      details: { slug: existing.slug },
    }),
  ]);

  return { id: existing.id, slug: existing.slug, removedManagedMedia };
}
