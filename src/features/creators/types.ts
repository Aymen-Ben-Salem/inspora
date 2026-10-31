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

export type CreatorClaimPreview = {
  profile: CreatorSummary;
  resultingProfile?: CreatorSummary;
  currentProfile?: CreatorSummary;
  xSuggestion?: { name?: string; username: string };
  xSuggestionUnavailable?: boolean;
  workCount: number;
  combinedWorkCount: number;
  merging: boolean;
  thumbnails: { url: string; title: string }[];
};

export type ClaimResult =
  | { status: "pending"; claimId: string }
  | { status: "claimed" | "already_owned"; creatorId: string }
  | { status: "no_match" | "conflict" | "rejected" | "withdrawn" | "resolved"; message?: string };

export type CreatorClaimMethod = "x" | "manual" | "ownership_report";
export type CreatorClaimStatus = "pending" | "approved" | "rejected" | "withdrawn" | "resolved";
export type ClaimActionState = { status: "idle" | "success" | "error"; message?: string; claimedCreatorId?: string;
  fieldErrors?: { name?: string; username?: string }; submittedProfile?: { name: string; username: string } };
export type ClaimUsernameAvailability = { status: "available" | "unavailable" | "error"; message: string };
export type OwnCreatorClaim = {
  id: string;
  targetCreatorId: string;
  targetName: string;
  targetUsername: string | null;
  method: CreatorClaimMethod;
  status: CreatorClaimStatus;
  attentionReason: string | null;
  reviewReason: string | null;
  createdAt: string;
  dismissedAt: string | null;
};

export type AdminCreatorInput = {
  id?: string;
  name: string;
  legacyHandle?: string;
  username?: string;
  url?: string;
  xProfileUrl?: string;
  avatarUrl: string;
  avatarStorageProvider?: MediaStorageProvider;
  avatarStorageKey?: string;
  recordOrigin?: CreatorRecordOrigin;
};

export type AdminCreatorAttribution = AdminCreatorInput & {
  id: string;
  ownerUserId?: string;
  xProviderId?: string;
  editedFields: CreatorEditedField[];
  recordOrigin: CreatorRecordOrigin;
  createdAt: string;
  updatedAt: string;
};

export type AdminCreatorRecord = AdminCreatorAttribution & {
  trashedAt?: string;
  workCount: number;
  pendingClaimCount: number;
};

export type AdminCreatorClaimRecord = {
  id: string;
  requesterUserId: string;
  targetCreatorId: string;
  targetCreatorName: string;
  verifiedXUsername: string | null;
  method: CreatorClaimMethod;
  status: CreatorClaimStatus;
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

export type AdminCreatorMutationCode =
  | "invalid_input"
  | "environment_restricted"
  | "missing_creator"
  | "conflict"
  | "database_unavailable";
