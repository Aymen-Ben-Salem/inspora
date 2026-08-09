import "server-only";

import { v2 as cloudinary } from "cloudinary";

import type { ManagedMediaAsset } from "@/storage/types";

const UPLOAD_FOLDERS = {
  "post-media": "inspora/posts",
  "creator-avatar": "inspora/creators",
} as const;

type UploadKind = keyof typeof UPLOAD_FOLDERS;

type CloudinaryConfiguration = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadPreset: string;
};

export class MediaStorageConfigurationError extends Error {
  constructor() {
    super("Cloudinary media storage is not configured.");
    this.name = "MediaStorageConfigurationError";
  }
}

function getConfiguration(): CloudinaryConfiguration | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !apiKey || !apiSecret || !uploadPreset) return null;

  return { cloudName, apiKey, apiSecret, uploadPreset };
}

function requireConfiguration() {
  const configuration = getConfiguration();
  if (!configuration) throw new MediaStorageConfigurationError();
  return configuration;
}

function configureClient(configuration: CloudinaryConfiguration) {
  cloudinary.config({
    cloud_name: configuration.cloudName,
    api_key: configuration.apiKey,
    api_secret: configuration.apiSecret,
    secure: true,
  });
}

export function createCloudinaryUploadSignature(kind: UploadKind) {
  const configuration = requireConfiguration();
  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = {
    folder: UPLOAD_FOLDERS[kind],
    timestamp,
    upload_preset: configuration.uploadPreset,
  };

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${configuration.cloudName}/auto/upload`,
    parameters: {
      ...parameters,
      api_key: configuration.apiKey,
      signature: cloudinary.utils.api_sign_request(parameters, configuration.apiSecret),
    },
  };
}

export async function deleteCloudinaryMediaAssets(assets: ManagedMediaAsset[]) {
  const cloudinaryAssets = Array.from(
    new Map(
      assets
        .filter((asset) => asset.storageProvider === "cloudinary")
        .map((asset) => [`${asset.type}:${asset.storageKey}`, asset]),
    ).values(),
  );

  if (cloudinaryAssets.length === 0) return;

  const configuration = requireConfiguration();
  configureClient(configuration);

  const results = await Promise.allSettled(
    cloudinaryAssets.map((asset) =>
      cloudinary.uploader.destroy(asset.storageKey, {
        resource_type: asset.type,
        invalidate: true,
      }),
    ),
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );

  if (failures.length > 0) {
    throw new AggregateError(failures, "Some managed media assets could not be deleted.");
  }
}
