import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

export const PREVIEW_MEDIA_BUCKETS = ["inspora-media-preview", "inspora-submissions-preview"];
export const backupSha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fail = (reason: string): never => { throw Error("Backup " + reason); };
export function storePreviewMedia(root: string, digest: string, bytes: Uint8Array): string {
  if (!/^[a-f0-9]{64}$/.test(digest) || backupSha256(bytes) !== digest) fail("media digest rejected");
  const physicalRoot = realpathSync(root);
  const contained = (p: string) => {
    const physical = realpathSync(p);
    if (!physical.startsWith(physicalRoot + sep)) fail("media path leaves recovery root");
    return physical;
  };
  const parent = contained(resolve(physicalRoot, "private-recovery"));
  const destination = resolve(parent, "preview-media-full");
  if (!existsSync(destination)) mkdirSync(destination);
  const directory = contained(destination), file = resolve(directory, digest);
  if (!existsSync(file)) writeFileSync(file, bytes, { flag: "wx" });
  if (backupSha256(readFileSync(contained(file))) !== digest) fail("local media bytes changed");
  return "private-recovery/preview-media-full/" + digest;
}
export function releaseSnapshotLabel(selector: string): string {
  if (!/^snapshot-\d{8}T\d{6}Z$/.test(selector)) fail("snapshot selector rejected");
  const label = selector.slice(9);
  const iso = label.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().replaceAll("-", "").replaceAll(":", "").replace(".000Z", "Z") !== label) fail("snapshot timestamp rejected");
  return label;
}
export type MediaObject = { bucket: string; key: string; size: number; etag: string; lastModified?: string };
export type ObjectBody = { bytes: Uint8Array; etag: string; contentType?: string; cacheControl?: string; contentDisposition?: string; contentEncoding?: string; contentLanguage?: string; metadata?: Record<string, string> };
export type BackupObject = MediaObject & Omit<ObjectBody, "bytes"> & { sha256: string; localPath: string };

export async function captureReleaseMedia(io: {
  buckets: string[];
  list(): Promise<MediaObject[]>;
  get(object: MediaObject): Promise<ObjectBody>;
  cached?(object: MediaObject): Promise<{ bytes: Uint8Array; sha256: string } | undefined>;
  head?(object: MediaObject): Promise<Omit<ObjectBody, "bytes">>;
  store(sha256: string, bytes: Uint8Array): Promise<string>;
  checkSnapshot(): Promise<void>;
}) {
  const inventory = (objects: MediaObject[]) => {
    if (new Set(objects.map(o => o.bucket + "/" + o.key)).size !== objects.length) fail("duplicate inventory entry");
    for (const o of objects) if (!io.buckets.includes(o.bucket) || !o.key || !o.etag || !Number.isSafeInteger(o.size) || o.size < 0) fail("inventory scope rejected");
    return [...objects].sort((a, b) => (a.bucket + "/" + a.key).localeCompare(b.bucket + "/" + b.key));
  };
  await io.checkSnapshot();
  const before = inventory(await io.list()), pending = [...before], objects: BackupObject[] = [];
  let reused = 0;
  const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    let o: MediaObject | undefined;
    while ((o = pending.shift())) {
      const cache = io.head ? await io.cached?.(o) : undefined;
      let body: ObjectBody;
      if (cache) {
        if (cache.bytes.length !== o.size || backupSha256(cache.bytes) !== cache.sha256) fail("cached bytes changed");
        body = { ...await io.head!(o), bytes: cache.bytes }; reused++;
      } else body = await io.get(o);
      if (body.bytes.length !== o.size || body.etag !== o.etag) fail("object bytes or version drift");
      const { bytes, ...metadata } = body;
      const sha256 = backupSha256(bytes), localPath = await io.store(sha256, bytes);
      objects.push({ ...o, ...metadata, sha256, localPath });
    }
  }));
  const rejected = results.find(r => r.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  if (JSON.stringify(before) !== JSON.stringify(inventory(await io.list()))) fail("bucket inventory changed during capture");
  await io.checkSnapshot();
  objects.sort((a, b) => (a.bucket + "/" + a.key).localeCompare(b.bucket + "/" + b.key));
  return { readOnly: true, remoteMutations: 0, buckets: io.buckets, count: objects.length, bytes: objects.reduce((n, o) => n + o.size, 0), reused, beforeAfterInventoryMatches: true, allLocalBytesVerified: true, databaseSnapshotMatches: true, objects };
}

export function previewBackupFiles(raw: unknown, identity: { label: string; previewCaptureSha256: string }, read: (localPath: string) => Uint8Array) {
  const m = raw as ReturnType<typeof JSON.parse>;
  if (!m || m.label !== identity.label || m.previewCaptureSha256 !== identity.previewCaptureSha256 || m.readOnly !== true || m.remoteMutations !== 0 || m.beforeAfterInventoryMatches !== true || m.allLocalBytesVerified !== true || m.databaseSnapshotMatches !== true || !Array.isArray(m.objects) || !Array.isArray(m.buckets) || [...m.buckets].sort().join() !== [...PREVIEW_MEDIA_BUCKETS].sort().join()) fail("preview media capture identity/evidence rejected");
  const objects = m.objects as BackupObject[];
  if (objects.length !== m.count || objects.reduce((n, o) => n + o.size, 0) !== m.bytes || new Set(objects.map(o => o.bucket + "/" + o.key)).size !== objects.length) fail("preview media inventory totals rejected");
  const files = new Map<string, { localPath: string; key: string; sha256: string; size: number }>();
  for (const o of objects) {
    if (!PREVIEW_MEDIA_BUCKETS.includes(o.bucket) || !o.key || !o.etag || !Number.isSafeInteger(o.size) || o.size < 0 || !/^[a-f0-9]{64}$/.test(o.sha256) || o.localPath !== "private-recovery/preview-media-full/" + o.sha256) fail("preview media scope rejected");
    const bytes = read(o.localPath);
    if (bytes.length !== o.size || backupSha256(bytes) !== o.sha256) fail("preview media local bytes changed");
    files.set(o.sha256, { localPath: o.localPath, key: "media/" + o.sha256, sha256: o.sha256, size: o.size });
  }
  return [...files.values()];
}
