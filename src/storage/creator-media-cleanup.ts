import "server-only";
import { withWriteTransaction } from "@/db/write-client";
import { lockPublicationAssets, publicationAssetKeys, readPublicMediaReferenceKeys } from "@/features/submissions/publication-assets";
import { deleteR2StorageKeys, getR2PublicUrl } from "./r2";
import type { ManagedMediaAsset } from "./types";

// The caller keeps a durable cleanup job until this succeeds. Asset locks and
// reference checks prevent deleting files retained by another profile or work.
export async function deleteUnreferencedCreatorMedia(assets: ManagedMediaAsset[]) {
  const managed = assets.filter(asset => asset.storageProvider === "r2");
  if (!managed.length) return;
  await withWriteTransaction(async tx => {
    await lockPublicationAssets(tx, managed);
    const urlIdentity = (value: string) => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return value; } };
    const candidates = new Map(publicationAssetKeys(managed).map(key => [urlIdentity(getR2PublicUrl(key)), key]));
    // Older admin records can share a public URL without storage metadata.
    const referenced = await readPublicMediaReferenceKeys(tx, url => candidates.get(urlIdentity(url)));
    const keys = publicationAssetKeys(managed).filter(key => !referenced.has(key));
    for (let i = 0; i < keys.length; i += 1000) await deleteR2StorageKeys(keys.slice(i, i + 1000));
  });
}
