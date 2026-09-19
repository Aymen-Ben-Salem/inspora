import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPrivateSubmissionStorage,
  isPrivateObjectMissingError,
} from "./private-submissions";

function pngBytes() {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2/1sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
}

describe("private submission storage", () => {
  it("recognizes provider missing-object errors without swallowing other failures", () => {
    expect(isPrivateObjectMissingError({ name: "NoSuchKey" })).toBe(true);
    expect(isPrivateObjectMissingError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
    expect(isPrivateObjectMissingError(new Error("network unavailable"))).toBe(false);
  });

  it("uses the private bucket and an owner-bound random staging key", async () => {
    const signed: Array<{ bucket: string; key: string }> = [];
    const storage = createPrivateSubmissionStorage({
      bucket: "private-preview-fixture",
      signPut: async (input) => {
        signed.push({ bucket: input.bucket, key: input.key });
        return "https://private-upload.invalid/signed";
      },
      get: async () => null,
      putImmutable: async () => undefined,
      delete: async () => undefined,
      randomUUID: () => "9dcb54ff-b9a5-4e50-9749-a761166228f7",
    });

    const prepared = await storage.prepare({
      ownerUserId: "user_alpha",
      uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865",
      contentType: "image/png",
      sizeBytes: 12,
    });

    expect(signed).toEqual([
      {
        bucket: "private-preview-fixture",
        key: prepared.stagingKey,
      },
    ]);
    expect(prepared.stagingKey).toMatch(
      /^submissions\/[a-f0-9]{32}\/b5f3146c-d8b4-4727-8f31-388976cf9865\/staging\/9dcb54ff-b9a5-4e50-9749-a761166228f7\.png$/,
    );
    expect(prepared.ticket.headers).toEqual({
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
    });
  });

  it("rejects a mismatched size and deletes only the staged object", async () => {
    const deleted: string[] = [];
    const bytes = pngBytes();
    const storage = createPrivateSubmissionStorage({
      bucket: "private-preview-fixture",
      signPut: async () => "https://private-upload.invalid/signed",
      get: async ({ key }) =>
        key.includes("/source/") ? null : { bytes, contentType: "image/png" },
      putImmutable: async () => undefined,
      delete: async ({ key }) => {
        deleted.push(key);
      },
      randomUUID: () => "9dcb54ff-b9a5-4e50-9749-a761166228f7",
    });

    await expect(
      storage.freeze({
        ownerUserId: "user_alpha",
        uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865",
        kind: "design",
        stagingKey:
          "submissions/6770675acd132b526e7b045f37b7be84/b5f3146c-d8b4-4727-8f31-388976cf9865/staging/9dcb54ff-b9a5-4e50-9749-a761166228f7.png",
        contentType: "image/png",
        sizeBytes: bytes.byteLength + 1,
      }),
    ).rejects.toThrow("did not match");
    expect(deleted).toEqual([
      "submissions/6770675acd132b526e7b045f37b7be84/b5f3146c-d8b4-4727-8f31-388976cf9865/staging/9dcb54ff-b9a5-4e50-9749-a761166228f7.png",
    ]);
  });

  it("validates file content, freezes an immutable source, then hashes the frozen bytes", async () => {
    const staged = pngBytes();
    const frozen = Uint8Array.from([...staged, 1]);
    const puts: string[] = [];
    let reads = 0;
    let frozenWritten = false;
    const storage = createPrivateSubmissionStorage({
      bucket: "private-preview-fixture",
      signPut: async () => "https://private-upload.invalid/signed",
      get: async ({ key }) => {
        reads += 1;
        if (key.includes("/source/") && !frozenWritten) return null;
        return {
          bytes: key.includes("/source/") ? frozen : staged,
          contentType: "image/png",
        };
      },
      putImmutable: async ({ key }) => {
        puts.push(key);
        frozenWritten = true;
      },
      delete: async () => undefined,
      randomUUID: () => "9dcb54ff-b9a5-4e50-9749-a761166228f7",
    });

    const result = await storage.freeze({
      ownerUserId: "user_alpha",
      uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865",
      kind: "design",
      stagingKey:
        "submissions/6770675acd132b526e7b045f37b7be84/b5f3146c-d8b4-4727-8f31-388976cf9865/staging/9dcb54ff-b9a5-4e50-9749-a761166228f7.png",
      contentType: "image/png",
      sizeBytes: staged.byteLength,
    });

    expect(puts).toEqual([
      "submissions/6770675acd132b526e7b045f37b7be84/b5f3146c-d8b4-4727-8f31-388976cf9865/source/original.png",
    ]);
    expect(reads).toBe(3);
    expect(result.digest).toBe(createHash("sha256").update(frozen).digest("hex"));
    expect(result.sizeBytes).toBe(frozen.byteLength);
  });

  it("rejects a truncated image even when its magic bytes match", async () => {
    const bytes = Uint8Array.from([0xff, 0xd8]);
    const storage = createPrivateSubmissionStorage({
      bucket: "private-preview-fixture",
      signPut: async () => "https://private-upload.invalid/signed",
      get: async ({ key }) =>
        key.includes("/source/") ? null : { bytes, contentType: "image/jpeg" },
      putImmutable: async () => undefined,
      delete: async () => undefined,
      randomUUID: () => "9dcb54ff-b9a5-4e50-9749-a761166228f7",
    });

    await expect(
      storage.freeze({
        ownerUserId: "user_alpha",
        uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865",
        kind: "design",
        stagingKey:
          "submissions/6770675acd132b526e7b045f37b7be84/b5f3146c-d8b4-4727-8f31-388976cf9865/staging/9dcb54ff-b9a5-4e50-9749-a761166228f7.jpg",
        contentType: "image/jpeg",
        sizeBytes: bytes.byteLength,
      }),
    ).rejects.toThrow("did not match");
  });

  it("rejects multi-page or animated images as logos", async () => {
    const bytes = pngBytes();
    const storage = createPrivateSubmissionStorage({
      bucket: "private-preview-fixture",
      signPut: async () => "https://private-upload.invalid/signed",
      get: async ({ key }) =>
        key.includes("/source/") ? null : { bytes, contentType: "image/png" },
      putImmutable: async () => undefined,
      delete: async () => undefined,
      randomUUID: () => "9dcb54ff-b9a5-4e50-9749-a761166228f7",
      inspectImage: async () => ({ width: 1, height: 1, pages: 2 }),
    });

    await expect(
      storage.freeze({
        ownerUserId: "user_alpha",
        uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865",
        kind: "logo",
        stagingKey:
          "submissions/6770675acd132b526e7b045f37b7be84/b5f3146c-d8b4-4727-8f31-388976cf9865/staging/9dcb54ff-b9a5-4e50-9749-a761166228f7.png",
        contentType: "image/png",
        sizeBytes: bytes.byteLength,
      }),
    ).rejects.toThrow("static image");
  });

  it("serves private bytes with no public URL and no-store response metadata", async () => {
    const storage = createPrivateSubmissionStorage({
      bucket: "private-preview-fixture",
      signPut: async () => "https://private-upload.invalid/signed",
      get: async () => ({ bytes: pngBytes(), contentType: "image/png" }),
      putImmutable: async () => undefined,
      delete: async () => undefined,
      randomUUID: () => "9dcb54ff-b9a5-4e50-9749-a761166228f7",
    });

    await expect(
      storage.read("submissions/owner/upload/source/original.png"),
    ).resolves.toEqual({
      bytes: pngBytes(),
      contentType: "image/png",
      cacheControl: "private, no-store",
    });
  });
});
