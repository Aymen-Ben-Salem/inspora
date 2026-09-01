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
  it("maps one full screenshot into ordered public sections", () => {
    const date = new Date("2026-09-01T00:00:00.000Z");
    const baseMedia = {
      websiteId: "website",
      storageProvider: null,
      storageKey: null,
      mimeType: "image/webp",
      sourceMimeType: "image/png",
      sizeBytes: 1200,
      createdAt: date,
    };
    const website = mapPublishedWebsite({
      id: "website", slug: "paper", title: "Paper", tagline: "Plan calmly.",
      creatorId: "creator", description: "A product website.", categories: ["SaaS"],
      themes: ["Light"], colors: ["White"], sourceUrl: "https://example.com",
      status: "published", publishedAt: date, archivedAt: null, createdBy: null, updatedBy: null, createdAt: date, updatedAt: date,
      creator: { id: "creator", name: "Studio", handle: null, url: null, avatarUrl: "/brand/default-avatar.svg", avatarStorageProvider: null, avatarStorageKey: null, createdAt: date, updatedAt: date },
      media: [
        { ...baseMedia, id: "full", role: "full_page", url: "/full.webp", alt: "Full website", width: 1440, height: 9000 },
        { ...baseMedia, id: "icon", role: "favicon", url: "/icon.webp", alt: "Paper icon", width: 64, height: 64 },
      ],
      sections: [
        { id: "hero", websiteId: "website", label: "Hero", top: 0, height: 900, position: 0, createdAt: date, updatedAt: date },
      ],
    });

    expect(website).toMatchObject({
      slug: "paper",
      fullPage: { url: "/full.webp", height: 9000 },
      favicon: { url: "/icon.webp" },
      sections: [{ label: "Hero", top: 0, height: 900 }],
    });
  });
});
