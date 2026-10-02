import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { conditionalPreviewCopy } from "./content-transfer-copy";
import { putViaPreviewStaging } from "./content-transfer-multipart";
export { conditionalPreviewCopy } from "./content-transfer-copy";

export type TransferObject = { key: string; origin?: "production" | "preview"; bytes: number; sha256: string; sourceEtag: string; localPath: string; contentType?: string; cacheControl?: string };
export type ObjectDigest = { bytes: number; sha256: string };
type TransferIO = {
  assertTarget(): void;
  digest(key: string): Promise<ObjectDigest | null>;
  verifySource(object: TransferObject): Promise<void>;
  put(object: TransferObject): Promise<void>;
};
function matches(expected: ObjectDigest, actual: ObjectDigest | null) { return !!actual && expected.bytes === actual.bytes && expected.sha256 === actual.sha256; }


export async function transferMediaObject(object: TransferObject, io: TransferIO): Promise<"existing-verified" | "copied-verified"> {
  io.assertTarget();
  if (!object.key || !Number.isSafeInteger(object.bytes) || object.bytes < 1 || !/^[a-f0-9]{64}$/.test(object.sha256)) throw new Error("Transfer media manifest is invalid.");
  const existing = await io.digest(object.key);
  if (existing) {
    if (!matches(object, existing)) throw new Error(`Transfer media conflict: ${object.key}.`);
    return "existing-verified";
  }
  if (object.origin === "preview") throw new Error("Transfer preserved preview object is missing.");
  await io.verifySource(object);
  await io.put(object);
  if (!matches(object, await io.digest(object.key))) throw new Error(`Transfer media verification failed: ${object.key}.`);
  return "copied-verified";
}

export async function objectDigest(client: S3Client, bucket: string, key: string): Promise<ObjectDigest | null> {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) throw new Error("Missing object body.");
    const hash = createHash("sha256"); let bytes = 0;
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) { bytes += chunk.byteLength; hash.update(chunk); }
    return { bytes, sha256: hash.digest("hex") };
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

/** All environment checks run before use; only preview receives writes. Cleanup removes only newly generated staging keys. */
export function createMediaTransferIO(options: { assertTarget(): void; source: S3Client; destination: S3Client; sourceBucket: string; destinationBucket: string; cacheRoot: string; serverCopy?: boolean }): TransferIO {
  const assertTarget = () => {
    options.assertTarget();
    if (options.sourceBucket === options.destinationBucket) throw new Error("Transfer buckets must differ.");
  };
  assertTarget();
  const local = (object: TransferObject) => {
    const path = resolve(options.cacheRoot, object.localPath);
    const suffix = relative(resolve(options.cacheRoot), path);
    if (suffix.startsWith("..") || isAbsolute(suffix)) throw new Error("Transfer cache path escapes its directory.");
    return path;
  };
  return {
    assertTarget,
    digest: key => objectDigest(options.destination, options.destinationBucket, key),
    verifySource: async object => {
      assertTarget();
      const response = await options.source.send(new HeadObjectCommand({ Bucket: options.sourceBucket, Key: object.key, IfMatch: object.sourceEtag }));
      if (response.ContentLength !== object.bytes || response.ETag !== object.sourceEtag) throw new Error("Transfer source object drifted.");
      const hash = createHash("sha256"); let bytes = 0;
      for await (const chunk of createReadStream(local(object))) { bytes += chunk.length; hash.update(chunk); }
      if (bytes !== object.bytes || hash.digest("hex") !== object.sha256) throw new Error("Transfer local cache bytes changed.");
    },
    put: async object => {
      assertTarget();
      if (object.origin === "preview") throw new Error("Transfer preserved preview objects cannot be uploaded.");
      if (options.serverCopy) {
        try { await options.destination.send(conditionalPreviewCopy(object, options.sourceBucket, options.destinationBucket)); }
        catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error; }
        return;
      }
      const bytes = readFileSync(local(object));
      if (bytes.length !== object.bytes || createHash("sha256").update(bytes).digest("hex") !== object.sha256) throw new Error("Transfer local cache bytes changed before upload.");
      if (bytes.length > 8 * 1024 * 1024) {
        await putViaPreviewStaging({ client: options.destination, bucket: options.destinationBucket, key: object.key, bytes, contentType: object.contentType, cacheControl: object.cacheControl, assertTarget });
        return;
      }
      try {
        await options.destination.send(new PutObjectCommand({ Bucket: options.destinationBucket, Key: object.key, Body: bytes, ContentLength: object.bytes, ContentType: object.contentType, CacheControl: object.cacheControl, ContentMD5: createHash("md5").update(bytes).digest("base64"), IfNoneMatch: "*" }));
      } catch (error) {
        // A concurrent create is safe only if the subsequent GET verifies identical bytes.
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
      }
    },
  };
}
