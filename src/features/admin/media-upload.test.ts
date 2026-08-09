import { describe, expect, it } from "vitest";

import {
  getMediaUploadLimit,
  isAcceptedUploadForKind,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  parseCloudinaryUploadResponse,
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

describe("Cloudinary upload responses", () => {
  it("maps an uploaded image to managed media", () => {
    expect(
      parseCloudinaryUploadResponse(
        {
          resource_type: "image",
          secure_url: "https://res.cloudinary.com/inspora/image/upload/v1/inspora/posts/cover.gif",
          public_id: "inspora/posts/cover",
          width: 1200,
          height: 900,
        },
        "animated-cover.gif",
      ),
    ).toEqual({
      type: "image",
      url: "https://res.cloudinary.com/inspora/image/upload/v1/inspora/posts/cover.gif",
      posterUrl: undefined,
      storageProvider: "cloudinary",
      storageKey: "inspora/posts/cover",
      alt: "animated cover",
      width: 1200,
      height: 900,
    });
  });

  it("creates a first-frame poster for uploaded video", () => {
    const media = parseCloudinaryUploadResponse(
      {
        resource_type: "video",
        secure_url: "https://res.cloudinary.com/inspora/video/upload/v1/inspora/posts/demo.mp4",
        public_id: "inspora/posts/demo",
        width: 1920,
        height: 1080,
      },
      "demo-reel.mp4",
    );

    expect(media?.posterUrl).toBe(
      "https://res.cloudinary.com/inspora/video/upload/so_0,f_jpg/v1/inspora/posts/demo.jpg",
    );
  });

  it("rejects incomplete or untrusted responses", () => {
    expect(
      parseCloudinaryUploadResponse(
        {
          resource_type: "image",
          secure_url: "https://example.com/not-cloudinary.jpg",
          public_id: "example",
          width: 100,
          height: 100,
        },
        "example.jpg",
      ),
    ).toBeNull();
  });
});
