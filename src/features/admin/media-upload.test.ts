import { describe, expect, it } from "vitest";

import {
  getMediaUploadLimit,
  isAcceptedUploadForKind,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
} from "./media-upload";

describe("media upload limits", () => {
  it("uses separate image and video limits", () => {
    expect(getMediaUploadLimit("image/gif")).toBe(MAX_IMAGE_UPLOAD_BYTES);
    expect(getMediaUploadLimit("image/jpeg")).toBe(MAX_IMAGE_UPLOAD_BYTES);
    expect(getMediaUploadLimit("video/mp4")).toBe(MAX_VIDEO_UPLOAD_BYTES);
  });

  it("limits creator avatars to image uploads", () => {
    expect(isAcceptedUploadForKind("creator-avatar", "image/png")).toBe(true);
    expect(isAcceptedUploadForKind("creator-avatar", "image/gif")).toBe(false);
    expect(isAcceptedUploadForKind("creator-avatar", "video/mp4")).toBe(false);
    expect(isAcceptedUploadForKind("post-media", "video/mp4")).toBe(true);
  });
});
