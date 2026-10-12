import "server-only";
import { inArray, sql } from "drizzle-orm";
import { creators, logoMedia, postMedia, submissionPublicationAttempts, websiteMedia, websiteSections } from "../../db/schema";
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
  const assets = media.flatMap((item): ManagedMediaAsset[] => [
    ...(item.storageProvider === "r2" && item.storageKey ? [item.storageKey] : []),
    ...(item.variants?.map(variant => variant.storageKey) ?? []),
    ...(item.videoPreview?.storageKey ? [item.videoPreview.storageKey] : []),
    ...(item.posterStorageKey ? [item.posterStorageKey] : []),
  ].map(storageKey => ({ storageProvider: "r2", storageKey, type: "image" })));
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

// All retained references count, including drafts and prepared publication attempts.
// Call after locking candidate keys so an editorial write cannot race deletion.
export async function readPublicMediaReferenceKeys(database: WriteTx) {
  const [posts, logos, websiteAssets, sections, avatars, attachedAttempts] = await Promise.all([
    database.select({ storageKey: postMedia.storageKey, variants: postMedia.variants, videoPreview: postMedia.videoPreview, posterStorageKey: postMedia.posterStorageKey }).from(postMedia),
    database.select({ storageKey: logoMedia.storageKey, variants: logoMedia.variants }).from(logoMedia),
    database.select({ storageKey: websiteMedia.storageKey, variants: websiteMedia.variants, videoPreview: websiteMedia.videoPreview, posterStorageKey: websiteMedia.posterStorageKey }).from(websiteMedia),
    database.select({ storageKey: websiteSections.imageStorageKey, variants: websiteSections.imageVariants }).from(websiteSections),
    database.select({ storageKey: creators.avatarStorageKey }).from(creators),
    database.select({ assets: submissionPublicationAttempts.assets }).from(submissionPublicationAttempts).where(inArray(submissionPublicationAttempts.status, ["prepared", "attached"])),
  ]);
  const keys = new Set<string>();
  const media: { storageKey: string | null; variants: { storageKey: string }[]; videoPreview?: { storageKey: string } | null; posterStorageKey?: string | null }[] = [...posts, ...logos, ...websiteAssets, ...sections];
  for (const row of media) {
    if (row.storageKey) keys.add(row.storageKey);
    for (const variant of row.variants) keys.add(variant.storageKey);
    if (row.videoPreview?.storageKey) keys.add(row.videoPreview.storageKey);
    if (row.posterStorageKey) keys.add(row.posterStorageKey);
  }
  for (const avatar of avatars) if (avatar.storageKey) keys.add(avatar.storageKey);
  for (const attempt of attachedAttempts) for (const key of publicationAssetKeys(attempt.assets)) keys.add(key);
  return keys;
}
