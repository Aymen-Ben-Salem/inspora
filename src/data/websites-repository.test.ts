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
import { websiteFixture } from "./public-work/testing/fixtures";

describe("published websites repository", () => {
  it("maps recording and section assets", () => {
    const row = websiteFixture();
    // Retained legacy media must not break an otherwise complete recording.
    row.media.push({ ...row.media[1], id: "legacy", role: "full_page" });
    const website = mapPublishedWebsite(row);

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
