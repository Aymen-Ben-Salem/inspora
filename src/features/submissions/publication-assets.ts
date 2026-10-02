import "server-only";
import { sql } from "drizzle-orm";
import type { WriteTx } from "../../db/write-client";
import type { ManagedMediaAsset } from "../../storage/types";
import { assertR2StorageKeysExist } from "../../storage/r2";

type ManagedMediaInput = {
  storageProvider?: string; storageKey?: string;
  variants?: { storageKey: string }[];
  videoPreview?: { storageKey: string };
  posterStorageKey?: string;
};

// Ordinary admin writes can reuse managed media too. They join the same lock
// protocol so a cleanup cannot race a new reference outside submission review.
export async function protectPublicationMedia(tx: WriteTx, media: ManagedMediaInput[]) {
  const assets = media.flatMap((item): ManagedMediaAsset[] => item.storageProvider === "r2" && item.storageKey ? [{
    storageProvider: "r2", storageKey: item.storageKey, type: "image",
    variantStorageKeys: item.variants?.map(x => x.storageKey),
    videoPreviewStorageKey: item.videoPreview?.storageKey, posterStorageKey: item.posterStorageKey,
  }] : []);
  await lockPublicationAssets(tx, assets);
  await assertR2StorageKeysExist(publicationAssetKeys(assets));
}

export function publicationAssetKeys(assets: ManagedMediaAsset[]) {
  return [...new Set(assets.flatMap(asset => [asset.storageKey, ...(asset.variantStorageKeys ?? []), ...(asset.videoPreviewStorageKey ? [asset.videoPreviewStorageKey] : []), ...(asset.posterStorageKey ? [asset.posterStorageKey] : [])]))].sort();
}

// Publication and orphan deletion must agree before either changes references
// or deletes bytes. Sorted transaction locks also cover overlapping manifests.
export async function lockPublicationAssets(tx: WriteTx, assets: ManagedMediaAsset[]) {
  for (const key of publicationAssetKeys(assets)) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`submission-publication:${key}`}, 0))`);
  }
}
