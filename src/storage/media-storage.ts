import "server-only";

import { deleteR2MediaAssets } from "./r2";
import type { ManagedMediaAsset } from "./types";

export async function deleteManagedMediaAssets(assets: ManagedMediaAsset[]) {
  if (assets.length === 0) return;

  await deleteR2MediaAssets(assets);
}

export async function deleteManagedMediaAssetsSafely(assets: ManagedMediaAsset[]) {
  try {
    await deleteManagedMediaAssets(assets);
  } catch (error) {
    console.error("Managed media cleanup failed", error);
  }
}
