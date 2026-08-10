import { describe, expect, it } from "vitest";

import type { TargetSnapshot } from "./types";
import { targetStorageKeys } from "./types";

describe("media migration target keys", () => {
  it("collects primary, responsive, and poster objects without nulls", () => {
    const target: TargetSnapshot = {
      kind: "post_media",
      id: "10d0d6b7-98cb-478d-a0b6-a85bfd01d841",
      type: "video",
      url: "https://media.inspora.design/posts/video.mp4",
      posterUrl: "https://media.inspora.design/posts/poster.webp",
      storageProvider: "r2",
      storageKey: "posts/video.mp4",
      mimeType: "video/mp4",
      sourceMimeType: "image/gif",
      sizeBytes: 100,
      variants: [
        {
          url: "https://media.inspora.design/posts/640.webp",
          storageKey: "posts/640.webp",
          width: 640,
          height: 480,
          bytes: 50,
          format: "webp",
        },
      ],
      posterStorageKey: "posts/poster.webp",
      alt: "Example",
      width: 1200,
      height: 900,
    };

    expect(targetStorageKeys(target)).toEqual([
      "posts/video.mp4",
      "posts/640.webp",
      "posts/poster.webp",
    ]);
  });

  it("collects a creator avatar object", () => {
    expect(
      targetStorageKeys({
        kind: "creator_avatar",
        id: "18b2f012-6d57-4222-80df-0c48ad754b09",
        avatarUrl: "https://media.inspora.design/creators/avatar.webp",
        avatarStorageProvider: "r2",
        avatarStorageKey: "creators/avatar.webp",
      }),
    ).toEqual(["creators/avatar.webp"]);
  });
});
