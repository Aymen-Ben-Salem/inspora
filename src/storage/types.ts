import type { MediaType } from "@/domain/post";

export const MEDIA_STORAGE_PROVIDERS = ["r2"] as const;

export type MediaStorageProvider = (typeof MEDIA_STORAGE_PROVIDERS)[number];

export type ImageVariant = {
  url: string;
  storageKey: string;
  width: number;
  height: number;
  bytes: number;
  format: "webp";
};

export type VideoPreview = {
  url: string;
  storageKey: string;
  width: number;
  height: number;
  bytes: number;
  format: "mp4";
};

export type ManagedMediaAsset = {
  storageProvider: MediaStorageProvider;
  storageKey: string;
  type: MediaType;
  variantStorageKeys?: string[];
  videoPreviewStorageKey?: string;
  posterStorageKey?: string;
};
