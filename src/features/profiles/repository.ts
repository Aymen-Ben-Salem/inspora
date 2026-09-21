import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDatabase } from "@/db/client";
import {
  creatorUsernameAliases,
  creators,
  logoMedia,
  logos,
  profileAccounts,
  websiteMedia,
  websiteSections,
  websites,
} from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { mapPublishedLogo } from "@/data/logos-repository";
import { getPostCardsByIds } from "@/data/posts-repository";
import { completeWebsiteRecordingPredicate, hasCompleteRecording, mapPublishedWebsite } from "@/data/websites-repository";
import { isPostCategory, POST_CATEGORIES } from "@/domain/post";
import type { WorkCardData } from "@/domain/work-card";
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

type WorkCountRow = {
  filter: string;
  count: number | string;
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

function kindRank(kind: CreatorWorkCandidate["kind"]) {
  return { post: 4, website: 3, logo: 2, icon: 1 }[kind];
}

export function sortCreatorWorkCandidates<T extends CreatorWorkCandidate>(
  candidates: T[],
) {
  return [...candidates].sort((left, right) => {
    const byDate = right.publishedAt.localeCompare(left.publishedAt);
    if (byDate !== 0) return byDate;
    const byKind = kindRank(right.kind) - kindRank(left.kind);
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

function isCandidateKind(value: unknown): value is CreatorWorkCandidate["kind"] {
  return value === "post" || value === "website" || value === "logo" || value === "icon";
}

export function encodeCreatorWorkCursor(cursor: CreatorWorkCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCreatorWorkCursor(
  value: string,
  query: Pick<CreatorWorkQuery, "creatorId" | "filter">,
): CreatorWorkCursor | null {
  try {
    const candidate: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!candidate || typeof candidate !== "object") return null;
    const row = candidate as Record<string, unknown>;
    if (
      row.creatorId !== query.creatorId ||
      row.filter !== query.filter ||
      !isCreatorWorkFilter(row.filter) ||
      typeof row.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(row.id) ||
      typeof row.publishedAt !== "string" ||
      Number.isNaN(Date.parse(row.publishedAt)) ||
      !isCandidateKind(row.kind)
    ) {
      return null;
    }
    return {
      creatorId: row.creatorId as string,
      filter: row.filter,
      id: row.id,
      publishedAt: row.publishedAt,
      kind: row.kind,
      category: typeof row.category === "string" ? row.category : undefined,
    };
  } catch {
    return null;
  }
}

function toIsoString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  throw new Error("Published creator work has an invalid date.");
}

function asWorkCandidates(rows: unknown): CreatorWorkCandidate[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || !isCandidateKind(row.kind)) {
      throw new Error("Published creator work has an invalid identity.");
    }
    return {
      id: row.id,
      kind: row.kind,
      publishedAt: toIsoString(row.publishedAt ?? row.published_at),
      category:
        typeof row.category === "string" ? row.category : undefined,
    };
  });
}

