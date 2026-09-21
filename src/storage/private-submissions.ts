import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  assertDataOperationEnvironment,
  runtimeDataEnvironmentFromValues,
} from "../../scripts/lib/environment-fingerprint";
import { createR2Client } from "./r2-client";

const PRIVATE_CACHE_CONTROL = "private, no-store";
const UPLOAD_EXPIRES_SECONDS = 10 * 60;
const EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

type StoredObject = { bytes: Uint8Array; contentType: string | null };
type SubmissionUploadKind = "design" | "logo";
type InspectedImage = { width?: number; height?: number; pages?: number };

type StorageDependencies = {
  bucket: string;
  signPut(input: {
    bucket: string;
    key: string;
    contentType: string;
    sizeBytes: number;
    cacheControl: string;
  }): Promise<string>;
  get(input: { bucket: string; key: string }): Promise<StoredObject | null>;
  putImmutable(input: {
    bucket: string;
    key: string;
    bytes: Uint8Array;
    contentType: string;
    cacheControl: string;
  }): Promise<void>;
  delete(input: { bucket: string; key: string }): Promise<void>;
  randomUUID(): string;
  inspectImage?(bytes: Uint8Array): Promise<InspectedImage>;
};

export class PrivateSubmissionStorageConfigurationError extends Error {
  constructor() {
    super("Private submission storage is not configured.");
    this.name = "PrivateSubmissionStorageConfigurationError";
  }
}

export class PrivateSubmissionUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivateSubmissionUploadValidationError";
  }
}

export function isPrivateObjectMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function ownerPrefix(ownerUserId: string) {
  return createHash("sha256").update(ownerUserId).digest("hex").slice(0, 32);
}

function extensionFor(contentType: string) {
  const extension = EXTENSIONS[contentType.toLowerCase()];
  if (!extension) throw new Error("Unsupported upload content type.");
  return extension;
}

function sourceKey(ownerUserId: string, uploadId: string, contentType: string) {
  return `submissions/${ownerPrefix(ownerUserId)}/${uploadId}/source/original.${extensionFor(contentType)}`;
}

function expectedStagingPrefix(ownerUserId: string, uploadId: string) {
  return `submissions/${ownerPrefix(ownerUserId)}/${uploadId}/staging/`;
}

export function createPrivateStagingKey(input: {
  ownerUserId: string;
  uploadId: string;
  contentType: string;
  nonce?: string;
}) {
  return `${expectedStagingPrefix(input.ownerUserId, input.uploadId)}${input.nonce ?? randomUUID()}.${extensionFor(input.contentType)}`;
}

function normalizedType(value: string | null | undefined) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

function hasExpectedFileSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/png") {
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    );
  }
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (contentType === "image/gif") {
    return new TextDecoder().decode(bytes.slice(0, 6)) === "GIF87a" ||
      new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a";
  }
  if (contentType === "image/webp") {
    const decoder = new TextDecoder();
    return decoder.decode(bytes.slice(0, 4)) === "RIFF" &&
      decoder.decode(bytes.slice(8, 12)) === "WEBP";
  }
  if (contentType === "image/avif") {
    return new TextDecoder().decode(bytes.slice(4, 12)).includes("ftypavif");
  }
  if (contentType === "video/mp4") {
    return new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
  }
  if (contentType === "video/webm") {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  return false;
}

async function inspectPrivateImage(bytes: Uint8Array): Promise<InspectedImage> {
  const { default: sharp } = await import("sharp");
  const metadata = await sharp(bytes, { animated: true }).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    pages: metadata.pages,
  };
}

