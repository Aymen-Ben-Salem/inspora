import type { MediaStorageProvider } from "@/storage/types";

export type CreatorRecordOrigin =
  | "mirrored"
  | "preview"
  | "development"
  | "editorial"
  | "user";

export type CreatorEditedField =
  | "name"
  | "username"
  | "avatarUrl"
  | "websiteUrl";

/** Display values only: a fallback username does not promise a public address. */
export type CreatorSummary = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  avatarStorageProvider?: MediaStorageProvider;
  websiteUrl: string | null;
  xProfileUrl: string | null;
};

/** A username returned only by alias-backed public lookup. */
declare const publicUsername: unique symbol;
export type PublicCreatorProfile = Omit<CreatorSummary, "username"> & {
  username: string & { readonly [publicUsername]: true };
};

export type ResolvedCreatorProfile = {
  profile: PublicCreatorProfile;
  canonicalUsername: string;
  isAlias: boolean;
};

/** Compatibility for owner forms and presentation components. */
export type CreatorProfile = CreatorSummary;

export type ClaimResult =
  | { status: "pending"; claimId: string }
  | { status: "claimed" | "already_owned"; creatorId: string }
  | { status: "no_match" | "conflict" | "rejected" };

export type AdminCreatorInput = {
  id?: string;
  name: string;
  handle?: string;
  username?: string;
  url?: string;
  xProfileUrl?: string;
  avatarUrl: string;
  avatarStorageProvider?: MediaStorageProvider;
  avatarStorageKey?: string;
  recordOrigin?: CreatorRecordOrigin;
};

export type AdminCreatorRecord = AdminCreatorInput & {
  id: string;
  ownerUserId?: string;
  xProviderId?: string;
  editedFields: CreatorEditedField[];
  recordOrigin: CreatorRecordOrigin;
  workCount: number;
  pendingClaimCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminCreatorClaimRecord = {
  id: string;
  requesterUserId: string;
  targetCreatorId: string;
  targetCreatorName: string;
  verifiedXUsername: string;
  status: "pending" | "approved" | "rejected";
  reviewReason?: string;
  createdAt: string;
  reviewedAt?: string;
};

export type CreatorProfileMutationCode =
  | "invalid_input"
  | "unavailable_username"
  | "missing_creator"
  | "inactive_account"
  | "ownership_conflict"
  | "database_unavailable";
