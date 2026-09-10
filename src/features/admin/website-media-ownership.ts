import { MEDIA_STORAGE_PROVIDERS } from "../../storage/types";

import type { AdminWebsiteInput, ManagedMediaAsset } from "./types";

type StoredWebsiteMedia = {
  role: string;
  storageProvider: string | null;
  storageKey: string | null;
  variants: Array<{ storageKey: string }>;
  videoPreview: { storageKey: string } | null;
  posterStorageKey: string | null;
};

type StoredWebsiteSection = {
  imageStorageProvider: string | null;
  imageStorageKey: string | null;
  imageVariants: Array<{ storageKey: string }>;
};

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function managedKey(
  storageProvider: string | null,
  storageKey: string | null,
  type: "image" | "video",
) {
  return isStorageProvider(storageProvider) && storageKey
    ? [{
        storageProvider:
          storageProvider as ManagedMediaAsset["storageProvider"],
        storageKey,
        type,
      }]
    : [];
}

export function collectWebsiteManagedAssets(
  media: StoredWebsiteMedia[],
  sections: StoredWebsiteSection[],
) {
  return [
    ...media.flatMap((item): ManagedMediaAsset[] => [
      ...managedKey(
        item.storageProvider,
        item.storageKey,
        item.role === "recording" ? "video" : "image",
      ),
      ...item.variants.flatMap((variant) =>
        managedKey(item.storageProvider, variant.storageKey, "image"),
      ),
      ...managedKey(
        item.storageProvider,
        item.videoPreview?.storageKey ?? null,
        "video",
      ),
      ...managedKey(item.storageProvider, item.posterStorageKey, "image"),
    ]),
    ...sections.flatMap((section): ManagedMediaAsset[] => [
      ...managedKey(
        section.imageStorageProvider,
        section.imageStorageKey,
        "image",
      ),
      ...section.imageVariants.flatMap((variant) =>
        managedKey(
          section.imageStorageProvider,
          variant.storageKey,
          "image",
        ),
      ),
    ]),
  ];
}

export function getRetainedWebsiteStorageKeys(input: AdminWebsiteInput) {
  return new Set(
    [
      ...input.media.flatMap((media) => [
        media.storageKey,
        media.posterStorageKey,
        media.videoPreview?.storageKey,
        ...(media.variants ?? []).map((variant) => variant.storageKey),
      ]),
      ...input.sections.flatMap((section) => [
        section.storageKey,
        ...(section.variants ?? []).map((variant) => variant.storageKey),
      ]),
    ].filter((key): key is string => Boolean(key)),
  );
}
