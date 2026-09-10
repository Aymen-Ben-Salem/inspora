import { describe, expect, it } from "vitest";

import {
  getMediaUploadLimit,
  isAcceptedUploadForKind,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  MAX_WEBSITE_IMAGE_UPLOAD_BYTES,
} from "./media-upload";

describe("media upload limits", () => {
  it("uses separate image, section, and video limits", () => {
    expect(getMediaUploadLimit("image/gif")).toBe(MAX_IMAGE_UPLOAD_BYTES);
    expect(getMediaUploadLimit("image/jpeg")).toBe(MAX_IMAGE_UPLOAD_BYTES);
    expect(getMediaUploadLimit("image/jpeg", "website-section")).toBe(
      MAX_WEBSITE_IMAGE_UPLOAD_BYTES,
    );
    expect(getMediaUploadLimit("video/mp4")).toBe(MAX_VIDEO_UPLOAD_BYTES);
  });

  it("accepts recording videos and only static website images", () => {
    expect(isAcceptedUploadForKind("website-recording", "video/mp4")).toBe(true);
    expect(isAcceptedUploadForKind("website-recording", "video/webm")).toBe(true);
    expect(isAcceptedUploadForKind("website-recording", "image/png")).toBe(false);
    expect(isAcceptedUploadForKind("website-section", "image/webp")).toBe(true);
    expect(isAcceptedUploadForKind("website-section", "image/gif")).toBe(false);
    expect(isAcceptedUploadForKind("website-favicon", "video/mp4")).toBe(false);
  });

  it("keeps existing post and logo policies", () => {
    expect(isAcceptedUploadForKind("post-media", "video/mp4")).toBe(true);
    expect(isAcceptedUploadForKind("logo-media", "image/png")).toBe(true);
    expect(isAcceptedUploadForKind("logo-media", "image/gif")).toBe(false);
    expect(isAcceptedUploadForKind("logo-media", "video/mp4")).toBe(false);
  });
});
