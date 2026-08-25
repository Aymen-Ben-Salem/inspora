import { describe, expect, it } from "vitest";

import {
  VIDEO_PREVIEW_MAX_HEIGHT,
  VIDEO_PREVIEW_MAX_WIDTH,
  buildVideoPreviewFfmpegArgs,
} from "./gif-conversion";

describe("feed video preview transcoding", () => {
  it("caps decode dimensions while preserving aspect ratio", () => {
    expect(VIDEO_PREVIEW_MAX_WIDTH).toBe(1080);
    expect(VIDEO_PREVIEW_MAX_HEIGHT).toBe(1920);

    const args = buildVideoPreviewFfmpegArgs("input.mov", "output.mp4");
    const scale = args[args.indexOf("-vf") + 1];

    expect(scale).toBe(
      "scale=w='min(1080\\,iw)':h='min(1920\\,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    );
  });

  it("produces a silent, bounded, fast-start H.264 MP4 at no more than 30 FPS", () => {
    expect(buildVideoPreviewFfmpegArgs("input.webm", "preview.mp4")).toEqual([
      "-i",
      "input.webm",
      "-an",
      "-vf",
      "scale=w='min(1080\\,iw)':h='min(1920\\,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-fpsmax",
      "30",
      "-movflags",
      "+faststart",
      "preview.mp4",
    ]);
  });
});
