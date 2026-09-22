import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDatabase } from "@/db/client";
import {
  creatorUsernameAliases,
  creators,
  profileAccounts,
} from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { readWorkPage, readWorkCounts } from "@/data/public-work";
import { creatorKindRank, decodeCreatorCursor, encodeCreatorCursor } from "@/data/public-work/creator";
import { isPostCategory, POST_CATEGORIES } from "@/domain/post";
import type { CreatorEditedField, CreatorProfile } from "@/features/creators/types";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";

import type {
  CreatorWorkFilter,
  CreatorWorkPage,
  CreatorWorkQuery,
  ProfileWorkCounts,
  ResolvedCreatorProfile,
  ProfileEditInput,
} from "./types";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "./cache";

export const CREATOR_WORK_PAGE_SIZE = 16;
export { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "./cache";

const PUBLIC_PROFILE_CACHE_LIFE = {
  stale: 300,
  revalidate: 21600,
  expire: 604800,
} as const;

type PublicCreatorSource = {
  [key: string]: unknown;
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string;
  avatarStorageProvider: string | null;
  url: string | null;
  xProfileUrl: string | null;
};

export type CreatorWorkCandidate = {
  id: string;
  kind: "post" | "website" | "logo" | "icon";
  publishedAt: string;
  category?: string | null;
};

type CreatorWorkCursor = CreatorWorkCandidate & {
  creatorId: string;
  filter: CreatorWorkFilter;
};

function applyPublicProfileCache() {
  cacheLife(PUBLIC_PROFILE_CACHE_LIFE);
  cacheTag(PUBLIC_CREATOR_PROFILES_CACHE_TAG);
}

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

export function mapPublicCreatorProfile(row: PublicCreatorSource): CreatorProfile {
  if (!row.username) throw new Error("Creator profile has no public username.");
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    avatarUrl: row.avatarUrl,
    avatarStorageProvider: isStorageProvider(row.avatarStorageProvider)
      ? (row.avatarStorageProvider as NonNullable<CreatorProfile["avatarStorageProvider"]>)
      : undefined,
    websiteUrl: row.url,
    xProfileUrl: row.xProfileUrl,
  };
}

export async function resolvePublicCreatorProfile(
  username: string,
): Promise<ResolvedCreatorProfile | null> {
  "use cache";
  applyPublicProfileCache();

  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(normalized)) return null;

  const database = getDatabase();
  if (!database) return null;
  const alias = await database.query.creatorUsernameAliases.findFirst({
    columns: { username: true, isCurrent: true },
    where: eq(sql`lower(${creatorUsernameAliases.username})`, normalized),
    with: {
      creator: {
        columns: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          avatarStorageProvider: true,
          url: true,
          xProfileUrl: true,
        },
      },
    },
  });
  if (!alias?.creator?.username) return null;

  return {
    profile: mapPublicCreatorProfile(alias.creator),
    canonicalUsername: alias.creator.username,
    isAlias:
      !alias.isCurrent || alias.username.toLowerCase() !== alias.creator.username,
  };
}

export function sortCreatorWorkCandidates<T extends CreatorWorkCandidate>(
  candidates: T[],
) {
  return [...candidates].sort((left, right) => {
    const byDate = right.publishedAt.localeCompare(left.publishedAt);
    if (byDate !== 0) return byDate;
    const byKind = creatorKindRank(right.kind) - creatorKindRank(left.kind);
    return byKind !== 0 ? byKind : right.id.localeCompare(left.id);
  });
}

export function isCreatorWorkFilter(value: unknown): value is CreatorWorkFilter {
  return (
    value === "all" ||
    value === "websites" ||
    value === "logos" ||
    value === "app-icons" ||
    (typeof value === "string" && isPostCategory(value))
  );
}

export function encodeCreatorWorkCursor(cursor: CreatorWorkCursor) {
  return encodeCreatorCursor({ id: cursor.id, kind: cursor.kind, publishedAt: cursor.publishedAt }, {
    scope: { kind: "creator", creatorId: cursor.creatorId }, filters: { filter: cursor.filter },
  });
}

export function decodeCreatorWorkCursor(
  value: string,
  query: Pick<CreatorWorkQuery, "creatorId" | "filter">,
): CreatorWorkCursor | null {
  const keys = decodeCreatorCursor(value, {
    scope: { kind: "creator", creatorId: query.creatorId }, filters: { filter: query.filter },
  });
  return keys ? { ...keys, ...query } : null;
}

export async function getPublishedCreatorWorkPage(input: CreatorWorkQuery): Promise<CreatorWorkPage> {
  if (input.cursor && !decodeCreatorWorkCursor(input.cursor, input)) throw new Error("Invalid creator-work cursor.");
  if (!getDatabase()) return { items: [], nextCursor: null };
  return readWorkPage({
    scope: { kind: "creator", creatorId: input.creatorId },
    filters: { filter: input.filter }, order: "publication-desc", cursor: input.cursor,
  });
}

