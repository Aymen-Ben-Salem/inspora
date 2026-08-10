import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { v2 as cloudinary } from "cloudinary";

import type { ProductionMediaEnvironment } from "../production-environment";
import type { CloudinarySource, PreparedObject } from "./types";

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const MIME_TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export class MigrationStorage {
  readonly #environment: ProductionMediaEnvironment;
  readonly #r2: S3Client;

  constructor(environment: ProductionMediaEnvironment) {
    this.#environment = environment;
    this.#r2 = new S3Client({
      region: "auto",
      endpoint: `https://${environment.r2AccountId}.r2.cloudflarestorage.com`,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: environment.r2AccessKeyId,
        secretAccessKey: environment.r2SecretAccessKey,
      },
    });
    cloudinary.config({
      cloud_name: environment.cloudinaryCloudName,
      api_key: environment.cloudinaryApiKey,
      api_secret: environment.cloudinaryApiSecret,
      secure: true,
    });
  }

  publicUrl(storageKey: string) {
    const encoded = storageKey.split("/").map(encodeURIComponent).join("/");
    return `${this.#environment.r2PublicBaseUrl}/${encoded}`;
  }

  async resolveCloudinarySource(
    publicId: string,
    resourceType: "image" | "video",
  ): Promise<CloudinarySource> {
    const resource = (await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
    })) as Record<string, unknown>;
    const format = typeof resource.format === "string" ? resource.format.toLowerCase() : "";
    const secureUrl = typeof resource.secure_url === "string" ? resource.secure_url : "";
    const width = typeof resource.width === "number" ? resource.width : 0;
    const height = typeof resource.height === "number" ? resource.height : 0;
    const bytes = typeof resource.bytes === "number" ? resource.bytes : 0;
    const mimeType = MIME_TYPES[format];

    if (!secureUrl || !mimeType || width <= 0 || height <= 0 || bytes <= 0) {
      throw new Error(`Cloudinary returned incomplete metadata for ${publicId}.`);
    }

    return {
      publicId,
      resourceType,
      format,
      mimeType,
      secureUrl,
      width,
      height,
      bytes,
    };
  }

  async download(source: CloudinarySource) {
    const response = await fetch(source.secureUrl, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Cloudinary download failed with HTTP ${response.status}.`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength === 0) throw new Error("Cloudinary returned an empty asset.");
    return body;
  }

  async uploadAndVerify(objects: PreparedObject[]) {
    for (const object of objects) {
      await this.#r2.send(
        new PutObjectCommand({
          Bucket: this.#environment.r2BucketName,
          Key: object.storageKey,
          Body: object.body,
          ContentLength: object.body.byteLength,
          ContentType: object.contentType,
          CacheControl: IMMUTABLE_CACHE_CONTROL,
        }),
      );
      await this.verifyObject(object.storageKey, {
        bytes: object.body.byteLength,
        contentType: object.contentType,
      });
    }
  }

  async verifyObject(
    storageKey: string,
    expected?: { bytes?: number; contentType?: string },
  ) {
    const response = await this.#r2.send(
      new HeadObjectCommand({
        Bucket: this.#environment.r2BucketName,
        Key: storageKey,
      }),
    );
    const actualType = response.ContentType?.split(";", 1)[0]?.toLowerCase();

    if (expected?.bytes !== undefined && response.ContentLength !== expected.bytes) {
      throw new Error(`R2 size verification failed for ${storageKey}.`);
    }
    if (expected?.contentType && actualType !== expected.contentType.toLowerCase()) {
      throw new Error(`R2 content-type verification failed for ${storageKey}.`);
    }
    if (response.CacheControl !== IMMUTABLE_CACHE_CONTROL) {
      throw new Error(`R2 cache-control verification failed for ${storageKey}.`);
    }

    return {
      bytes: response.ContentLength ?? 0,
      contentType: actualType ?? "",
    };
  }

  async deleteR2Objects(storageKeys: string[]) {
    const uniqueKeys = [...new Set(storageKeys.filter(Boolean))];
    for (let index = 0; index < uniqueKeys.length; index += 1000) {
      const keys = uniqueKeys.slice(index, index + 1000);
      const response = await this.#r2.send(
        new DeleteObjectsCommand({
          Bucket: this.#environment.r2BucketName,
          Delete: { Quiet: true, Objects: keys.map((Key) => ({ Key })) },
        }),
      );
      if (response.Errors?.length) {
        throw new Error(`R2 failed to delete ${response.Errors.length} object(s).`);
      }
    }
  }

  async listManagedR2Objects() {
    const objects: Array<{ key: string; lastModified: Date | null }> = [];
    for (const prefix of ["posts/", "creators/"]) {
      let continuationToken: string | undefined;
      do {
        const response = await this.#r2.send(
          new ListObjectsV2Command({
            Bucket: this.#environment.r2BucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        objects.push(
          ...(response.Contents ?? []).flatMap((object) =>
            object.Key
              ? [{ key: object.Key, lastModified: object.LastModified ?? null }]
              : [],
          ),
        );
        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (continuationToken);
    }
    return objects;
  }

  async deleteCloudinaryAsset(
    publicId: string,
    resourceType: "image" | "video",
  ) {
    const result = (await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    })) as { result?: string };
    if (result.result !== "ok" && result.result !== "not found") {
      throw new Error(`Cloudinary did not delete ${publicId}.`);
    }
  }
}
