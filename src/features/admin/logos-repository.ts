import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, ne } from "drizzle-orm";

import { requireDatabase } from "@/db/client";
import { adminAuditLogs, logoMedia, logos } from "@/db/schema";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";

import { mapAdminCreator, resolveCreatorMutation } from "./posts-repository";
import type {
  AdminLogoInput,
  AdminLogoRecord,
  ManagedMediaAsset,
} from "./types";

type LogoRow = typeof logos.$inferSelect;
type LogoMediaRow = typeof logoMedia.$inferSelect;
type CreatorRow = Parameters<typeof mapAdminCreator>[0];

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function mapAdminLogo(
  row: LogoRow & { creator: CreatorRow; media: LogoMediaRow[] },
): AdminLogoRecord {
  const media = row.media[0];
  if (!media) throw new Error(`Logo ${row.id} has no media.`);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    kind: row.kind as AdminLogoRecord["kind"],
    creator: mapAdminCreator(row.creator),
    description: row.description,
    industry: row.industry,
    colors: row.colors,
    styles: row.styles,
    shape: row.shape,
    sourceUrl: row.sourceUrl,
    status: row.status as AdminLogoRecord["status"],
    publishedAt: row.publishedAt?.toISOString(),
    archivedAt: row.archivedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    media: {
      url: media.url,
      storageProvider: isStorageProvider(media.storageProvider)
        ? (media.storageProvider as AdminLogoRecord["media"]["storageProvider"])
        : undefined,
      storageKey: media.storageKey ?? undefined,
      mimeType: media.mimeType ?? undefined,
      sourceMimeType: media.sourceMimeType ?? undefined,
      sizeBytes: media.sizeBytes ?? undefined,
      variants: media.variants,
      alt: media.alt,
      width: media.width,
      height: media.height,
    },
  };
}

function logoValues(input: AdminLogoInput, creatorId: string) {
  return {
    slug: input.slug,
    title: input.title,
    kind: input.kind,
    creatorId,
    description: input.description,
    industry: input.industry,
    colors: input.colors,
    styles: input.styles,
    shape: input.shape,
    sourceUrl: input.sourceUrl,
    status: input.status,
  };
}

function mediaValues(logoId: string, input: AdminLogoInput) {
  return {
    logoId,
    url: input.media.url,
    storageProvider: input.media.storageProvider,
    storageKey: input.media.storageKey,
    mimeType: input.media.mimeType,
    sourceMimeType: input.media.sourceMimeType,
    sizeBytes: input.media.sizeBytes,
    variants: input.media.variants ?? [],
    alt: input.media.alt,
    width: input.media.width,
    height: input.media.height,
  };
}

function managedAssets(media: LogoMediaRow[]): ManagedMediaAsset[] {
  return media.flatMap((item) =>
    isStorageProvider(item.storageProvider) && item.storageKey
      ? [
          {
            storageProvider:
              item.storageProvider as ManagedMediaAsset["storageProvider"],
            storageKey: item.storageKey,
            type: "image" as const,
            variantStorageKeys: item.variants.map((variant) => variant.storageKey),
          },
        ]
      : [],
  );
}

export async function getAdminLogos() {
  const database = requireDatabase();
  const rows = await database.query.logos.findMany({
    orderBy: [desc(logos.createdAt), desc(logos.id)],
    with: {
      creator: true,
      media: { orderBy: [asc(logoMedia.createdAt)] },
    },
  });

  return rows.map(mapAdminLogo);
}

export async function getAdminLogoById(id: string) {
  const database = requireDatabase();
  const row = await database.query.logos.findFirst({
    where: eq(logos.id, id),
    with: {
      creator: true,
      media: { orderBy: [asc(logoMedia.createdAt)] },
    },
  });

  return row ? mapAdminLogo(row) : null;
}

export async function createAdminLogo(input: AdminLogoInput, actorId: string) {
  const database = requireDatabase();
  const now = new Date();
  const id = randomUUID();
  const creator = await resolveCreatorMutation(database, input.creator);

  await database.batch([
    creator.mutation,
    database.insert(logos).values({
      id,
      ...logoValues(input, creator.id),
      publishedAt: input.status === "published" ? now : null,
      archivedAt: null,
      createdBy: actorId,
      updatedBy: actorId,
    }),
    database.insert(logoMedia).values(mediaValues(id, input)),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "logo.created",
      resourceType: "logo",
      resourceId: id,
      details: { slug: input.slug, kind: input.kind, status: input.status },
    }),
  ]);

  return { id, slug: input.slug, removedManagedMedia: creator.removedManagedMedia };
}

export async function updateAdminLogo(
  id: string,
  input: AdminLogoInput,
  actorId: string,
) {
  const database = requireDatabase();
  const existing = await database.query.logos.findFirst({
    where: eq(logos.id, id),
    with: { creator: true, media: true },
  });
  if (!existing) throw new Error("Logo not found.");

  const now = new Date();
  const creator = await resolveCreatorMutation(database, input.creator);
  const publishedAt =
    input.status === "published" ? (existing.publishedAt ?? now) : null;
  const removedManagedMedia = managedAssets(existing.media).filter(
    (asset) => asset.storageKey !== input.media.storageKey,
  );

  await database.batch([
    creator.mutation,
    database
      .update(logos)
      .set({
        ...logoValues(input, creator.id),
        publishedAt,
        archivedAt: null,
        updatedBy: actorId,
        updatedAt: now,
      })
      .where(eq(logos.id, id)),
    database.delete(logoMedia).where(eq(logoMedia.logoId, id)),
    database.insert(logoMedia).values(mediaValues(id, input)),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "logo.updated",
      resourceType: "logo",
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

export async function archiveAdminLogo(id: string, actorId: string) {
  const database = requireDatabase();
  const now = new Date();
  const existing = await database.query.logos.findFirst({
    where: and(eq(logos.id, id), ne(logos.status, "archived")),
    columns: { id: true, slug: true },
  });
  if (!existing) throw new Error("Only active logos can be archived.");

  await database.batch([
    database
      .update(logos)
      .set({
        status: "archived",
        archivedAt: now,
        updatedAt: now,
        updatedBy: actorId,
      })
      .where(and(eq(logos.id, id), ne(logos.status, "archived"))),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "logo.archived",
      resourceType: "logo",
      resourceId: id,
      details: { slug: existing.slug },
    }),
  ]);

  return existing;
}

export async function deleteArchivedLogo(id: string, actorId: string) {
  const database = requireDatabase();
  const existing = await database.query.logos.findFirst({
    where: and(eq(logos.id, id), eq(logos.status, "archived")),
    with: { media: true },
  });
  if (!existing) throw new Error("Archive the logo before deleting it permanently.");

  const removedManagedMedia = managedAssets(existing.media);
  await database.batch([
    database
      .delete(logos)
      .where(and(eq(logos.id, id), eq(logos.status, "archived"))),
    database.insert(adminAuditLogs).values({
      actorId,
      action: "logo.deleted",
      resourceType: "logo",
      resourceId: id,
      details: { slug: existing.slug },
    }),
  ]);

  return { id: existing.id, slug: existing.slug, removedManagedMedia };
}