export async function getPublishedCreatorWorkPage(
  input: CreatorWorkQuery,
): Promise<CreatorWorkPage> {
  "use cache";
  applyPublicProfileCache();
  const cursor = input.cursor
    ? decodeCreatorWorkCursor(input.cursor, input)
    : null;
  if (input.cursor && !cursor) throw new Error("Invalid creator-work cursor.");

  const database = getDatabase();
  if (!database) return { items: [], nextCursor: null };
  const now = new Date();
  const cursorWhere = cursor
    ? sql`and (
        published_at < ${new Date(cursor.publishedAt)}
        or (published_at = ${new Date(cursor.publishedAt)} and kind_rank < ${kindRank(cursor.kind)})
        or (published_at = ${new Date(cursor.publishedAt)} and kind_rank = ${kindRank(cursor.kind)} and id < ${cursor.id}::uuid)
      )`
    : sql``;
  const rows = await database.execute(sql`
    with creator_work as (
      select ${sql.raw("'post'")} as kind, 4 as kind_rank, ${sql.raw('"posts"."id"')} as id,
        ${sql.raw('"posts"."published_at"')} as published_at, ${sql.raw('"posts"."category"')} as category
      from ${sql.raw('"posts"')}
      where ${sql.raw('"posts"."creator_id"')} = ${input.creatorId}::uuid
        and ${sql.raw('"posts"."status"')} = 'published'
        and ${sql.raw('"posts"."published_at"')} <= ${now}
        and ${input.filter === "all" || isPostCategory(input.filter)}
        and (${input.filter === "all"} or ${sql.raw('"posts"."category"')} = ${input.filter})
      union all
      select ${sql.raw("'website'")} as kind, 3 as kind_rank, ${sql.raw('"websites"."id"')} as id,
        ${sql.raw('"websites"."published_at"')} as published_at, null as category
      from ${sql.raw('"websites"')}
      where ${sql.raw('"websites"."creator_id"')} = ${input.creatorId}::uuid
        and ${sql.raw('"websites"."status"')} = 'published'
        and ${sql.raw('"websites"."published_at"')} <= ${now}
        and (${completeWebsiteRecordingPredicate()})
        and ${input.filter === "all" || input.filter === "websites"}
      union all
      select case when ${sql.raw('"logos"."kind"')} = 'icon' then 'icon' else 'logo' end as kind,
        case when ${sql.raw('"logos"."kind"')} = 'icon' then 1 else 2 end as kind_rank,
        ${sql.raw('"logos"."id"')} as id, ${sql.raw('"logos"."published_at"')} as published_at, null as category
      from ${sql.raw('"logos"')}
      where ${sql.raw('"logos"."creator_id"')} = ${input.creatorId}::uuid
        and ${sql.raw('"logos"."status"')} = 'published'
        and ${sql.raw('"logos"."published_at"')} <= ${now}
        and ${input.filter === "all" || input.filter === "logos" || input.filter === "app-icons"}
        and (${input.filter === "all"}
          or (${input.filter === "logos"} and ${sql.raw('"logos"."kind"')} = 'logo')
          or (${input.filter === "app-icons"} and ${sql.raw('"logos"."kind"')} = 'icon'))
    )
    select kind, kind_rank, id, published_at, category
    from creator_work
    where true ${cursorWhere}
    order by published_at desc, kind_rank desc, id desc
    limit ${CREATOR_WORK_PAGE_SIZE + 1}
  `);
  const candidates = asWorkCandidates(rows.rows);
  const pageCandidates = candidates.slice(0, CREATOR_WORK_PAGE_SIZE);
  const postIds = pageCandidates.filter((item) => item.kind === "post").map((item) => item.id);
  const logoIds = pageCandidates.filter((item) => item.kind === "logo" || item.kind === "icon").map((item) => item.id);
  const websiteIds = pageCandidates.filter((item) => item.kind === "website").map((item) => item.id);
  const [postCards, logoRows, websiteRows] = await Promise.all([
    getPostCardsByIds(postIds),
    logoIds.length
      ? database.query.logos.findMany({
          where: inArray(logos.id, logoIds),
          with: { creator: true, media: { orderBy: [asc(logoMedia.createdAt)], limit: 1 } },
        })
      : [],
    websiteIds.length
      ? database.query.websites.findMany({
          where: inArray(websites.id, websiteIds),
          with: {
            creator: true,
            media: { orderBy: [asc(websiteMedia.createdAt)] },
            sections: { orderBy: [asc(websiteSections.position)] },
          },
        })
      : [],
  ]);
  const postsById = new Map(postCards.map((item) => [item.id, item]));
  const logosById = new Map(logoRows.map((item) => [item.id, mapPublishedLogo(item)]));
  const websitesById = new Map(websiteRows.filter(hasCompleteRecording).map((item) => [item.id, mapPublishedWebsite(item)]));
  const items = pageCandidates.flatMap((candidate): WorkCardData[] => {
    if (candidate.kind === "post") {
      const item = postsById.get(candidate.id);
      const category = candidate.category;
      return item && category && isPostCategory(category)
        ? [{ ...item, category }]
        : [];
    }
    if (candidate.kind === "website") {
      const website = websitesById.get(candidate.id);
      return website
        ? [{ id: website.id, category: "Websites" as const, kind: "website" as const, website }]
        : [];
    }
    const logo = logosById.get(candidate.id);
    return logo
      ? [{ id: logo.id, category: "Logos" as const, kind: "logo" as const, logo }]
      : [];
  });
  const finalCandidate = pageCandidates.at(-1);
  return {
    items,
    nextCursor:
      candidates.length > CREATOR_WORK_PAGE_SIZE && finalCandidate
        ? encodeCreatorWorkCursor({ ...finalCandidate, creatorId: input.creatorId, filter: input.filter })
        : null,
  };
}

export async function getPublishedCreatorWorkCounts(
  creatorId: string,
): Promise<ProfileWorkCounts> {
  "use cache";
  applyPublicProfileCache();

  const database = getDatabase();
  if (!database) return { total: 0, filters: {} };
  const now = new Date();
  const rows = await database.execute(sql`
    select filter, count(*)::int as count from (
      select ${sql.raw('"posts"."category"')} as filter
      from ${sql.raw('"posts"')}
      where ${sql.raw('"posts"."creator_id"')} = ${creatorId}::uuid
        and ${sql.raw('"posts"."status"')} = 'published'
        and ${sql.raw('"posts"."published_at"')} <= ${now}
      union all
      select 'websites' as filter from ${sql.raw('"websites"')}
      where ${sql.raw('"websites"."creator_id"')} = ${creatorId}::uuid
        and ${sql.raw('"websites"."status"')} = 'published'
        and ${sql.raw('"websites"."published_at"')} <= ${now}
        and (${completeWebsiteRecordingPredicate()})
      union all
      select case when ${sql.raw('"logos"."kind"')} = 'icon' then 'app-icons' else 'logos' end as filter
      from ${sql.raw('"logos"')}
      where ${sql.raw('"logos"."creator_id"')} = ${creatorId}::uuid
        and ${sql.raw('"logos"."status"')} = 'published'
        and ${sql.raw('"logos"."published_at"')} <= ${now}
    ) published_work
    group by filter
  `);
  const filters: ProfileWorkCounts["filters"] = {};
  let total = 0;
  for (const row of rows.rows as WorkCountRow[]) {
    if (!isCreatorWorkFilter(row.filter) || row.filter === "all") continue;
    const count = Number(row.count);
    filters[row.filter] = count;
    total += count;
  }
  return { total, filters };
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
