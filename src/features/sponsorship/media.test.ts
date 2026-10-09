import sharp from "sharp";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { inspectSponsorMedia } from "./media-inspection";
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
