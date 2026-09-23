import "server-only";

import type { creators } from "@/db/schema";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";
import type {
  AdminCreatorAttribution,
  AdminCreatorRecord,
  CreatorRecordOrigin,
  CreatorSummary,
  PublicCreatorProfile,
} from "../types";
import { creatorUsernameCandidates } from "../validation";

type CreatorRow = typeof creators.$inferSelect;
type PublicCreatorSource = Pick<CreatorRow,
  "id" | "name" | "username" | "avatarUrl" | "avatarStorageProvider" | "url" | "xProfileUrl"
>;

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function mapCreatorDisplayFields(row: PublicCreatorSource): Omit<CreatorSummary, "username"> {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatarUrl,
    avatarStorageProvider: isStorageProvider(row.avatarStorageProvider)
      ? (row.avatarStorageProvider as NonNullable<CreatorSummary["avatarStorageProvider"]>)
      : undefined,
    websiteUrl: row.url,
    xProfileUrl: row.xProfileUrl,
  };
}

export function mapCreatorSummary(row: CreatorRow): CreatorSummary {
  return {
    ...mapCreatorDisplayFields(row),
    username:
      row.username ?? creatorUsernameCandidates(row.handle ?? row.name)[0] ?? "creator",
  };
}

export function mapPublicCreatorProfile(row: PublicCreatorSource): PublicCreatorProfile {
  if (!row.username) throw new Error("Creator profile has no public username.");
  return {
    ...mapCreatorDisplayFields(row),
    username: row.username as PublicCreatorProfile["username"],
  };
}

export function mapAdminCreatorAttribution(
  row: CreatorRow,
): AdminCreatorAttribution {
  return {
    id: row.id,
    name: row.name,
    legacyHandle: row.handle ?? undefined,
    username: row.username ?? undefined,
    url: row.url ?? undefined,
    xProfileUrl: row.xProfileUrl ?? undefined,
    xProviderId: row.xProviderId ?? undefined,
    ownerUserId: row.ownerUserId ?? undefined,
    editedFields: row.editedFields as AdminCreatorAttribution["editedFields"],
    recordOrigin: row.recordOrigin as CreatorRecordOrigin,
    avatarUrl: row.avatarUrl,
    avatarStorageProvider: isStorageProvider(row.avatarStorageProvider)
      ? (row.avatarStorageProvider as AdminCreatorAttribution["avatarStorageProvider"])
      : undefined,
    avatarStorageKey: row.avatarStorageKey ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapAdminCreatorRecord(
  row: CreatorRow,
  counts: { workCount: number; pendingClaimCount: number },
): AdminCreatorRecord {
  return {
    ...mapAdminCreatorAttribution(row),
    workCount: counts.workCount,
    pendingClaimCount: counts.pendingClaimCount,
  };
}