export async function getPublishedCreatorWorkCounts(creatorId: string): Promise<ProfileWorkCounts> {
  if (!getDatabase()) return { total: 0, filters: {} };
  return readWorkCounts({ scope: { kind: "creator", creatorId } });
}

export function availableCreatorWorkFilters(counts: ProfileWorkCounts) {
  return [
    ...POST_CATEGORIES,
    "websites" as const,
    "logos" as const,
    "app-icons" as const,
  ].filter((filter) => (counts.filters[filter] ?? 0) > 0);
}

export class ProfileMutationError extends Error {
  constructor(
    readonly field: "name" | "username" | "websiteUrl" | "form",
    message: string,
  ) {
    super(message);
    this.name = "ProfileMutationError";
  }
}

async function lockOwnedCreator(
  tx: Parameters<Parameters<typeof withWriteTransaction>[0]>[0],
  userId: string,
) {
  const [account] = await tx
    .select({ status: profileAccounts.status })
    .from(profileAccounts)
    .where(eq(profileAccounts.userId, userId))
    .for("update");
  if (!account || account.status !== "active") {
    throw new ProfileMutationError("form", "This account is not active.");
  }
  const [creator] = await tx
    .select()
    .from(creators)
    .where(eq(creators.ownerUserId, userId))
    .for("update");
  if (!creator) {
    throw new ProfileMutationError("form", "Your creator profile was not found.");
  }
  return creator;
}

export async function updateOwnedCreatorProfile(
  userId: string,
  input: ProfileEditInput,
) {
  return withWriteTransaction(async (tx) => {
    const creator = await lockOwnedCreator(tx, userId);
    const nextUsername = input.username ?? creator.username;
    if (!nextUsername) {
      throw new ProfileMutationError("username", "Choose a username.");
    }
    if (nextUsername !== creator.username) {
      const [reservation] = await tx
        .select({ creatorId: creatorUsernameAliases.creatorId })
        .from(creatorUsernameAliases)
        .where(eq(sql`lower(${creatorUsernameAliases.username})`, nextUsername))
        .limit(1);
      if (reservation && reservation.creatorId !== creator.id) {
        throw new ProfileMutationError("username", "That username is unavailable.");
      }
    }

    const editedFields = new Set(
      creator.editedFields as CreatorEditedField[],
    );
    if (input.name !== undefined) editedFields.add("name");
    if (input.username !== undefined) editedFields.add("username");
    if (input.websiteUrl !== undefined) editedFields.add("websiteUrl");
    const [updated] = await tx
      .update(creators)
      .set({
        name: input.name ?? creator.name,
        username: nextUsername,
        url:
          input.websiteUrl === undefined ? creator.url : input.websiteUrl,
        editedFields: [...editedFields],
        updatedAt: new Date(),
      })
      .where(and(eq(creators.id, creator.id), eq(creators.ownerUserId, userId)))
      .returning();
    if (!updated) throw new ProfileMutationError("form", "Your profile could not be saved.");

    if (nextUsername !== creator.username) {
      await tx
        .update(creatorUsernameAliases)
        .set({ isCurrent: false })
        .where(
          and(
            eq(creatorUsernameAliases.creatorId, creator.id),
            eq(creatorUsernameAliases.isCurrent, true),
          ),
        );
      await tx.insert(creatorUsernameAliases).values({
        creatorId: creator.id,
        username: nextUsername,
        isCurrent: true,
      });
    }
    return mapPublicCreatorProfile(updated);
  });
}

export async function updateOwnedCreatorAvatar(
  userId: string,
  avatar: { url: string; storageKey: string },
) {
  return withWriteTransaction(async (tx) => {
    const creator = await lockOwnedCreator(tx, userId);
    const editedFields = new Set(
      creator.editedFields as CreatorEditedField[],
    );
    editedFields.add("avatarUrl");
    const [updated] = await tx
      .update(creators)
      .set({
        avatarUrl: avatar.url,
        avatarStorageProvider: "r2",
        avatarStorageKey: avatar.storageKey,
        editedFields: [...editedFields],
        updatedAt: new Date(),
      })
      .where(and(eq(creators.id, creator.id), eq(creators.ownerUserId, userId)))
      .returning();
    if (!updated) throw new ProfileMutationError("form", "Your photo could not be saved.");
    return {
      profile: mapPublicCreatorProfile(updated),
      previousAsset:
        creator.avatarStorageProvider === "r2" && creator.avatarStorageKey
          ? {
              storageProvider: "r2" as const,
              storageKey: creator.avatarStorageKey,
              type: "image" as const,
            }
          : null,
    };
  });
}
