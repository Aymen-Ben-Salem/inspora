import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ getDatabase: vi.fn(() => null) }));
vi.mock("@/db/schema", () => ({
  creators: {},
  websiteMedia: { role: {} },
  websiteSections: {},
  websites: { id: {}, status: {}, publishedAt: {} },
}));
vi.mock("@/domain/website", async () => import("../domain/website"));
vi.mock("@/storage/types", async () => import("../storage/types"));

import { mapPublishedWebsite } from "./websites-repository";

describe("published websites repository", () => {
  it("maps recording and section assets", () => {
    const date = new Date("2026-09-01T00:00:00.000Z");
    const website = mapPublishedWebsite({
      id: "website",
      slug: "paper",
      title: "Paper",
      tagline: "Plan calmly.",
      creatorId: "creator",
      description: "A product website.",
      categories: ["SaaS"],
      themes: ["Light"],
      colors: ["White"],
      sourceUrl: "https://example.com",
      status: "published",
      isFeatured: true,
      publishedAt: date,
      archivedAt: null,
      createdBy: null,
      updatedBy: null,
      createdAt: date,
      updatedAt: date,
      creator: {
        id: "creator",
        name: "Studio",
        handle: null,
        url: null,
        avatarUrl: "/brand/default-avatar.svg",
        avatarStorageProvider: null,
        avatarStorageKey: null,
        createdAt: date,
        updatedAt: date,
      },
      media: [
        {
          id: "recording",
          websiteId: "website",
          role: "recording",
          url: "/recording.webm",
          posterUrl: "/poster.webp",
          storageProvider: null,
          storageKey: null,
          mimeType: "video/webm",
          sourceMimeType: "video/webm",
          sizeBytes: 1200,
          variants: [],
          videoPreview: {
            url: "/preview.mp4",
            storageKey: "websites/preview.mp4",
            width: 1080,
            height: 1920,
            bytes: 1200,
            format: "mp4",
          },
          posterStorageKey: null,
          alt: "Paper website recording",
          width: 1080,
          height: 1920,
          createdAt: date,
        },
        {
          id: "icon",
          websiteId: "website",
          role: "favicon",
          url: "/icon.webp",
          posterUrl: null,
          storageProvider: null,
          storageKey: null,
          mimeType: "image/webp",
          sourceMimeType: "image/png",
          sizeBytes: 300,
          variants: [],
          videoPreview: null,
          posterStorageKey: null,
          alt: "Paper icon",
          width: 64,
          height: 64,
          createdAt: date,
        },
      ],
      sections: [
        {
          id: "hero",
          websiteId: "website",
          label: "Hero",
          top: null,
          height: null,
          position: 0,
          imageUrl: "/hero.webp",
          imageStorageProvider: null,
          imageStorageKey: null,
          imageMimeType: "image/webp",
          imageSourceMimeType: "image/png",
          imageSizeBytes: 900,
          imageVariants: [],
          imageAlt: "Paper hero",
          imageWidth: 1440,
          imageHeight: 900,
          createdAt: date,
          updatedAt: date,
        },
      ],
    });

    expect(website).toMatchObject({
      slug: "paper",
      recording: {
        url: "/recording.webm",
        posterUrl: "/poster.webp",
        videoPreview: { url: "/preview.mp4" },
      },
      favicon: { url: "/icon.webp" },
      sections: [{ label: "Hero", url: "/hero.webp", alt: "Paper hero" }],
    });
  });
});
