import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/archive-view", () => ({ ArchiveView: () => null }));
vi.mock("@/data/posts-repository", () => ({ getPostPage: vi.fn() }));
vi.mock("@/data/sponsor-repository", () => ({ getActiveSponsor: vi.fn() }));
vi.mock("@/domain/post", () => ({
  isPostCategory: vi.fn(),
  isPostView: vi.fn(),
}));
vi.mock("@/lib/seo", () => ({
  SITE_NAME: "Inspora",
  SITE_OG_IMAGE: "/brand/inspora-og.png",
}));

import { metadata } from "./page";

describe("homepage metadata", () => {
  it("keeps the social image when setting the canonical Open Graph URL", () => {
    expect(metadata.alternates).toEqual({ canonical: "/" });

    expect(metadata.openGraph).toMatchObject({
      url: "/",
      images: [
        {
          url: "/brand/inspora-og.png",
          width: 1201,
          height: 630,
        },
      ],
    });
  });
});
