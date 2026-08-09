import "server-only";

import { deleteCloudinaryMediaAssets } from "./cloudinary";
import { deleteR2MediaAssets } from "./r2";
import type { ManagedMediaAsset } from "./types";

export async function deleteManagedMediaAssets(assets: ManagedMediaAsset[]) {
  if (assets.length === 0) return;

  const results = await Promise.allSettled([
    deleteCloudinaryMediaAssets(assets),
    deleteR2MediaAssets(assets),
  ]);
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failures.length) {
    throw new AggregateError(failures, "Some managed media assets could not be deleted.");
  }
}

export async function deleteManagedMediaAssetsSafely(assets: ManagedMediaAsset[]) {
  try {
    await deleteManagedMediaAssets(assets);
  } catch (error) {
    console.error("Managed media cleanup failed", error);
  }
}
