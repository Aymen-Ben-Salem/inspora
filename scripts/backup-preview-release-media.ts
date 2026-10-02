import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { loadPreviewEnvironment } from "./lib/preview-environment";
import { assertSnapshotUnchanged, captureContentSnapshot } from "./lib/content-transfer-database";
import type { ContentSnapshot } from "./lib/content-transfer-plan";
import { backupSha256, captureReleaseMedia, PREVIEW_MEDIA_BUCKETS, releaseSnapshotLabel, storePreviewMedia, type BackupObject, type MediaObject } from "./lib/release-backup-media";

async function main() {
  const [selector, mode, ...extra] = process.argv.slice(2), label = releaseSnapshotLabel(selector ?? "");
  if (extra.length || !["paths", "capture"].includes(mode)) throw Error("Backup mode rejected");
  const root = realpathSync(".scratch/release-preparation");
  const receipt = resolve(root, "preview-media-backup-" + label + ".json");
  if (mode === "paths") { console.log(JSON.stringify({ networkRequests: 0, receipt })); return; }
  if (existsSync(receipt)) throw Error("Backup completed receipt exists; choose unused snapshot");
  const local = (p: string) => {
    const target = realpathSync(resolve(root, p));
    if (!target.startsWith(root + sep) || /(^|[\\/])\.env(?:[.\\/]|$)/i.test(target)) throw Error("Backup local path rejected");
    return target;
  };
  const capturePath = "private-recovery/preview-" + label + "-capture.json";
  const rawCapture = readFileSync(local(capturePath));
  const capture = JSON.parse(rawCapture.toString()) as { kind: string; archiveSha256: string; snapshot: ContentSnapshot };
  if (capture.kind !== "preview" || backupSha256(readFileSync(local("private-recovery/preview-" + label + ".dump"))) !== capture.archiveSha256) throw Error("Backup matching preview database archive required");
  const e = loadPreviewEnvironment();
  if (e.r2BucketName !== PREVIEW_MEDIA_BUCKETS[0] || e.r2SubmissionsBucketName !== PREVIEW_MEDIA_BUCKETS[1]) throw Error("Backup preview bucket identity rejected");
  const pool = new Pool({ connectionString: e.databaseUrlUnpooled, connectionTimeoutMillis: 20000 });
  const client = new S3Client({ region: "auto", endpoint: `https://${e.r2AccountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: e.r2AccessKeyId, secretAccessKey: e.r2SecretAccessKey }, maxAttempts: 2 });
  const cache = new Map<string, BackupObject>();
  // Reuse only digest-checked local bytes with an unchanged current source ETag.
  for (const name of ["phase3-production-media-backup.json", "phase3-production-media-backup-20261001.json"]) {
    if (!existsSync(resolve(root, name))) continue;
    const prior = JSON.parse(readFileSync(local(name), "utf8"));
    for (const o of prior.objects as BackupObject[]) if (o.bucket === "inspora-media-production" && /^private-recovery\/production-media-full\/[a-f0-9]{64}$/.test(o.localPath)) cache.set(o.key, o);
  }
  const started = Date.now();
  try {
    const report = await captureReleaseMedia({
      buckets: [...PREVIEW_MEDIA_BUCKETS],
      checkSnapshot: async () => {
        const db = await pool.connect();
        try {
          await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
          assertSnapshotUnchanged(capture.snapshot, await captureContentSnapshot(db, "preview"));
          await db.query("COMMIT");
        } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
      },
      list: async () => {
        const result: MediaObject[] = [];
        for (const bucket of PREVIEW_MEDIA_BUCKETS) {
          let token: string | undefined;
          do {
            const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }), { abortSignal: AbortSignal.timeout(45000) });
            for (const o of page.Contents ?? []) {
              if (!o.Key || !o.ETag || o.Size === undefined) throw Error("Backup incomplete provider inventory");
              result.push({ bucket, key: o.Key, etag: o.ETag, size: o.Size, lastModified: o.LastModified?.toISOString() });
            }
            token = page.NextContinuationToken;
            if (page.IsTruncated && !token) throw Error("Backup incomplete provider pagination");
          } while (token);
        }
        return result;
      },
      cached: async o => {
        const c = o.bucket === PREVIEW_MEDIA_BUCKETS[0] ? cache.get(o.key) : undefined;
        if (!c || c.etag !== o.etag || c.size !== o.size || !existsSync(resolve(root, c.localPath))) return;
        return { bytes: readFileSync(local(c.localPath)), sha256: c.sha256 };
      },
      head: async o => {
        const h = await client.send(new HeadObjectCommand({ Bucket: o.bucket, Key: o.key, IfMatch: o.etag }), { abortSignal: AbortSignal.timeout(45000) });
        if (h.ContentLength !== o.size || h.ETag !== o.etag) throw Error("Backup cached source version changed");
        return { etag: h.ETag, contentType: h.ContentType, cacheControl: h.CacheControl, contentDisposition: h.ContentDisposition, contentEncoding: h.ContentEncoding, contentLanguage: h.ContentLanguage, metadata: h.Metadata };
      },
      get: async o => {
        const r = await client.send(new GetObjectCommand({ Bucket: o.bucket, Key: o.key, IfMatch: o.etag }), { abortSignal: AbortSignal.timeout(45000) });
        if (!r.Body || r.ContentLength !== o.size || !r.ETag) throw Error("Backup object response rejected");
        return { bytes: await r.Body.transformToByteArray(), etag: r.ETag, contentType: r.ContentType, cacheControl: r.CacheControl, contentDisposition: r.ContentDisposition, contentEncoding: r.ContentEncoding, contentLanguage: r.ContentLanguage, metadata: r.Metadata };
      },
      store: async (digest, bytes) => storePreviewMedia(root, digest, bytes),
    });
    const result = { at: new Date().toISOString(), label, previewCaptureSha256: backupSha256(rawCapture), seconds: (Date.now() - started) / 1000, ...report };
    writeFileSync(receipt, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ ...result, objects: undefined }));
  } finally { client.destroy(); await pool.end(); }
}
main().catch(error => {
  const safe = error instanceof Error && /^Backup [a-zA-Z /;.-]+$/.test(error.message) ? error.message : "Backup preview media capture stopped; credentials suppressed";
  console.error(safe + ". Preserve local bytes and investigate drift before retry."); process.exitCode = 1;
});
