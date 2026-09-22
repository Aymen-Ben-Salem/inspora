import "server-only";


import { getDatabase } from "@/db/client";
import { readWorkPage, readWorkCounts } from "@/data/public-work";
import { creatorKindRank, decodeCreatorCursor, encodeCreatorCursor } from "@/data/public-work/creator";
import { isPostCategory, POST_CATEGORIES } from "@/domain/post";

import type {
  CreatorWorkFilter,
  CreatorWorkPage,
  CreatorWorkQuery,
  ProfileWorkCounts,
} from "./types";
// Compatibility for public profile page callers; identity decisions live in creators.
export {
  resolvePublicCreatorProfile,
  ProfileMutationError,
  updateOwnedCreatorProfile,
  updateOwnedCreatorAvatar,
} from "@/features/creators/identity";

export const CREATOR_WORK_PAGE_SIZE = 16;
export { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "./cache";

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
