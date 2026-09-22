import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { MediaUploadKind } from "@/features/admin/media-upload";
import type { ManagedMediaAsset } from "@/storage/types";
import { createR2Client } from "./r2-client";
import {
  assertDataOperationEnvironment,
  runtimeDataEnvironmentFromValues,
} from "../../scripts/lib/environment-fingerprint";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const UPLOAD_EXPIRES_SECONDS = 10 * 60;
const PREFIXES: Record<MediaUploadKind, string> = {
  "post-media": "posts",
  "logo-media": "logos",
  "website-recording": "websites",
  "website-poster": "websites",
  "website-section": "websites",
  "website-favicon": "websites",
  "creator-avatar": "creators",
  "sponsor-media": "sponsors",
  "sponsor-icon": "sponsors",
};
const EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

type R2Configuration = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

export class R2StorageConfigurationError extends Error {
  constructor() {
    super("Cloudflare R2 media storage is not configured.");
    this.name = "R2StorageConfigurationError";
  }
}

function requireConfiguration(): R2Configuration {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new R2StorageConfigurationError();
  }

  try {
    const url = new URL(publicBaseUrl);
    if (url.protocol !== "https:" || url.search || url.hash) throw new Error();
  } catch {
    throw new R2StorageConfigurationError();
  }

  assertDataOperationEnvironment(runtimeDataEnvironmentFromValues(process.env));

  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function createClient(configuration: R2Configuration) {
  return createR2Client(configuration);
}

function encodeStorageKey(storageKey: string) {
  return storageKey.split("/").map(encodeURIComponent).join("/");
}

export function isStorageKeyForKind(storageKey: string, kind: MediaUploadKind) {
  return new RegExp(`^${PREFIXES[kind]}/[0-9a-f-]{36}\\.[a-z0-9]+$`, "i").test(
    storageKey,
  );
}

export function getR2PublicUrl(storageKey: string) {
  const configuration = requireConfiguration();
  return `${configuration.publicBaseUrl}/${encodeStorageKey(storageKey)}`;
}

export async function createR2PresignedUpload(input: {
  kind: MediaUploadKind;
  contentType: string;
}) {
  const configuration = requireConfiguration();
  const extension = EXTENSIONS[input.contentType];
  if (!extension) throw new Error("Unsupported upload content type.");

  const storageKey = `${PREFIXES[input.kind]}/${randomUUID()}.${extension}`;
  const command = new PutObjectCommand({
    Bucket: configuration.bucket,
    Key: storageKey,
    ContentType: input.contentType,
    CacheControl: CACHE_CONTROL,
  });
  const uploadUrl = await getSignedUrl(createClient(configuration), command, {
    expiresIn: UPLOAD_EXPIRES_SECONDS,
  });

  return {
    provider: "r2" as const,
    uploadUrl,
    method: "PUT" as const,
    headers: {
      "Content-Type": input.contentType,
      "Cache-Control": CACHE_CONTROL,
    },
    storageKey,
  };
}

export async function verifyR2Upload(input: {
  kind: MediaUploadKind;
  storageKey: string;
  contentType: string;
  size: number;
}) {
  if (!isStorageKeyForKind(input.storageKey, input.kind)) {
    throw new Error("The uploaded object key is invalid.");
  }

  const configuration = requireConfiguration();
  const response = await createClient(configuration).send(
    new HeadObjectCommand({ Bucket: configuration.bucket, Key: input.storageKey }),
  );
  const actualType = response.ContentType?.split(";", 1)[0]?.toLowerCase();

  if (actualType !== input.contentType.toLowerCase() || response.ContentLength !== input.size) {
    await deleteR2StorageKeys([input.storageKey]);
    throw new Error("The uploaded object did not match the signed file.");
  }
}

export async function createR2PresignedDownload(input: {
  storageKey: string;
  fileName: string;
  contentType?: string | null;
}) {
  const configuration = requireConfiguration();
  const command = new GetObjectCommand({
    Bucket: configuration.bucket,
    Key: input.storageKey,
    ResponseContentDisposition: `attachment; filename="${input.fileName}"`,
    ResponseContentType: input.contentType ?? undefined,
  });
  return getSignedUrl(createClient(configuration), command, { expiresIn: 5 * 60 });
}

