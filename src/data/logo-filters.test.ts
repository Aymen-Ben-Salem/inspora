import { describe, expect, it } from "vitest";

import type { Logo } from "../domain/logo";
import { getLogoFilterOptions, matchesLogoFilters, type LogoFilters } from "./logo-filters";

const paper: Logo = {
  id: "logo-1",
  slug: "paper",
  title: "Paper",
  kind: "logo",
  creator: {
    id: "creator-1",
    name: "Nero Pursue",
    avatarUrl: "/brand/default-avatar.svg",
  },
  description: "A minimal combination mark.",
  industry: "SaaS",
  colors: ["Black", "White"],
  styles: ["Clean", "Minimal"],
  shape: "Symbol & text",
  sourceUrl: "https://example.com",
  createdAt: "2026-09-01T00:00:00.000Z",
  publishedAt: "2026-09-01T00:00:00.000Z",
  media: {
    id: "media-1",
    url: "/paper.png",
    alt: "Paper logo",
    width: 1080,
    height: 659,
  },
};

function filters(overrides: Partial<LogoFilters> = {}): LogoFilters {
  return {
    query: "",
    kind: "logo",
    colors: [],
    industries: [],
    styles: [],
    shapes: [],
    ...overrides,
  };
}

describe("logo filters", () => {
  it("splits industry and shape options and counts each logo once", () => {
    const logo = { ...paper, industry: "SaaS, Technology, SaaS, ", shape: "Abstract, Star" };
    const options = getLogoFilterOptions([logo, { ...paper, kind: "icon" }], "logo");
    expect(options.industries).toEqual([{ value: "SaaS", count: 1 }, { value: "Technology", count: 1 }]);
    expect(options.shapes).toEqual([{ value: "Abstract", count: 1 }, { value: "Star", count: 1 }]);
    expect(matchesLogoFilters(logo, filters({ industries: ["technology"], shapes: ["star"] }))).toBe(true);
    expect(matchesLogoFilters(logo, filters({ industries: ["SaaS", "Technology"], shapes: ["Abstract", "Star"] }))).toBe(true);
    expect(matchesLogoFilters(logo, filters({ shapes: ["Circle"] }))).toBe(false);
    expect(matchesLogoFilters(paper, filters({ shapes: ["Symbol & text"] }))).toBe(true);
  });
  it("matches searchable descriptive fields", () => {
    expect(matchesLogoFilters(paper, filters({ query: "nero" }))).toBe(true);
    expect(matchesLogoFilters(paper, filters({ query: "geometric" }))).toBe(false);
  });

  it("matches one or more selected options instead of requiring all of them", () => {
    expect(
      matchesLogoFilters(
        paper,
        filters({ colors: ["Black", "White"], styles: ["Minimal"] }),
      ),
    ).toBe(true);
    expect(
      matchesLogoFilters(paper, filters({ colors: ["Black", "Blue"] })),
    ).toBe(true);
  });

  describe.each(["logo", "icon"] as const)("%s selection", (kind) => {
    it.each([
      { colors: ["Black", "Blue"] },
      { industries: ["SaaS", "Art"] },
      { styles: ["Minimal", "Vintage"] },
      { shapes: ["Symbol & text", "Circle"] },
    ])("matches either option within a menu: %j", (selection) => {
      expect(matchesLogoFilters({ ...paper, kind }, filters({ kind, ...selection }))).toBe(true);
    });

    it("matches an option from any selected menu", () => {
      const logo = { ...paper, kind };
      expect(matchesLogoFilters(logo, filters({ kind, colors: ["Blue"], styles: ["Minimal"] }))).toBe(true);
      expect(matchesLogoFilters(logo, filters({ kind, colors: ["Black"], industries: ["Art"], shapes: ["Circle"] }))).toBe(true);
      expect(matchesLogoFilters(logo, filters({ kind, colors: ["Blue"], industries: ["Art"], styles: ["Vintage"], shapes: ["Circle"] }))).toBe(false);
    });

    it("shows all work with no selections and still respects the text search", () => {
      const logo = { ...paper, kind };
      expect(matchesLogoFilters(logo, filters({ kind }))).toBe(true);
      expect(matchesLogoFilters(logo, filters({ kind, query: "Nero", colors: ["black", "Blue"] }))).toBe(true);
      expect(matchesLogoFilters(logo, filters({ kind, query: "missing", colors: ["Black"] }))).toBe(false);
    });
  });

  it("keeps logos and icons in separate views", () => {
    expect(matchesLogoFilters(paper, filters({ kind: "icon" }))).toBe(false);
  });
});
