import "server-only";

import { desc, eq } from "drizzle-orm";

import { requireDatabase } from "@/db/client";
import { adminAuditLogs, sponsors } from "@/db/schema";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";

import type {
  AdminSponsorInput,
  AdminSponsorRecord,
  ManagedMediaAsset,
} from "./types";

type SponsorRow = typeof sponsors.$inferSelect;

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function mapAdminSponsor(row: SponsorRow): AdminSponsorRecord {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    tagline: row.tagline ?? undefined,
    mediaType: row.mediaType as "image" | "video",
    mediaUrl: row.mediaUrl ?? undefined,
    mediaPosterUrl: row.mediaPosterUrl ?? undefined,
    mediaStorageProvider: isStorageProvider(row.mediaStorageProvider)
      ? (row.mediaStorageProvider as AdminSponsorRecord["mediaStorageProvider"])
      : undefined,
    mediaStorageKey: row.mediaStorageKey ?? undefined,
    mediaPosterStorageKey: row.mediaPosterStorageKey ?? undefined,
    mediaWidth: row.mediaWidth,
    mediaHeight: row.mediaHeight,
    mediaVariants: row.mediaVariants,
    mediaAlt: row.mediaAlt,
    iconUrl: row.iconUrl ?? undefined,
    iconStorageProvider: isStorageProvider(row.iconStorageProvider)
      ? (row.iconStorageProvider as AdminSponsorRecord["iconStorageProvider"])
      : undefined,
    iconStorageKey: row.iconStorageKey ?? undefined,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isMissingTableError(error: unknown): boolean {
  let current = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === "42P01") return true;
    if (current.message.includes('relation "sponsors" does not exist')) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function getAdminSponsor(): Promise<AdminSponsorRecord | null> {
  const database = requireDatabase();
  try {
    const rows = await database
      .select()
      .from(sponsors)
      .orderBy(desc(sponsors.createdAt))
      .limit(1);

    const row = rows[0];
    return row ? mapAdminSponsor(row) : null;
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function saveAdminSponsor(
  input: AdminSponsorInput,
  actorId: string,
) {
  const database = requireDatabase();
  const existing = await getAdminSponsor();
  const removedManagedMedia: ManagedMediaAsset[] = [];

  const values = {
    title: input.title,
    url: input.url,
    tagline: input.tagline ?? null,
    mediaType: input.mediaType || "image",
    mediaUrl: input.mediaUrl ?? null,
    mediaPosterUrl: input.mediaPosterUrl ?? null,
    mediaStorageProvider: input.mediaStorageProvider ?? null,
    mediaStorageKey: input.mediaStorageKey ?? null,
    mediaPosterStorageKey: input.mediaPosterStorageKey ?? null,
    mediaWidth: input.mediaWidth,
    mediaHeight: input.mediaHeight,
    mediaVariants: input.mediaVariants ?? [],
    mediaAlt: input.mediaAlt,
    iconUrl: input.iconUrl ?? null,
    iconStorageProvider: input.iconStorageProvider ?? null,
    iconStorageKey: input.iconStorageKey ?? null,
    isActive: input.isActive,
    updatedBy: actorId,
  };

  if (existing) {
    // Check if media changed
    if (
      existing.mediaStorageKey &&
      existing.mediaStorageKey !== input.mediaStorageKey
    ) {
      removedManagedMedia.push({
        type: existing.mediaType,
        storageProvider: existing.mediaStorageProvider ?? "r2",
        storageKey: existing.mediaStorageKey,
        variantStorageKeys: existing.mediaVariants
          ?.map((v) => v.storageKey)
          .filter(Boolean) as string[],
        posterStorageKey: existing.mediaPosterStorageKey,
      });
    }

    // Check if icon changed
    if (
      existing.iconStorageKey &&
      existing.iconStorageKey !== input.iconStorageKey
    ) {
      removedManagedMedia.push({
        type: "image",
        storageProvider: existing.iconStorageProvider ?? "r2",
        storageKey: existing.iconStorageKey,
      });
    }

    const [updatedRow] = await database
      .update(sponsors)
      .set(values)
      .where(eq(sponsors.id, existing.id))
      .returning();

    await database.insert(adminAuditLogs).values({
      actorId,
      action: "sponsor.updated",
      resourceType: "sponsor",
      resourceId: existing.id,
      details: { title: input.title, isActive: input.isActive },
    });

    return {
      sponsor: mapAdminSponsor(updatedRow),
      removedManagedMedia,
    };
  }

  const [insertedRow] = await database
    .insert(sponsors)
    .values({
      ...values,
      createdBy: actorId,
    })
    .returning();

  await database.insert(adminAuditLogs).values({
    actorId,
    action: "sponsor.created",
    resourceType: "sponsor",
    resourceId: insertedRow.id,
    details: { title: input.title, isActive: input.isActive },
  });

  return {
    sponsor: mapAdminSponsor(insertedRow),
    removedManagedMedia,
  };
}

export async function setAdminSponsorActive(
  isActive: boolean,
  actorId: string,
) {
  const database = requireDatabase();
  const existing = await getAdminSponsor();
  if (!existing) return null;

  const [updatedRow] = await database
    .update(sponsors)
    .set({ isActive, updatedBy: actorId })
    .where(eq(sponsors.id, existing.id))
    .returning();

  await database.insert(adminAuditLogs).values({
    actorId,
    action: isActive ? "sponsor.activated" : "sponsor.deactivated",
    resourceType: "sponsor",
    resourceId: existing.id,
    details: { isActive },
  });

  return mapAdminSponsor(updatedRow);
}

export async function deleteAdminSponsor(actorId: string) {
  const database = requireDatabase();
  const existing = await getAdminSponsor();
  if (!existing) return [];

  const removedManagedMedia: ManagedMediaAsset[] = [];
  if (existing.mediaStorageKey) {
    removedManagedMedia.push({
      type: existing.mediaType,
      storageProvider: existing.mediaStorageProvider ?? "r2",
      storageKey: existing.mediaStorageKey,
      variantStorageKeys: existing.mediaVariants
        ?.map((v) => v.storageKey)
        .filter(Boolean) as string[],
      posterStorageKey: existing.mediaPosterStorageKey,
    });
  }
  if (existing.iconStorageKey) {
    removedManagedMedia.push({
      type: "image",
      storageProvider: existing.iconStorageProvider ?? "r2",
      storageKey: existing.iconStorageKey,
    });
  }

  await database.delete(sponsors).where(eq(sponsors.id, existing.id));

  await database.insert(adminAuditLogs).values({
    actorId,
    action: "sponsor.deleted",
    resourceType: "sponsor",
    resourceId: existing.id,
    details: { title: existing.title },
  });

  return removedManagedMedia;
}
