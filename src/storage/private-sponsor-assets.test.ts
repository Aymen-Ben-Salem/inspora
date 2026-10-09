import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPrivateSponsorStorage } from "./private-sponsor-assets";
it("freezes verified sponsor bytes in a distinct private owner prefix and rejects foreign keys", async () => {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const storage = createPrivateSponsorStorage({
    bucket: "private-fixture",
    randomUUID,
    signPut: async () => "signed",
    get: async ({ key }) => objects.get(key) ?? null,
    putImmutable: async ({ key, bytes, contentType }) => {
      objects.set(key, { bytes, contentType });
    },
    delete: async ({ key }) => {
      objects.delete(key);
    },
  });
  const id = randomUUID();
  const signed = await storage.prepare({
    ownerUserId: "owner-a",
    uploadId: id,
    contentType: "image/png",
    sizeBytes: 99,
  });
  expect(signed.stagingKey.startsWith("sponsorships/")).toBe(true);
  const bytes = await sharp({
    create: { width: 64, height: 32, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
  objects.set(signed.stagingKey, { bytes, contentType: "image/png" });
  const input = {
    ownerUserId: "owner-a",
    uploadId: id,
    stagingKey: signed.stagingKey,
    contentType: "image/png",
    sizeBytes: bytes.length,
    kind: "logo" as const,
  };
  await expect(
    storage.freeze({ ...input, ownerUserId: "owner-b" }),
  ).rejects.toThrow("key is invalid");
  const frozen = await storage.freeze(input);
  expect(frozen.objectKey).toContain("/source/original.png");
  expect(frozen.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(objects.has(signed.stagingKey)).toBe(false);
});