async function assertValidPrivateMedia(input: {
  kind: SubmissionUploadKind;
  contentType: string;
  bytes: Uint8Array;
  invalidMessage: string;
  inspectImage: (bytes: Uint8Array) => Promise<InspectedImage>;
}) {
  if (!hasExpectedFileSignature(input.contentType, input.bytes)) {
    throw new PrivateSubmissionUploadValidationError(input.invalidMessage);
  }
  if (!input.contentType.startsWith("image/")) return;

  let metadata: InspectedImage;
  try {
    metadata = await input.inspectImage(input.bytes);
  } catch {
    throw new PrivateSubmissionUploadValidationError(input.invalidMessage);
  }
  if (!metadata.width || !metadata.height) {
    throw new PrivateSubmissionUploadValidationError(input.invalidMessage);
  }
  if (input.kind === "logo" && (metadata.pages ?? 1) !== 1) {
    throw new PrivateSubmissionUploadValidationError(
      "Logo uploads must contain one static image.",
    );
  }
}

export function createPrivateSubmissionStorage(dependencies: StorageDependencies) {
  const inspectImage = dependencies.inspectImage ?? inspectPrivateImage;

  function assertOwnedKey(ownerUserId: string, uploadId: string, stagingKey: string) {
    const prefix = expectedStagingPrefix(ownerUserId, uploadId);
    if (
      !stagingKey.startsWith(prefix) ||
      !/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(stagingKey.slice(prefix.length))
    ) {
      throw new Error("The private upload key is invalid.");
    }
  }

  return {
    async sign(input: {
      ownerUserId: string;
      uploadId: string;
      stagingKey: string;
      contentType: string;
      sizeBytes: number;
    }) {
      assertOwnedKey(input.ownerUserId, input.uploadId, input.stagingKey);
      const uploadUrl = await dependencies.signPut({
        bucket: dependencies.bucket,
        key: input.stagingKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        cacheControl: PRIVATE_CACHE_CONTROL,
      });
      return {
        uploadUrl,
        method: "PUT" as const,
        headers: {
          "Content-Type": input.contentType,
          "Cache-Control": PRIVATE_CACHE_CONTROL,
        },
      };
    },

    async prepare(input: {
      ownerUserId: string;
      uploadId: string;
      contentType: string;
      sizeBytes: number;
    }) {
      const stagingKey = `${expectedStagingPrefix(input.ownerUserId, input.uploadId)}${dependencies.randomUUID()}.${extensionFor(input.contentType)}`;
      const uploadUrl = await dependencies.signPut({
        bucket: dependencies.bucket,
        key: stagingKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        cacheControl: PRIVATE_CACHE_CONTROL,
      });
      return {
        stagingKey,
        ticket: {
          uploadUrl,
          method: "PUT" as const,
          headers: {
            "Content-Type": input.contentType,
            "Cache-Control": PRIVATE_CACHE_CONTROL,
          },
        },
      };
    },

    async freeze(input: {
      ownerUserId: string;
      uploadId: string;
      kind: SubmissionUploadKind;
      stagingKey: string;
      contentType: string;
      sizeBytes: number;
    }) {
      assertOwnedKey(input.ownerUserId, input.uploadId, input.stagingKey);
      const objectKey = sourceKey(input.ownerUserId, input.uploadId, input.contentType);
      const alreadyFrozen = await dependencies.get({
        bucket: dependencies.bucket,
        key: objectKey,
      });
      if (alreadyFrozen) {
        if (normalizedType(alreadyFrozen.contentType) !== input.contentType) {
          throw new PrivateSubmissionUploadValidationError(
            "The frozen private upload is invalid.",
          );
        }
        await assertValidPrivateMedia({
          kind: input.kind,
          contentType: input.contentType,
          bytes: alreadyFrozen.bytes,
          invalidMessage: "The frozen private upload is invalid.",
          inspectImage,
        });
        return {
          objectKey,
          digest: createHash("sha256").update(alreadyFrozen.bytes).digest("hex"),
          contentType: input.contentType,
          sizeBytes: alreadyFrozen.bytes.byteLength,
        };
      }

      const staged = await dependencies.get({
        bucket: dependencies.bucket,
        key: input.stagingKey,
      });
      if (
        !staged ||
        staged.bytes.byteLength !== input.sizeBytes ||
        normalizedType(staged.contentType) !== input.contentType
      ) {
        await dependencies.delete({ bucket: dependencies.bucket, key: input.stagingKey });
        throw new PrivateSubmissionUploadValidationError(
          "The uploaded object did not match the signed file.",
        );
      }
      try {
        await assertValidPrivateMedia({
          kind: input.kind,
          contentType: input.contentType,
          bytes: staged.bytes,
          invalidMessage: "The uploaded object did not match the signed file.",
          inspectImage,
        });
      } catch (error) {
        await dependencies.delete({ bucket: dependencies.bucket, key: input.stagingKey });
        throw error;
      }
      await dependencies.putImmutable({
        bucket: dependencies.bucket,
        key: objectKey,
        bytes: staged.bytes,
        contentType: input.contentType,
        cacheControl: PRIVATE_CACHE_CONTROL,
      });
      const frozen = await dependencies.get({
        bucket: dependencies.bucket,
        key: objectKey,
      });
      if (!frozen) {
        throw new PrivateSubmissionUploadValidationError(
          "The frozen private upload could not be read.",
        );
      }
      await dependencies.delete({ bucket: dependencies.bucket, key: input.stagingKey });
      return {
        objectKey,
        digest: createHash("sha256").update(frozen.bytes).digest("hex"),
        contentType: normalizedType(frozen.contentType) ?? input.contentType,
        sizeBytes: frozen.bytes.byteLength,
      };
    },

    async read(objectKey: string) {
      const stored = await dependencies.get({ bucket: dependencies.bucket, key: objectKey });
      if (!stored) return null;
      return {
        ...stored,
        contentType: stored.contentType ?? "application/octet-stream",
        cacheControl: PRIVATE_CACHE_CONTROL,
      };
    },

    async delete(key: string) {
      await dependencies.delete({ bucket: dependencies.bucket, key });
    },
  };
}

