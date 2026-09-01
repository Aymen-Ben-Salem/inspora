import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/homepage-header", () => ({ HomepageHeader: () => null }));
vi.mock("@/components/logos/logo-archive", () => ({ LogoArchive: () => null }));
vi.mock("@/data/logos-repository", () => ({ getPublishedLogos: vi.fn() }));
vi.mock("@/lib/seo", () => ({
  buildLogoCollectionStructuredData: vi.fn(),
  serializeJsonLd: vi.fn(),
  SITE_OG_IMAGE: "/brand/inspora-og.png",
}));

import { metadata } from "./page";

describe("logos page metadata", () => {
  it("is indexable with a canonical URL and descriptive metadata", () => {
    expect(metadata.alternates).toEqual({ canonical: "/logos" });
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.description).toContain("logos and icons");
  });
});
