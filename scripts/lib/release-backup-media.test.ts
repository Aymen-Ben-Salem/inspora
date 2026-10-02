import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureReleaseMedia, previewBackupFiles, storePreviewMedia } from "./release-backup-media";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytes = Buffer.from("retained work");
const object = { bucket: "inspora-media-preview", key: "logos/original.webp", size: bytes.length, etag: '"version-one"' };
const buckets = ["inspora-media-preview", "inspora-submissions-preview"];

describe("local recovery path containment", () => {
  it("stores digest-verified bytes without overwriting existing recovery objects", () => {
    const root = mkdtempSync(join(tmpdir(), "inspora-backup-path-"));
    mkdirSync(join(root, "private-recovery"));
    const p = storePreviewMedia(root, sha(bytes), bytes);
    expect(readFileSync(join(root, p))).toEqual(bytes);
    expect(storePreviewMedia(root, sha(bytes), bytes)).toBe(p);
  });
  it("rejects a recovery-directory junction before writing outside the workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "inspora-backup-path-"));
    const external = mkdtempSync(join(tmpdir(), "inspora-backup-external-"));
    mkdirSync(join(root, "private-recovery"));
    symlinkSync(external, join(root, "private-recovery/preview-media-full"), "junction");
    expect(() => storePreviewMedia(root, sha(bytes), bytes)).toThrow(/leaves recovery root/);
    expect(existsSync(join(external, sha(bytes)))).toBe(false);
  });
});

function provider(options: { drift?: boolean; corrupt?: boolean; snapshotDrift?: boolean } = {}) {
  let lists = 0, checks = 0;
  const saved = new Map<string, Uint8Array>();
  return {
    buckets,
    list: async () => ++lists === 2 && options.drift ? [{ ...object, etag: '"version-two"' }] : [object],
    get: async (_o: typeof object) => ({ bytes: options.corrupt ? Buffer.from("wrong") : bytes, etag: object.etag, contentType: "image/webp" }),
    store: async (digest: string, data: Uint8Array) => { saved.set(digest, data); return `private-recovery/preview-media-full/${digest}`; },
    checkSnapshot: async () => { if (++checks === 2 && options.snapshotDrift) throw Error("database drift"); },
  };
}

describe("preview release media recovery", () => {
  it("captures complete media with metadata and rechecks the database snapshot", async () => {
    const report = await captureReleaseMedia(provider());
    expect(report.count).toBe(1);
    expect(report.objects[0]).toMatchObject({ ...object, sha256: sha(bytes), contentType: "image/webp" });
    expect(report.databaseSnapshotMatches).toBe(true);
  });
  it("rejects bucket changes during capture", async () => {
    await expect(captureReleaseMedia(provider({ drift: true }))).rejects.toThrow(/inventory/i);
  });
  it("rejects database changes during capture", async () => {
    await expect(captureReleaseMedia(provider({ snapshotDrift: true }))).rejects.toThrow(/database drift/);
  });
  it("rejects incomplete object bytes", async () => {
    await expect(captureReleaseMedia(provider({ corrupt: true }))).rejects.toThrow(/bytes/i);
  });
  it("rejects duplicate or out-of-scope inventory entries", async () => {
    await expect(captureReleaseMedia({ ...provider(), list: async () => [object, object] })).rejects.toThrow(/inventory/i);
    await expect(captureReleaseMedia({ ...provider(), list: async () => [{ ...object, bucket: "inspora-media-production" }] })).rejects.toThrow(/scope/i);
  });
  it("verifies cached bytes instead of trusting a cache entry", async () => {
    await expect(captureReleaseMedia({ ...provider(), head: async () => ({ etag: object.etag }), cached: async () => ({ bytes: Buffer.from("wrong"), sha256: sha(bytes) }) })).rejects.toThrow(/cached/i);
  });
});

async function manifest() {
  return { ...await captureReleaseMedia(provider()), label: "20261003T120000Z", previewCaptureSha256: "a".repeat(64) };
}

describe("protected backup includes preview media", () => {
  const identity = { label: "20261003T120000Z", previewCaptureSha256: "a".repeat(64) };
  it("includes selected work bytes with digest keys in the protected upload plan", async () => {
    const files = previewBackupFiles(await manifest(), identity, () => bytes);
    expect(files).toEqual([{ localPath: `private-recovery/preview-media-full/${sha(bytes)}`, key: `media/${sha(bytes)}`, sha256: sha(bytes), size: bytes.length }]);
  });
  it("rejects an older database/media snapshot pairing", async () => {
    const m = await manifest();
    expect(() => previewBackupFiles(undefined, identity, () => bytes)).toThrow();
    expect(() => previewBackupFiles({ ...identity, ...{} }, identity, () => bytes)).toThrow();
    expect(() => previewBackupFiles({ ...m, label: "20261002T120000Z" }, identity, () => bytes)).toThrow();
  });
  it("requires verified capture evidence and matching local bytes", async () => {
    const m = await manifest();
    expect(() => previewBackupFiles({ ...m, databaseSnapshotMatches: false }, identity, () => bytes)).toThrow();
    expect(() => previewBackupFiles(m, identity, () => Buffer.from("changed"))).toThrow(/bytes/i);
    expect(() => previewBackupFiles(m, { ...identity, previewCaptureSha256: "b".repeat(64) }, () => bytes)).toThrow();
  });
  it("rejects unsafe paths, incorrect totals and non-preview buckets", async () => {
    const m = await manifest();
    for (const change of [{ localPath: "../.env.preview.local" }, { bucket: "inspora-media-production" }]) {
      expect(() => previewBackupFiles({ ...m, objects: [{ ...m.objects[0], ...change }] }, identity, () => bytes)).toThrow();
    }
    expect(() => previewBackupFiles({ ...m, count: 2 }, identity, () => bytes)).toThrow();
  });
});