function requirePrivateConfiguration() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_SUBMISSIONS_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new PrivateSubmissionStorageConfigurationError();
  }
  assertDataOperationEnvironment(runtimeDataEnvironmentFromValues(process.env));
  const client = createR2Client({ accountId, accessKeyId, secretAccessKey });
  return createPrivateSubmissionStorage({
    bucket,
    randomUUID,
    signPut: async (input) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          ContentType: input.contentType,
          ContentLength: input.sizeBytes,
          CacheControl: input.cacheControl,
        }),
        { expiresIn: UPLOAD_EXPIRES_SECONDS },
      ),
    get: async (input) => {
      let response;
      try {
        response = await client.send(
          new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
        );
      } catch (error) {
        if (isPrivateObjectMissingError(error)) return null;
        throw error;
      }
      if (!response.Body) return null;
      return {
        bytes: await response.Body.transformToByteArray(),
        contentType: response.ContentType ?? null,
      };
    },
    putImmutable: async (input) => {
      await client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.bytes,
          ContentType: input.contentType,
          ContentLength: input.bytes.byteLength,
          CacheControl: input.cacheControl,
          IfNoneMatch: "*",
        }),
      );
    },
    delete: async (input) => {
      await client.send(new DeleteObjectCommand({ Bucket: input.bucket, Key: input.key }));
    },
  });
}

export async function signPrivateUpload(input: {
  ownerUserId: string;
  uploadId?: string;
  stagingKey: string;
  contentType: string;
  sizeBytes: number;
}) {
  const uploadId = input.uploadId ?? input.stagingKey.split("/")[2];
  if (!uploadId) throw new Error("The private upload key is invalid.");
  return requirePrivateConfiguration().sign({ ...input, uploadId });
}

export async function freezePrivateUpload(input: {
  ownerUserId: string;
  uploadId: string;
  kind: SubmissionUploadKind;
  stagingKey: string;
  contentType: string;
  sizeBytes: number;
}) {
  return requirePrivateConfiguration().freeze(input);
}

export async function readPrivateUpload(objectKey: string) {
  return requirePrivateConfiguration().read(objectKey);
}

export async function deletePrivateUpload(key: string) {
  return requirePrivateConfiguration().delete(key);
}

export async function deletePrivateUploads(keys: string[]) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (uniqueKeys.length === 0) return;
  const storage = requirePrivateConfiguration();
  for (const key of uniqueKeys) await storage.delete(key);
}
