import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { devLogoFixtures, devWebsiteFixtures } from "./dev-archive-fixtures";

function publicAssetExists(url: string) {
  return (
    url.startsWith("/") &&
    existsSync(path.join(process.cwd(), "public", url.slice(1)))
  );
}

describe("development archive fixtures", () => {
  it("contains fifteen logos and fifteen icons", () => {
    expect(devLogoFixtures.filter((item) => item.kind === "logo")).toHaveLength(
      15,
    );
    expect(devLogoFixtures.filter((item) => item.kind === "icon")).toHaveLength(
      15,
    );
  });

  it("contains eleven websites with mixed featured states", () => {
    expect(devWebsiteFixtures).toHaveLength(11);
    expect(new Set(devWebsiteFixtures.map((item) => item.isFeatured))).toEqual(
      new Set([true, false]),
    );
  });

  it("reuses only four logo visuals, four icon visuals, and three website visuals", () => {
    expect(
      new Set(
        devLogoFixtures
          .filter((item) => item.kind === "logo")
          .map((item) => item.media.url),
      ).size,
    ).toBe(4);
    expect(
      new Set(
        devLogoFixtures
          .filter((item) => item.kind === "icon")
          .map((item) => item.media.url),
      ).size,
    ).toBe(4);
    expect(
      new Set(devWebsiteFixtures.map((item) => item.fullPage.url)).size,
    ).toBe(3);
  });

  it("uses unique, reserved development slugs", () => {
    const slugs = [
      ...devLogoFixtures.map((item) => item.slug),
      ...devWebsiteFixtures.map((item) => item.slug),
    ];

    expect(slugs.every((slug) => slug.startsWith("dev-sample-"))).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("references complete local media with valid dimensions", () => {
    for (const logo of devLogoFixtures) {
      expect(publicAssetExists(logo.media.url)).toBe(true);
      expect(logo.media.width).toBeGreaterThan(0);
      expect(logo.media.height).toBeGreaterThan(0);
    }

    for (const website of devWebsiteFixtures) {
      expect(publicAssetExists(website.fullPage.url)).toBe(true);
      expect(publicAssetExists(website.favicon.url)).toBe(true);
      expect(website.fullPage.width).toBeGreaterThan(0);
      expect(website.fullPage.height).toBeGreaterThan(0);
      expect(website.sections.length).toBeGreaterThanOrEqual(3);
      for (const [position, section] of website.sections.entries()) {
        expect(section.position).toBe(position);
        expect(section.top).toBeGreaterThanOrEqual(0);
        expect(section.height).toBeGreaterThan(0);
        expect(section.top + section.height).toBeLessThanOrEqual(
          website.fullPage.height,
        );
      }
    }
  });
});
