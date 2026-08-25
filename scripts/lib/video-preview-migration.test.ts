import { describe, expect, it } from "vitest";

import {
  buildDevelopmentPreviewStorageKey,
  partitionVideoPreviewsBySource,
  selectPendingVideoPreviews,
  type VideoPreviewCandidate,
} from "./video-preview-migration";

const candidates: VideoPreviewCandidate[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    resourceType: "post_media",
    sourceStorageKey: "posts/original.mp4",
    sourceUrl: "https://media.inspora.design/posts/original.mp4",
    preview: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    resourceType: "sponsor",
    sourceStorageKey: "sponsors/original.webm",
    sourceUrl: "https://media.inspora.design/sponsors/original.webm",
    preview: null,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    resourceType: "post_media",
    sourceStorageKey: "posts/already-done.mp4",
    sourceUrl: "https://media.inspora.design/posts/already-done.mp4",
    preview: {
      url: "https://example.r2.dev/posts/previews/already-done.mp4",
      storageKey: "posts/previews/already-done.mp4",
      width: 1080,
      height: 720,
      bytes: 1234,
      format: "mp4",
    },
  },
];

describe("development video preview migration", () => {
  it("selects only rows without an existing preview and honors the limit", () => {
    expect(selectPendingVideoPreviews(candidates)).toHaveLength(2);
    expect(selectPendingVideoPreviews(candidates, 1).map((item) => item.id)).toEqual([
      candidates[0]?.id,
    ]);
  });

  it("separates missing development objects before applying the execution limit", () => {
    const result = partitionVideoPreviewsBySource(
      candidates,
      new Set([candidates[1]!.sourceStorageKey]),
      new Set(),
      1,
    );

    expect(result.available.map((item) => item.id)).toEqual([candidates[1]!.id]);
    expect(result.missing.map((item) => item.id)).toEqual([candidates[0]!.id]);
  });

  it("uses an allowlisted HTTPS source URL when the dev object is absent", () => {
    const result = partitionVideoPreviewsBySource(
      candidates,
      new Set(),
      new Set(["media.inspora.design"]),
      1,
    );

    expect(result.available).toHaveLength(1);
    expect(result.available[0]?.sourceKind).toBe("public-url");
    expect(result.missing).toHaveLength(0);
  });

  it("rejects non-HTTPS and untrusted public sources", () => {
    const unsafe = candidates.slice(0, 2).map((candidate, index) => ({
      ...candidate,
      sourceUrl:
        index === 0
          ? "http://media.inspora.design/posts/original.mp4"
          : "https://untrusted.example/video.mp4",
    }));
    const result = partitionVideoPreviewsBySource(
      unsafe,
      new Set(),
      new Set(["media.inspora.design"]),
    );

    expect(result.available).toHaveLength(0);
    expect(result.missing).toHaveLength(2);
  });

  it("creates deterministic development preview keys", () => {
    expect(buildDevelopmentPreviewStorageKey(candidates[0]!)).toBe(
      "posts/previews/11111111-1111-4111-8111-111111111111.mp4",
    );
    expect(buildDevelopmentPreviewStorageKey(candidates[1]!)).toBe(
      "sponsors/previews/22222222-2222-4222-8222-222222222222.mp4",
    );
  });
});
