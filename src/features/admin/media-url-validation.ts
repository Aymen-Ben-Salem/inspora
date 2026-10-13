import { z } from "zod";

import { isLocalAssetPath, isLocalOrHttpsAssetUrl } from "../../lib/asset-url";

export const MANAGED_ASSET_URL_ERROR =
  "Use a local path or an https URL from the configured media hostname.";

export function isAllowedManagedAssetUrl(value: string) {
  if (isLocalAssetPath(value)) return true;

  try {
    const url = new URL(value);
    let r2Hostname: string | undefined;
    try {
      r2Hostname = process.env.R2_PUBLIC_BASE_URL
        ? new URL(process.env.R2_PUBLIC_BASE_URL).hostname
        : undefined;
    } catch {}
    const allowedHostnames = new Set(
      ["images.unsplash.com", process.env.MEDIA_HOSTNAME, r2Hostname].filter(Boolean),
    );
    return url.protocol === "https:" && allowedHostnames.has(url.hostname);
  } catch {
    return false;
  }
}

// Pasted images have no storage ownership metadata; they remain at their source.
export const imageUrlSchema = z.string().trim().refine(
  isLocalOrHttpsAssetUrl,
  "Use a local path or an https URL.",
);

// Uploaded assets and generated derivatives still use our existing host rules.
export const managedAssetUrlSchema = z.string().trim().refine(
  isAllowedManagedAssetUrl,
  MANAGED_ASSET_URL_ERROR,
);
