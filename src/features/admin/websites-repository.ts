import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ne } from "drizzle-orm";

import { requireDatabase } from "@/db/client";
import {
  adminAuditLogs,
  creators,
  websiteMedia,
  websites,
  websiteSections,
} from "@/db/schema";
import { withWriteTransaction, type WriteTx } from "@/db/write-client";
import { isWebsiteMediaRole } from "@/domain/website";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";

import {
  saveAdminCreatorForAttribution,
  type AdminPrincipal,
} from "@/features/creators/identity";
import { mapAdminCreatorAttribution } from "@/features/creators/identity/projections";
import {
  collectWebsiteManagedAssets,
  getRetainedWebsiteStorageKeys,
} from "./website-media-ownership";
import type {
  AdminWebsiteInput,
  AdminWebsiteRecord,
} from "./types";

type WebsiteRow = typeof websites.$inferSelect;
type WebsiteMediaRow = typeof websiteMedia.$inferSelect;
type WebsiteSectionRow = typeof websiteSections.$inferSelect;
type CreatorRow = Parameters<typeof mapAdminCreatorAttribution>[0];

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function mapAdminWebsite(
  row: WebsiteRow & {
    creator: CreatorRow;
    media: WebsiteMediaRow[];
    sections: WebsiteSectionRow[];
  },
): AdminWebsiteRecord | null {
  const supportedMedia = row.media.filter((media) => isWebsiteMediaRole(media.role));
  const hasCompleteSections = row.sections.every(
    (section) =>
      section.imageUrl && section.imageWidth && section.imageHeight,
  );
  if (
    supportedMedia.length !== 2 ||
    !supportedMedia.some((media) => media.role === "recording") ||
    !supportedMedia.some((media) => media.role === "favicon") ||
    !hasCompleteSections
  ) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline,
    creator: mapAdminCreatorAttribution(row.creator),
    description: row.description,
    categories: row.categories,
    themes: row.themes,
    colors: row.colors,
    sourceUrl: row.sourceUrl,
    isFeatured: row.isFeatured,
    status: row.status as AdminWebsiteRecord["status"],
    publishedAt: row.publishedAt?.toISOString(),
    archivedAt: row.archivedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    media: supportedMedia.map((media) => ({
      role: media.role as AdminWebsiteRecord["media"][number]["role"],
      url: media.url,
      posterUrl: media.posterUrl ?? undefined,
      storageProvider: isStorageProvider(media.storageProvider)
        ? (media.storageProvider as AdminWebsiteRecord["media"][number]["storageProvider"])
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
    sections: row.sections.map((section) => ({
      id: section.id,
      label: section.label,
      alt: section.imageAlt,
      url: section.imageUrl!,
      storageProvider: isStorageProvider(section.imageStorageProvider)
        ? (section.imageStorageProvider as AdminWebsiteRecord["sections"][number]["storageProvider"])
        : undefined,
      storageKey: section.imageStorageKey ?? undefined,
      mimeType: section.imageMimeType ?? undefined,
      sourceMimeType: section.imageSourceMimeType ?? undefined,
      sizeBytes: section.imageSizeBytes ?? undefined,
      variants: section.imageVariants,
      width: section.imageWidth!,
      height: section.imageHeight!,
      position: section.position,
    })),
  };
}

function websiteValues(input: AdminWebsiteInput, creatorId: string) {
  return {
    slug: input.slug,
    title: input.title,
    tagline: input.tagline,
    creatorId,
    description: input.description,
    categories: input.categories,
    themes: input.themes,
    colors: input.colors,
    sourceUrl: input.sourceUrl,
    isFeatured: input.isFeatured,
    status: input.status,
  };
}

function mediaValues(websiteId: string, input: AdminWebsiteInput) {
  return input.media.map((media) => ({
    websiteId,
    role: media.role,
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
  }));
}

function sectionValues(websiteId: string, input: AdminWebsiteInput) {
  return input.sections.map((section) => ({
    id: section.id,
    websiteId,
    label: section.label,
    position: section.position,
    imageUrl: section.url,
    imageStorageProvider: section.storageProvider,
    imageStorageKey: section.storageKey,
    imageMimeType: section.mimeType,
    imageSourceMimeType: section.sourceMimeType,
    imageSizeBytes: section.sizeBytes,
    imageVariants: section.variants ?? [],
    imageAlt: section.alt,
    imageWidth: section.width,
    imageHeight: section.height,
  }));
}

export async function insertAdminWebsiteInTransaction(
  tx: WriteTx,
  input: AdminWebsiteInput,
  actorId: string,
  creatorId: string,
) {
  const id = randomUUID();
  const now = new Date();
  await tx.insert(websites).values({
    id,
    ...websiteValues(input, creatorId),
    publishedAt: input.status === "published" ? now : null,
    archivedAt: null,
    createdBy: actorId,
    updatedBy: actorId,
  });
  await tx.insert(websiteMedia).values(mediaValues(id, input));
  await tx.insert(websiteSections).values(sectionValues(id, input));
  return { id, slug: input.slug };
}

function websiteRelations() {
  return {
    creator: true as const,
    media: { orderBy: [asc(websiteMedia.createdAt)] },
    sections: { orderBy: [asc(websiteSections.position)] },
  };
}

export async function getAdminWebsites() {
  const database = requireDatabase();
  const rows = await database.query.websites.findMany({
    orderBy: [desc(websites.createdAt), desc(websites.id)],
    with: websiteRelations(),
  });
  return rows.map(mapAdminWebsite).filter((website): website is AdminWebsiteRecord => Boolean(website));
}

export async function getAdminWebsiteById(id: string) {
  const database = requireDatabase();
  const row = await database.query.websites.findFirst({
    where: eq(websites.id, id),
    with: websiteRelations(),
  });
  return row ? mapAdminWebsite(row) : null;
}

export async function createAdminWebsite(
  input: AdminWebsiteInput,
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

    await tx.insert(websites).values({
      id,
      ...websiteValues(input, creator.creatorId),
      publishedAt: input.status === "published" ? now : null,
      archivedAt: null,
      createdBy: adminPrincipal.userId,
      updatedBy: adminPrincipal.userId,
    });
    await tx.insert(websiteMedia).values(mediaValues(id, input));
    await tx.insert(websiteSections).values(sectionValues(id, input));
    await tx.insert(adminAuditLogs).values({
      actorId: adminPrincipal.userId,
      action: "website.created",
      resourceType: "website",
      resourceId: id,
      details: { slug: input.slug, status: input.status },
    });

    const retainedKeys = getRetainedWebsiteStorageKeys(input);
    return {
      id,
      slug: input.slug,
      removedManagedMedia: creator.displacedAvatarAssets.filter(
        (asset) => !retainedKeys.has(asset.storageKey),
      ),
    };
  });
}

