import { expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { prepareCreatorAvatar } from "./avatar-processing";

const photo = (width: number, height: number) => sharp({ create: { width, height, channels: 4, background: "#ee4433" } }).png().toBuffer();

it.each([[48, 48], [256, 256], [1200, 399], [399, 1200]])("rejects actual undersized pixels %sx%s", async (width, height) => {
  await expect(prepareCreatorAvatar(await photo(width, height))).rejects.toThrow("400 × 400");
});

it.each([[1200, 800, 512], [400, 900, 400], [600, 450, 450]])("stores a real square WebP without enlargement (%sx%s)", async (width, height, output) => {
  const bytes = await prepareCreatorAvatar(await photo(width, height));
  expect(await sharp(bytes).metadata()).toMatchObject({ width: output, height: output, format: "webp" });
});

it("rejects corrupt and vector content even if a URL or upload claims to be a photo", async () => {
  for (const bytes of [Buffer.from("not an image"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"/>')]) {
    await expect(prepareCreatorAvatar(bytes)).rejects.toThrow();
  }
});

it("rejects oversized bytes before decoding", async () => {
  await expect(prepareCreatorAvatar(new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toThrow("10 MB");
});

it("retains valid optimized WebP bytes without another lossy encode", async () => {
  const bytes = await sharp(await photo(512, 512)).webp({ quality: 84 }).toBuffer();
  expect(await prepareCreatorAvatar(bytes)).toEqual(bytes);
});
