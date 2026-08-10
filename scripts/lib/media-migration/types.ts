import type { ImageVariant } from "../../../src/storage/types";

export type MigrationResourceType = "post_media" | "creator_avatar";
export type MigrationStatus =
  | "uploaded"
  | "migrated"
  | "failed"
  | "rolled_back"
  | "source_deleted";

export type PostMediaSnapshot = {
  kind: "post_media";
  id: string;
  type: "image" | "video";
  url: string;
  posterUrl: string | null;
  storageProvider: "cloudinary" | "r2" | null;
  storageKey: string | null;
  mimeType: string | null;
  sourceMimeType: string | null;
  sizeBytes: number | null;
  variants: ImageVariant[];
  posterStorageKey: string | null;
  alt: string;
  width: number;
  height: number;
};

export type CreatorAvatarSnapshot = {
  kind: "creator_avatar";
  id: string;
  avatarUrl: string;
  avatarStorageProvider: "cloudinary" | "r2" | null;
  avatarStorageKey: string | null;
};

export type SourceSnapshot = PostMediaSnapshot | CreatorAvatarSnapshot;
export type TargetSnapshot = PostMediaSnapshot | CreatorAvatarSnapshot;

export type MigrationAudit = {
  id: string;
  resourceType: MigrationResourceType;
  resourceId: string;
  status: MigrationStatus;
  sourceProvider: "cloudinary";
  sourceSnapshot: SourceSnapshot;
  targetSnapshot: TargetSnapshot | null;
  error: string | null;
  migratedAt: Date | null;
  rolledBackAt: Date | null;
  sourceDeletedAt: Date | null;
};

export type CloudinarySource = {
  publicId: string;
  resourceType: "image" | "video";
  format: string;
  mimeType: string;
  secureUrl: string;
  width: number;
  height: number;
  bytes: number;
};

export type PreparedObject = {
  storageKey: string;
  body: Buffer;
  contentType: string;
};

export type PreparedMigration = {
  target: TargetSnapshot;
  objects: PreparedObject[];
};

export function targetStorageKeys(snapshot: TargetSnapshot) {
  if (snapshot.kind === "creator_avatar") {
    return snapshot.avatarStorageKey ? [snapshot.avatarStorageKey] : [];
  }

  return [
    snapshot.storageKey,
    ...snapshot.variants.map((variant) => variant.storageKey),
    snapshot.posterStorageKey,
  ].filter((value): value is string => Boolean(value));
}