export async function updateAdminWebsite(
  id: string,
  input: AdminWebsiteInput,
  adminPrincipal: AdminPrincipal,
) {
  return withWriteTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(websites)
      .where(eq(websites.id, id))
      .for("update");
    if (!existing) throw new Error("Website not found.");
    const existingMedia = await tx
      .select()
      .from(websiteMedia)
      .where(eq(websiteMedia.websiteId, id))
      .for("update");
    const existingSections = await tx
      .select()
      .from(websiteSections)
      .where(eq(websiteSections.websiteId, id))
      .for("update");
    const creator = await saveAdminCreatorForAttribution(
      tx,
      adminPrincipal,
      input.creator,
    );
    const now = new Date();
    const publishedAt = input.status === "published"
      ? (existing.publishedAt ?? now)
      : null;
    const retainedKeys = getRetainedWebsiteStorageKeys(input);
    const [savedCreator] = await tx
      .select({ avatarStorageKey: creators.avatarStorageKey })
      .from(creators)
      .where(eq(creators.id, creator.creatorId));
    if (savedCreator?.avatarStorageKey) {
      retainedKeys.add(savedCreator.avatarStorageKey);
    }
    const removedManagedMedia = [
      ...collectWebsiteManagedAssets(existingMedia, existingSections),
      ...creator.displacedAvatarAssets,
    ].filter((asset) => !retainedKeys.has(asset.storageKey));

    await tx.update(websites).set({
      ...websiteValues(input, creator.creatorId),
      publishedAt,
      archivedAt: null,
      updatedBy: adminPrincipal.userId,
      updatedAt: now,
    }).where(eq(websites.id, id));
    await tx.delete(websiteMedia).where(eq(websiteMedia.websiteId, id));
    await tx.insert(websiteMedia).values(mediaValues(id, input));
    await tx.delete(websiteSections).where(eq(websiteSections.websiteId, id));
    await tx.insert(websiteSections).values(sectionValues(id, input));
    await tx.insert(adminAuditLogs).values({
      actorId: adminPrincipal.userId,
      action: "website.updated",
      resourceType: "website",
      resourceId: id,
      details: { previousSlug: existing.slug, slug: input.slug, status: input.status },
    });

    return {
      id,
      slug: input.slug,
      previousSlug: existing.slug,
      removedManagedMedia,
    };
  });
}

export async function archiveAdminWebsite(id: string, actorId: string) {
  const database = requireDatabase();
  const now = new Date();
  const existing = await database.query.websites.findFirst({
    where: and(eq(websites.id, id), ne(websites.status, "archived")),
    columns: { id: true, slug: true },
  });
  if (!existing) throw new Error("Only active websites can be archived.");

  await database.batch([
    database.update(websites).set({
      status: "archived",
      archivedAt: now,
      updatedAt: now,
      updatedBy: actorId,
    }).where(and(eq(websites.id, id), ne(websites.status, "archived"))),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "website.archived",
      resourceType: "website",
      resourceId: id,
      details: { slug: existing.slug },
    }),
  ]);
  return existing;
}

export async function setAdminWebsiteFeatured(
  id: string,
  isFeatured: boolean,
  actorId: string,
) {
  const database = requireDatabase();
  const existing = await database.query.websites.findFirst({
    where: eq(websites.id, id),
    columns: { id: true, slug: true, isFeatured: true },
  });

  if (!existing) throw new Error("Website not found.");
  if (existing.isFeatured === isFeatured) return existing;

  const now = new Date();
  await database.batch([
    database
      .update(websites)
      .set({ isFeatured, updatedAt: now, updatedBy: actorId })
      .where(eq(websites.id, id)),
    database.insert(adminAuditLogs).values({
      actorId,
      action: isFeatured ? "website.featured" : "website.unfeatured",
      resourceType: "website",
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

export async function deleteArchivedWebsite(id: string, actorId: string) {
  const database = requireDatabase();
  const existing = await database.query.websites.findFirst({
    where: and(eq(websites.id, id), eq(websites.status, "archived")),
    with: { media: true, sections: true },
  });
  if (!existing) throw new Error("Archive the website before deleting it permanently.");

  const removedManagedMedia = collectWebsiteManagedAssets(existing.media, existing.sections);
  await database.batch([
    database.delete(websites).where(and(eq(websites.id, id), eq(websites.status, "archived"))),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "website.deleted",
      resourceType: "website",
      resourceId: id,
      details: { slug: existing.slug },
    }),
  ]);
  return { id: existing.id, slug: existing.slug, removedManagedMedia };
}