export async function getR2MediaAsset(storageKey: string) {
  const configuration = requireConfiguration();
  const response = await createClient(configuration).send(
    new GetObjectCommand({ Bucket: configuration.bucket, Key: storageKey }),
  );

  if (!response.Body) throw new Error("R2 returned an empty media object.");

  return {
    bytes: await response.Body.transformToByteArray(),
    contentType: response.ContentType,
  };
}

export async function deleteR2StorageKeys(storageKeys: string[]) {
  const keys = [...new Set(storageKeys.filter(Boolean))];
  if (keys.length === 0) return;

  const configuration = requireConfiguration();
  const result = await createClient(configuration).send(
    new DeleteObjectsCommand({
      Bucket: configuration.bucket,
      Delete: { Quiet: true, Objects: keys.map((Key) => ({ Key })) },
    }),
  );
  if (result.Errors?.length) {
    throw new Error(`R2 failed to delete ${result.Errors.length} object(s).`);
  }
}

export async function deleteR2MediaAssets(assets: ManagedMediaAsset[]) {
  const keys = assets
    .filter((asset) => asset.storageProvider === "r2")
    .flatMap((asset) => [
      asset.storageKey,
      ...(asset.variantStorageKeys ?? []),
      ...(asset.videoPreviewStorageKey ? [asset.videoPreviewStorageKey] : []),
      ...(asset.posterStorageKey ? [asset.posterStorageKey] : []),
    ]);
  await deleteR2StorageKeys(keys);
}

// Owner uploads are staged separately: public avatar keys are never accepted
// as upload inputs, and a still-valid PUT URL cannot overwrite a saved avatar.
function avatarUploadPrefix(userId: string) {
  return `creators/uploads/${createHash("sha256").update(userId).digest("hex")}/`;
}

export function isOwnedAvatarUpload(userId: string, storageKey: string) {
  if (!userId || typeof storageKey !== "string") return false;
  const prefix = avatarUploadPrefix(userId);
  return storageKey.startsWith(prefix) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(storageKey.slice(prefix.length));
}

export async function createOwnedAvatarUpload(userId: string, size: number) {
  if (!userId) throw new Error("An authenticated owner is required.");
  const configuration = requireConfiguration();
  const storageKey = `${avatarUploadPrefix(userId)}${randomUUID()}.webp`;
  const uploadUrl = await getSignedUrl(createClient(configuration), new PutObjectCommand({
    Bucket: configuration.bucket,
    Key: storageKey,
    ContentType: "image/webp",
    ContentLength: size,
    CacheControl: "private, no-store",
  }), { expiresIn: UPLOAD_EXPIRES_SECONDS });
  return {
    provider: "r2" as const,
    uploadUrl,
    method: "PUT" as const,
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store" },
    storageKey,
  };
}

export async function freezeOwnedAvatarUpload(userId: string, input: { storageKey: string; size: number }) {
  if (!isOwnedAvatarUpload(userId, input.storageKey)) throw new Error("The uploaded photo does not belong to you.");
  const configuration = requireConfiguration();
  const client = createClient(configuration);
  const staged = await client.send(new HeadObjectCommand({ Bucket: configuration.bucket, Key: input.storageKey }));
  if (staged.ContentType?.split(";", 1)[0]?.toLowerCase() !== "image/webp" || staged.ContentLength !== input.size || !staged.ETag) {
    // Verification is read-only. Only the explicit owned staging discard path deletes uploads.
    throw new Error("The uploaded object did not match the signed file.");
  }
  const storageKey = `creators/${randomUUID()}.webp`;
  await client.send(new CopyObjectCommand({
    Bucket: configuration.bucket,
    Key: storageKey,
    CopySource: `${configuration.bucket}/${encodeStorageKey(input.storageKey)}`,
    CopySourceIfMatch: staged.ETag,
    MetadataDirective: "REPLACE",
    ContentType: "image/webp",
    CacheControl: CACHE_CONTROL,
  }));
  return { storageKey, url: getR2PublicUrl(storageKey) };
}

export async function discardOwnedAvatarUpload(userId: string, storageKey: string) {
  if (!isOwnedAvatarUpload(userId, storageKey)) return;
  await deleteR2StorageKeys([storageKey]);
}
