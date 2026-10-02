import { describe, expect, it, vi } from "vitest";
import { conditionalPreviewCopy, createMediaTransferIO, transferMediaObject, type TransferObject } from "./content-transfer-media";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeadObjectCommand, PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const object: TransferObject = { key: "video/preview.mp4", bytes: 3, sha256: "a".repeat(64), sourceEtag: '"source"', localPath: "cache/file" };
describe("preview media transfer", () => {
  it("signs server-side copies with source pin and atomic destination no-overwrite condition", async () => {
    const handle = vi.fn(async request => {
      expect(request.method).toBe("PUT");
      expect(request.headers["cf-copy-destination-if-none-match"]).toBe("*");
      expect(request.headers["x-amz-copy-source-if-match"]).toBe(object.sourceEtag);
      expect(request.headers["x-amz-copy-source"]).toBe("production/video/preview.mp4");
      expect(request.headers.authorization).toContain("cf-copy-destination-if-none-match");
      return { response: { statusCode: 200, headers: {}, body: Buffer.from('<CopyObjectResult><ETag>"source"</ETag></CopyObjectResult>') } };
    });
    const client = new S3Client({ region: "auto", endpoint: "https://account.r2.cloudflarestorage.com", credentials: { accessKeyId: "test", secretAccessKey: "test" }, requestHandler: { handle } });
    try { await client.send(conditionalPreviewCopy(object, "production", "preview")); expect(handle).toHaveBeenCalledOnce(); }
    finally { client.destroy(); }
    expect(() => conditionalPreviewCopy(object, "same", "same")).toThrow();
    expect(() => conditionalPreviewCopy({ ...object, origin: "preview" }, "production", "preview")).toThrow();
  });
  it.each([true, false])("verifies conditional-create races with identical bytes=%s", async identical => {
    const root = mkdtempSync(join(tmpdir(), "transfer-media-test-"));
    const bytes = Buffer.from("abc");
    writeFileSync(join(root, "object"), bytes);
    const item = { ...object, localPath: "object", sha256: createHash("sha256").update(bytes).digest("hex") };
    const sourceSend = vi.fn(async command => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      expect(command.input).toEqual({ Bucket: "production", Key: item.key, IfMatch: item.sourceEtag });
      return { ETag: item.sourceEtag, ContentLength: bytes.length };
    });
    let gets = 0;
    const destinationSend = vi.fn(async command => {
      if (command instanceof PutObjectCommand) {
        expect(command.input.IfNoneMatch).toBe("*");
        expect(command.input.Bucket).toBe("preview");
        expect(command.input.ContentMD5).toBe(createHash("md5").update(bytes).digest("base64"));
        throw { $metadata: { httpStatusCode: 412 } };
      }
      expect(command).toBeInstanceOf(GetObjectCommand);
      if (++gets === 1) throw { $metadata: { httpStatusCode: 404 } };
      return { Body: (async function* () { yield identical ? bytes : Buffer.from("bad"); })() };
    });
    try {
      const io = createMediaTransferIO({ assertTarget: vi.fn(), source: { send: sourceSend } as unknown as S3Client, destination: { send: destinationSend } as unknown as S3Client, sourceBucket: "production", destinationBucket: "preview", cacheRoot: root });
      if (identical) expect(await transferMediaObject(item, io)).toBe("copied-verified");
      else await expect(transferMediaObject(item, io)).rejects.toThrow(/verification/);
      expect(sourceSend).toHaveBeenCalledOnce();
    } finally { rmSync(root, { recursive: true }); }
  });
  it("never uploads a missing preserved preview object", async () => {
    const put = vi.fn(), verifySource = vi.fn();
    const io = { assertTarget: vi.fn(), digest: vi.fn().mockResolvedValue(null), put, verifySource };
    await expect(transferMediaObject({ ...object, origin: "preview" }, io)).rejects.toThrow(/preserved/);
    expect(put).not.toHaveBeenCalled(); expect(verifySource).not.toHaveBeenCalled();
    io.digest.mockResolvedValue(object);
    expect(await transferMediaObject({ ...object, origin: "preview" }, io)).toBe("existing-verified");
  });
  it("rejects the environment before any network operation", async () => {
    const digest = vi.fn(), put = vi.fn();
    await expect(transferMediaObject(object, { assertTarget: () => { throw Error("wrong target"); }, digest, put, verifySource: vi.fn() })).rejects.toThrow("wrong target");
    expect(digest).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
  });
  it("resumes identical objects without writing", async () => {
    const put = vi.fn();
    const status = await transferMediaObject(object, { assertTarget: vi.fn(), digest: vi.fn().mockResolvedValue(object), put, verifySource: vi.fn() });
    expect(status).toBe("existing-verified"); expect(put).not.toHaveBeenCalled();
  });
  it("aborts conflicting destination bytes", async () => {
    const put = vi.fn();
    await expect(transferMediaObject(object, { assertTarget: vi.fn(), digest: vi.fn().mockResolvedValue({ ...object, sha256: "b".repeat(64) }), put, verifySource: vi.fn() })).rejects.toThrow(/conflict/);
    expect(put).not.toHaveBeenCalled();
  });
  it("verifies source before conditional creation and verifies destination after upload", async () => {
    const events: string[] = [];
    const digest = vi.fn().mockResolvedValueOnce(null).mockImplementationOnce(async () => { events.push("verify-destination"); return object; });
    const status = await transferMediaObject(object, { assertTarget: vi.fn(), digest, verifySource: async () => { events.push("verify-source"); }, put: async () => { events.push("conditional-put"); } });
    expect(events).toEqual(["verify-source", "conditional-put", "verify-destination"]);
    expect(status).toBe("copied-verified");
  });
  it("fails verification and can resume an interrupted write without duplicate uploads", async () => {
    const put = vi.fn();
    const digest = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(Error("interrupted"));
    const io = { assertTarget: vi.fn(), digest, put, verifySource: vi.fn() };
    await expect(transferMediaObject(object, io)).rejects.toThrow("interrupted");
    digest.mockResolvedValue(object);
    expect(await transferMediaObject(object, io)).toBe("existing-verified");
    expect(put).toHaveBeenCalledTimes(1);
  });
});
