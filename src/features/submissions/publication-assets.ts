import "server-only";
import { inArray, sql } from "drizzle-orm";
import { creators, logoMedia, postMedia, submissionPublicationAttempts, websiteMedia, websiteSections } from "../../db/schema";
import type { WriteTx } from "../../db/write-client";
import type { ManagedMediaAsset } from "../../storage/types";
import { assertR2StorageKeysExist } from "../../storage/r2";

type ManagedMediaInput = {
  url?: string;
  storageProvider?: string; storageKey?: string;
  variants?: { storageKey: string; url?: string }[];
  videoPreview?: { storageKey: string; url?: string };
  posterUrl?: string;
  posterStorageKey?: string;
};

function keyFromPublicUrl(value?: string) {
  if (!value || !process.env.R2_PUBLIC_BASE_URL) return undefined;
  try {
    const base = new URL(process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "") + "/");
    const url = new URL(value);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return undefined;
    return decodeURIComponent(url.pathname.slice(base.pathname.length)) || undefined;
  } catch { return undefined; }
}

// Ordinary admin writes can reuse managed media too. They join the same lock
// protocol so a cleanup cannot race a new reference outside submission review.
export async function protectPublicationMedia(tx: WriteTx, media: ManagedMediaInput[]) {
  const assets = media.flatMap((item): ManagedMediaAsset[] => [
    ...(item.storageProvider === "r2" && item.storageKey ? [item.storageKey] : []),
    ...(item.variants?.map(variant => variant.storageKey) ?? []),
    ...(item.videoPreview?.storageKey ? [item.videoPreview.storageKey] : []),
    ...(item.posterStorageKey ? [item.posterStorageKey] : []),
    ...[item.url, item.posterUrl, item.videoPreview?.url, ...(item.variants?.map(variant => variant.url) ?? [])].flatMap(url => { const key = keyFromPublicUrl(url); return key ? [key] : []; }),
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
export async function readPublicMediaReferenceKeys(database: WriteTx, keyForUrl: (url: string) => string | undefined = keyFromPublicUrl) {
  const [posts, logos, websiteAssets, sections, avatars, attachedAttempts] = await Promise.all([
    database.select({ url: postMedia.url, posterUrl: postMedia.posterUrl, storageKey: postMedia.storageKey, variants: postMedia.variants, videoPreview: postMedia.videoPreview, posterStorageKey: postMedia.posterStorageKey }).from(postMedia),
    database.select({ url: logoMedia.url, storageKey: logoMedia.storageKey, variants: logoMedia.variants }).from(logoMedia),
    database.select({ url: websiteMedia.url, posterUrl: websiteMedia.posterUrl, storageKey: websiteMedia.storageKey, variants: websiteMedia.variants, videoPreview: websiteMedia.videoPreview, posterStorageKey: websiteMedia.posterStorageKey }).from(websiteMedia),
    database.select({ url: websiteSections.imageUrl, storageKey: websiteSections.imageStorageKey, variants: websiteSections.imageVariants }).from(websiteSections),
    database.select({ url: creators.avatarUrl, storageKey: creators.avatarStorageKey }).from(creators),
    database.select({ assets: submissionPublicationAttempts.assets }).from(submissionPublicationAttempts).where(inArray(submissionPublicationAttempts.status, ["prepared", "attached"])),
  ]);
  const keys = new Set<string>();
  const addUrl = (url?: string | null) => { const key = url && keyForUrl?.(url); if (key) keys.add(key); };
  const media: { url: string | null; posterUrl?: string | null; storageKey: string | null; variants: { storageKey: string; url?: string }[]; videoPreview?: { storageKey: string; url?: string } | null; posterStorageKey?: string | null }[] = [...posts, ...logos, ...websiteAssets, ...sections];
  for (const row of media) {
    if (row.storageKey) keys.add(row.storageKey);
    for (const variant of row.variants) keys.add(variant.storageKey);
    if (row.videoPreview?.storageKey) keys.add(row.videoPreview.storageKey);
    if (row.posterStorageKey) keys.add(row.posterStorageKey);
    addUrl(row.url); addUrl(row.posterUrl); addUrl(row.videoPreview?.url);
    for (const variant of row.variants) addUrl(variant.url);
  }
  for (const avatar of avatars) { if (avatar.storageKey) keys.add(avatar.storageKey); addUrl(avatar.url); }
  for (const attempt of attachedAttempts) for (const key of publicationAssetKeys(attempt.assets)) keys.add(key);
  return keys;
}
