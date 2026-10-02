import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../admin/media-actions", () => ({
  completeMediaUploadAction: vi.fn(), createMediaUploadSignatureAction: vi.fn(),
  discardMediaUploadsAction: vi.fn(), getMediaConverterConfigurationAction: vi.fn(),
}));
vi.mock("../admin/image-optimization", () => ({
  isOptimizableStaticImage: (type: string) => ["image/png", "image/webp"].includes(type),
  optimizeStaticImage: vi.fn(),
}));
vi.mock("../admin/media-upload", async (original) => ({
  ...await original<typeof import("../admin/media-upload")>(),
  readMediaDimensions: vi.fn().mockResolvedValue({ width: 1200, height: 800 }),
}));
vi.mock("../admin/gif-conversion", () => ({ convertGifToMp4: vi.fn(), createVideoPreview: vi.fn() }));
vi.mock("../admin/video-processing", () => ({ createVideoPoster: vi.fn() }));

import { prepareAndUploadMedia } from "./prepare-and-upload";
import { optimizeStaticImage } from "../admin/image-optimization";
import { convertGifToMp4, createVideoPreview } from "../admin/gif-conversion";
import { createVideoPoster } from "../admin/video-processing";

describe("shared publication file preparation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["post-media", "logo-media"] as const)("keeps optimized variants and the primary for %s", async (kind) => {
    const file = new File(["png"], "source.png", { type: "image/png" });
    vi.mocked(optimizeStaticImage).mockResolvedValue([
      { file, width: 320, height: 240 }, { file, width: 640, height: 480 },
    ]);
    const operations = { upload: vi.fn().mockResolvedValue("uploaded"), converterConfiguration: vi.fn() };
    expect(await prepareAndUploadMedia(file, kind, operations)).toBe("uploaded");
    const bundle = operations.upload.mock.calls[0][0];
    expect(bundle.primary).toMatchObject({ width: 640, role: "primary", uploadKind: kind });
    expect(bundle.derivatives).toEqual([expect.objectContaining({ width: 320, role: "variant" })]);
  });

  it.each(["image/gif", "video/mp4", "video/webm"])("prepares %s with a poster and video preview", async (type) => {
    const file = new File(["source"], "source", { type });
    const video = new File(["mp4"], "converted.mp4", { type: "video/mp4" });
    vi.mocked(convertGifToMp4).mockResolvedValue(video);
    vi.mocked(createVideoPreview).mockResolvedValue(video);
    vi.mocked(createVideoPoster).mockResolvedValue({ file: new File(["poster"], "poster.webp", { type: "image/webp" }), width: 400, height: 300, videoWidth: 400, videoHeight: 300 });
    const operations = { upload: vi.fn().mockResolvedValue("uploaded"), converterConfiguration: vi.fn().mockResolvedValue({ coreUrl: "core", wasmUrl: "wasm" }) };
    await prepareAndUploadMedia(file, "post-media", operations);
    const bundle = operations.upload.mock.calls[0][0];
    expect(bundle.primary.file).toBe(type === "image/gif" ? video : file);
    expect(bundle.derivatives.map((item: { role: string }) => item.role)).toEqual(["video-preview", "poster"]);
    expect(convertGifToMp4).toHaveBeenCalledTimes(type === "image/gif" ? 1 : 0);
  });

  it("rejects unsupported logo media and stops when preparation fails", async () => {
    const operations = { upload: vi.fn(), converterConfiguration: vi.fn() };
    await expect(prepareAndUploadMedia(new File(["video"], "video.mp4", { type: "video/mp4" }), "logo-media", operations)).rejects.toThrow("static images");
    vi.mocked(optimizeStaticImage).mockRejectedValue(new Error("decode failed"));
    await expect(prepareAndUploadMedia(new File(["png"], "image.png", { type: "image/png" }), "post-media", operations)).rejects.toThrow("decode failed");
    expect(operations.upload).not.toHaveBeenCalled();
  });
});
