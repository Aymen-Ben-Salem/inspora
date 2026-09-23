import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, ne } from "drizzle-orm";

import { requireDatabase } from "@/db/client";
import { adminAuditLogs, postMedia, posts } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { mapAdminCreatorAttribution } from "@/features/creators/identity/projections";
import { resolveCreatorMutation } from "@/features/creators/repository";
import type { MediaType } from "@/domain/post";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";

import type {
  AdminPostInput,
  AdminPostRecord,
  AdminPostStatus,
  ManagedMediaAsset,
} from "./types";

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
  await tx.insert(postMedia).values(mediaValues(id, input));
  return { id, slug: input.slug };
}

export async function getAdminPosts() {
  const database = requireDatabase();
  const rows = await database.query.posts.findMany({
    orderBy: [desc(posts.createdAt), desc(posts.id)],
    with: {
      creator: true,
      media: { orderBy: [asc(postMedia.position)] },
    },
  });

  return rows.map(mapAdminPost);
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

export async function createAdminPost(input: AdminPostInput, actorId: string) {
  const database = requireDatabase();
  const now = new Date();
  const id = randomUUID();
  const creator = await resolveCreatorMutation(database, input.creator);

  await database.batch([
    ...creator.mutations,
    database.insert(posts).values({
      id,
      ...postValues(input, creator.id),
      publishedAt: input.status === "published" ? now : null,
      archivedAt: null,
      createdBy: actorId,
      updatedBy: actorId,
    }),
    database.insert(postMedia).values(mediaValues(id, input)),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "post.created",
      resourceType: "post",
      resourceId: id,
      details: { slug: input.slug, status: input.status },
    }),
  ]);

  return {
    id,
    slug: input.slug,
    removedManagedMedia: creator.removedManagedMedia,
  };
}

export async function updateAdminPost(
  id: string,
  input: AdminPostInput,
  actorId: string,
) {
  const database = requireDatabase();
  const existing = await database.query.posts.findFirst({
    where: eq(posts.id, id),
    with: { creator: true, media: true },
  });

  if (!existing) throw new Error("Post not found.");

  const now = new Date();
  const publishedAt =
    input.status === "published" ? (existing.publishedAt ?? now) : null;
  const retainedStorageKeys = new Set(
    input.media.flatMap((media) => (media.storageKey ? [media.storageKey] : [])),
  );
  const removedManagedMedia = managedAssets(existing.media).filter(
    (media) => !retainedStorageKeys.has(media.storageKey),
  );
  const creator = await resolveCreatorMutation(database, input.creator);

  await database.batch([
    ...creator.mutations,
    database
      .update(posts)
      .set({
        ...postValues(input, creator.id),
        publishedAt,
        archivedAt: null,
        updatedBy: actorId,
        updatedAt: now,
      })
      .where(eq(posts.id, id)),
    database.delete(postMedia).where(eq(postMedia.postId, id)),
    database.insert(postMedia).values(mediaValues(id, input)),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "post.updated",
      resourceType: "post",
      resourceId: id,
      details: {
        previousSlug: existing.slug,
        slug: input.slug,
        previousStatus: existing.status,
        status: input.status,
      },
    }),
  ]);

  return {
    id,
    slug: input.slug,
    previousSlug: existing.slug,
    removedManagedMedia: [
      ...removedManagedMedia,
      ...creator.removedManagedMedia,
    ],
  };
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
