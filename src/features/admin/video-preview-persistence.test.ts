import { describe, expect, it } from "vitest";

import { parseAdminPostForm } from "./post-validation";
import { parseAdminSponsorForm } from "./sponsor-validation";

const videoPreview = {
  url: "https://pub-example.r2.dev/posts/example-feed.mp4",
  storageKey: "posts/example-feed.mp4",
  width: 1080,
  height: 1920,
  bytes: 2_000_000,
  format: "mp4" as const,
};

function withR2BaseUrl<T>(operation: () => T) {
  const previousBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  process.env.R2_PUBLIC_BASE_URL = "https://pub-example.r2.dev";
  try {
    return operation();
  } finally {
    if (previousBaseUrl === undefined) delete process.env.R2_PUBLIC_BASE_URL;
    else process.env.R2_PUBLIC_BASE_URL = previousBaseUrl;
  }
}

function videoPostForm() {
  const form = new FormData();
  form.set("slug", "video-project");
  form.set("title", "Video project");
  form.set("creatorId", "");
  form.set("creatorName", "Example Studio");
  form.set("creatorUrl", "");
  form.set("creatorAvatarUrl", "/brand/default-avatar.svg");
  form.set("description", "A motion project.");
  form.set("category", "Motion");
  form.set("sourceUrl", "https://example.com/project");
  form.set("status", "draft");
  form.set(
    "media",
    JSON.stringify([
      {
        type: "video",
        url: "https://pub-example.r2.dev/posts/example-original.mp4",
        storageProvider: "r2",
        storageKey: "posts/example-original.mp4",
        videoPreview,
        alt: "Example motion clip",
        width: 3052,
        height: 2160,
      },
    ]),
  );
  return form;
}

function videoSponsorForm() {
  const form = new FormData();
  form.set("title", "Example sponsor");
  form.set("url", "https://example.com");
  form.set("mediaType", "video");
  form.set("mediaUrl", "https://pub-example.r2.dev/sponsors/original.mp4");
  form.set("mediaStorageProvider", "r2");
  form.set("mediaStorageKey", "sponsors/original.mp4");
  form.set("mediaVideoPreview", JSON.stringify(videoPreview));
  form.set("mediaWidth", "3052");
  form.set("mediaHeight", "2160");
  form.set("mediaAlt", "Sponsor motion");
  form.set("isActive", "true");
  return form;
}

describe("video preview persistence validation", () => {
  it("preserves a managed post feed rendition", () => {
    withR2BaseUrl(() => {
      expect(parseAdminPostForm(videoPostForm()).media[0]?.videoPreview).toEqual(
        videoPreview,
      );
    });
  });

  it("preserves a managed sponsor feed rendition", () => {
    withR2BaseUrl(() => {
      expect(
        parseAdminSponsorForm(videoSponsorForm()).mediaVideoPreview,
      ).toEqual(videoPreview);
    });
  });
});
