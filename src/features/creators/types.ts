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

export type CreatorProfile = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  avatarStorageProvider?: MediaStorageProvider;
  websiteUrl: string | null;
  xProfileUrl: string | null;
};

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
