import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { buildContentTransferPlan, canonicalHash, EXCLUDED_WEBSITE_ID, type ContentSnapshot, type ContentTransferPlan } from "./lib/content-transfer-plan";
import { applyContentTransfer, assertCleanupRecovery, assertSnapshotUnchanged, captureContentSnapshot, deleteExactTestWebsite, inspectD1References } from "./lib/content-transfer-database";
import { createMediaTransferIO, transferMediaObject, type TransferObject } from "./lib/content-transfer-media";
import { assertManifestPin, loadContentTransferEnvironment, parseTransferArguments } from "./lib/content-transfer-environment";

type Manifest = {
  version: 1; purpose: "preview-content-transfer"; previewCommit: string;
  newOnly: boolean;
  sourceFingerprint: string; destinationFingerprint: string;
  sourceSnapshotHash: string; sourceCaptureTime: string;
  before: ContentSnapshot; plan: ContentTransferPlan; media: TransferObject[];
  recoveryTableHashesHash: string; recoveryEndpointHash: string;
  cleanup: { id: string; pending: boolean; deleteAssets: false; deleteCreator: false };
};
const sourceHash = (snapshot: ContentSnapshot) => canonicalHash({ ...snapshot, capturedAt: null });

async function main() {
  const args = parseTransferArguments(process.argv.slice(2));
  const branch = () => execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  const head = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (branch() !== "preview/archive-updates") throw new Error("Transfer requires preview/archive-updates.");
  const env = loadContentTransferEnvironment();
  const commit = head();
  const guard = () => { env.guard(); if (branch() !== "preview/archive-updates" || head() !== commit) throw new Error("Transfer checkout changed."); };
  const evidence = resolve(args.evidenceDir);
  const read = (name: string) => JSON.parse(readFileSync(resolve(evidence, name), "utf8"));
  const recovery = read("preview-recovery-verification.json");
  if (!recovery.contentCloneMatches || recovery.missingMetadata?.length || !recovery.userProvidedMetadata?.parentBranchId || recovery.captures.preview.endpointSha256 === recovery.captures.recovery.endpointSha256) throw new Error("Transfer requires verified isolated recovery evidence and branch metadata.");
  const sourcePool = new Pool({ connectionString: env.source.databaseUrl });
  const previewPool = new Pool({ connectionString: env.preview.databaseUrl });
  const readSnapshot = async (kind: "source" | "preview") => {
    const client = await (kind === "source" ? sourcePool : previewPool).connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '30s'");
      if ((await client.query("show transaction_read_only")).rows[0].transaction_read_only !== "on") throw new Error("Transfer source must be read-only.");
      const snapshot = await captureContentSnapshot(client, kind);
      if (kind === "preview" && snapshot.rows.creators.some(r => r.id === "260bccc4-5b7c-459e-a584-626cd509b476")) await inspectD1References(client, snapshot);
      await client.query("COMMIT");
      return snapshot;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  try {
    const [source, before] = await Promise.all([readSnapshot("source"), readSnapshot("preview")]);
    const plan = buildContentTransferPlan(source, before, { sourceHost: new URL(env.source.r2PublicBaseUrl).host, destinationHost: new URL(env.preview.r2PublicBaseUrl).host, newOnly: args.newOnly });
    const cached = read("source-media-checksums.json").objects as Record<string, { key: string; bytes: number; sha256: string; etag: string; localPath: string; contentType?: string; cacheControl?: string }>;
    const media: TransferObject[] = plan.productionMediaKeys.map(key => {
      const object = cached[key];
      if (!object || object.key !== key || !/^[a-f0-9]{64}$/.test(object.sha256)) throw new Error("Transfer requires verified source media for every key.");
      return { key, origin: "production", bytes: object.bytes, sha256: object.sha256, sourceEtag: object.etag, localPath: object.localPath, ...(object.contentType ? { contentType: object.contentType } : {}), ...(object.cacheControl ? { cacheControl: object.cacheControl } : {}) };
    });
    const previewAssets = read("preview-assets-before.json").objects as { key: string; size: number; sha256: string; etag: string; localPath: string }[];
    for (const key of plan.preservedPreviewMediaKeys) {
      const object = previewAssets.find(o => o.key === key);
      if (!object || !/^[a-f0-9]{64}$/.test(object.sha256)) throw new Error("Transfer preserved preview media requires a verified backup.");
      media.push({ key, origin: "preview", bytes: object.size, sha256: object.sha256, sourceEtag: object.etag, localPath: object.localPath });
    }
    const manifest: Manifest = { version: 1, purpose: "preview-content-transfer", newOnly: args.newOnly, previewCommit: commit, sourceFingerprint: env.sourceFingerprint, destinationFingerprint: env.destinationFingerprint, sourceSnapshotHash: sourceHash(source), sourceCaptureTime: source.capturedAt, before, plan, media, recoveryTableHashesHash: canonicalHash(recovery.captures.recovery.tableHashes), recoveryEndpointHash: recovery.captures.recovery.endpointSha256, cleanup: { id: EXCLUDED_WEBSITE_ID, pending: before.rows.websites.some(r => r.id === EXCLUDED_WEBSITE_ID), deleteAssets: false, deleteCreator: false } };
    if (args.mode === "dry-run") {
      const path = resolve(args.output ?? resolve(evidence, "preview-transfer-manifest.json"));
      const raw = JSON.stringify(manifest, null, 2) + "\n";
      writeFileSync(path, raw);
      console.log(JSON.stringify({ mode: "dry-run", manifest: path, sha256: createHash("sha256").update(raw).digest("hex"), changes: plan.changes.length, aliases: plan.aliasInserts.length, mergeDuplicate: plan.mergeDuplicate, cleanupPending: manifest.cleanup.pending, sourceDesigns: source.rows.posts.length, mediaObjects: media.length, mediaBytes: media.reduce((n, o) => n + o.bytes, 0) }));
      return;
    }
    const raw = readFileSync(resolve(args.manifest!), "utf8");
    assertManifestPin(raw, args.sha256!);
    const pinned = JSON.parse(raw) as Manifest;
    for (const key of ["version", "purpose", "newOnly", "previewCommit", "sourceFingerprint", "destinationFingerprint", "sourceSnapshotHash", "recoveryEndpointHash", "recoveryTableHashesHash"] as const) if (canonicalHash(pinned[key] ?? null) !== canonicalHash(manifest[key])) throw new Error(`Transfer manifest no longer matches ${key}.`);
    assertSnapshotUnchanged(pinned.before, before);
    if (canonicalHash(pinned.plan) !== canonicalHash(plan) || canonicalHash(pinned.media) !== canonicalHash(media)) throw new Error("Transfer manifest reconciliation changed.");
    guard();
    if (args.mode === "cleanup") {
      assertCleanupRecovery(before, recovery.captures.recovery.tableHashes);
      if (!pinned.cleanup.pending || pinned.cleanup.id !== EXCLUDED_WEBSITE_ID || pinned.cleanup.deleteAssets || pinned.cleanup.deleteCreator) throw new Error("Transfer cleanup manifest scope invalid.");
      const client = await previewPool.connect();
      try { await deleteExactTestWebsite(client, before, EXCLUDED_WEBSITE_ID, guard); } finally { client.release(); }
      writeFileSync(resolve(evidence, "preview-cleanup-result.json"), JSON.stringify({ appliedAt: new Date().toISOString(), manifestSha256: args.sha256, websiteId: EXCLUDED_WEBSITE_ID, creatorDeleted: false, storageObjectsDeleted: 0, cacheInvalidationPending: true }, null, 2));
      console.log(JSON.stringify({ mode: "cleanup", deletedWebsiteId: EXCLUDED_WEBSITE_ID, cacheInvalidationPending: true }));
      return;
    }
    if (canonicalHash(before.tableHashes) !== manifest.recoveryTableHashesHash) throw new Error("Transfer preview drifted from its recovery copy; refresh recovery before applying.");
    const makeS3 = (e: typeof env.source) => new S3Client({ region: "auto", endpoint: `https://${e.r2AccountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: e.r2AccessKeyId, secretAccessKey: e.r2SecretAccessKey }, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED" });
    const sourceStorage = makeS3(env.source), destinationStorage = makeS3(env.preview);
    try {
      const io = createMediaTransferIO({ assertTarget: env.guard, source: sourceStorage, destination: destinationStorage, sourceBucket: env.source.r2BucketName, destinationBucket: env.preview.r2BucketName, cacheRoot: evidence });
      const checkpoints: Record<string, unknown> = {};
      const queue = [...media];
      await Promise.all(Array.from({ length: 12 }, async () => {
        while (queue.length) {
          const object = queue.shift()!;
          checkpoints[object.key] = { status: await transferMediaObject(object, io), sha256: object.sha256, bytes: object.bytes };
          writeFileSync(resolve(evidence, "preview-media-checkpoints.json"), JSON.stringify({ manifestSha256: args.sha256, verifiedAt: new Date().toISOString(), objects: checkpoints }, null, 2));
          if (Object.keys(checkpoints).length % 100 === 0) console.log(JSON.stringify({ verifiedMedia: Object.keys(checkpoints).length, total: media.length }));
        }
      }));
      // Recheck every pinned source object immediately before exposing database references.
      const heads = media.filter(o => o.origin === "production");
      await Promise.all(Array.from({ length: 8 }, async () => {
        while (heads.length) {
          const object = heads.shift()!;
          const response = await sourceStorage.send(new HeadObjectCommand({ Bucket: env.source.r2BucketName, Key: object.key, IfMatch: object.sourceEtag }));
          if (response.ETag !== object.sourceEtag || response.ContentLength !== object.bytes) throw new Error("Transfer source media drifted.");
        }
      }));
      if (sourceHash(await readSnapshot("source")) !== pinned.sourceSnapshotHash) throw new Error("Transfer source database drifted.");
      const client = await previewPool.connect();
      try { await applyContentTransfer(client, before, plan, guard); } finally { client.release(); }
      writeFileSync(resolve(evidence, "preview-import-result.json"), JSON.stringify({ appliedAt: new Date().toISOString(), manifestSha256: args.sha256, changes: plan.changes.length, aliases: plan.aliasInserts.length, verifiedMedia: media.length, cacheInvalidationPending: true }, null, 2));
      console.log(JSON.stringify({ mode: "applied", changes: plan.changes.length, verifiedMedia: media.length, cacheInvalidationPending: true }));
    } finally { sourceStorage.destroy(); destinationStorage.destroy(); }
  } finally { await Promise.all([sourcePool.end(), previewPool.end()]); }
}
main().catch((error: unknown) => {
  const diagnostic = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number }; cause?: { code?: string } };
  if (diagnostic.name === "InvalidRequest" && error instanceof Error) console.error(error.message.replace(/https?:\/\/\S+/g, "[URL]").replace(/[A-Za-z0-9_\-+/=]{20,}/g, "[redacted]"));
  console.error(JSON.stringify({ errorType: diagnostic.name, code: /^[A-Za-z0-9_]+$/.test(diagnostic.code ?? "") ? diagnostic.code : undefined, httpStatus: diagnostic.$metadata?.httpStatusCode, causeCode: /^[A-Za-z0-9_]+$/.test(diagnostic.cause?.code ?? "") ? diagnostic.cause?.code : undefined }));
  const message = error instanceof Error && /^(Transfer|Profile alias conflict)/.test(error.message) ? error.message : "Transfer failed; raw driver details suppressed. Inspect checkpoints; database transactions roll back on assertion failure.";
  console.error(message); process.exitCode = 1;
});

