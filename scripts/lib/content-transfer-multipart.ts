import { createHash, randomUUID } from "node:crypto";
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { conditionalPreviewCopy } from "./content-transfer-copy";

/** Only a newly generated staging key is deleted; the final key is always conditional. */
export async function putViaPreviewStaging(options: { client: S3Client; bucket: string; key: string; bytes: Buffer; contentType?: string; cacheControl?: string; assertTarget(): void }) {
  options.assertTarget();
  const key = `phase2-transfer-staging/${randomUUID()}`;
  if (key === options.key) throw new Error("Transfer staging key must differ.");
  const created = await options.client.send(new CreateMultipartUploadCommand({ Bucket: options.bucket, Key: key, ContentType: options.contentType, CacheControl: options.cacheControl }));
  if (!created.UploadId) throw new Error("Transfer multipart upload ID missing.");
  const upload = { Bucket: options.bucket, Key: key, UploadId: created.UploadId };
  let completed = false;
  try {
    const size = 5 * 1024 * 1024;
    const parts = Array.from({ length: Math.ceil(options.bytes.length / size) }, (_, index) => ({ PartNumber: index + 1, Body: options.bytes.subarray(index * size, (index + 1) * size) }));
    const queue = [...parts], uploaded: { PartNumber: number; ETag: string }[] = [];
    const outcomes = await Promise.allSettled(Array.from({ length: Math.min(4, parts.length) }, async () => {
      while (queue.length) {
        options.assertTarget();
        const part = queue.shift()!;
        const response = await options.client.send(new UploadPartCommand({ ...upload, ...part, ContentLength: part.Body.length, ContentMD5: createHash("md5").update(part.Body).digest("base64") }));
        if (!response.ETag) throw new Error("Transfer multipart ETag missing.");
        uploaded.push({ PartNumber: part.PartNumber, ETag: response.ETag });
      }
    }));
    const failed = outcomes.find(r => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    options.assertTarget();
    const assembled = await options.client.send(new CompleteMultipartUploadCommand({ ...upload, MultipartUpload: { Parts: uploaded.sort((a, b) => a.PartNumber - b.PartNumber) } }));
    completed = true;
    if (!assembled.ETag) throw new Error("Transfer assembled ETag missing.");
    options.assertTarget();
    try {
      await options.client.send(conditionalPreviewCopy({ key: options.key, sourceEtag: assembled.ETag }, options.bucket, options.bucket, { key, etag: assembled.ETag }));
      return "copied" as const;
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) return "already-exists" as const;
      throw error;
    }
  } finally {
    options.assertTarget();
    if (completed) await options.client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }));
    else await options.client.send(new AbortMultipartUploadCommand(upload));
  }
}
