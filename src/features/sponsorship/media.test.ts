import sharp from "sharp";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { inspectSponsorMedia } from "./media-inspection";
it("verifies an animated original with per-frame dimensions while rejecting it as a brand asset", async () => {
  const pixels = Buffer.alloc(8 * 16 * 4);
  for (let i = 0; i < 128; i++) {
    pixels[i * 4 + (i < 64 ? 0 : 2)] = 255;
    pixels[i * 4 + 3] = 255;
  }
  const bytes = await sharp(pixels, {
    raw: { width: 8, height: 16, channels: 4, pageHeight: 8 },
  })
    .gif()
    .toBuffer();
  expect(await inspectSponsorMedia(bytes, "image/gif", "original")).toEqual({
    width: 8,
    height: 8,
  });
  await expect(
    inspectSponsorMedia(bytes, "image/gif", "wordmark"),
  ).rejects.toThrow("static");
});
it("verifies actual image bytes and dimensions and rejects active SVG or oversize media", async () => {
  const bytes = await sharp({
    create: { width: 120, height: 60, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();
  expect(await inspectSponsorMedia(bytes, "image/png", "wordmark")).toEqual({
    width: 120,
    height: 60,
  });
  await expect(
    inspectSponsorMedia(
      Buffer.from("<svg onload='alert(1)'/>"),
      "image/png",
      "icon",
    ),
  ).rejects.toThrow();
  await expect(
    inspectSponsorMedia(
      new Uint8Array(10 * 1024 * 1024 + 1),
      "image/png",
      "media",
    ),
  ).rejects.toThrow();
  await expect(
    inspectSponsorMedia(Buffer.from("<svg/>"), "image/svg+xml", "icon"),
  ).rejects.toThrow();
  await expect(
    inspectSponsorMedia(
      Buffer.from([0, 0, 0, 16, 102, 116, 121, 112]),
      "video/mp4",
      "media",
    ),
  ).rejects.toThrow();
});
