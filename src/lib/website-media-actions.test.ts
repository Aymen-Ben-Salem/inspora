import { describe, expect, it } from "vitest";

import {
  getDefaultWebsiteSectionId,
  getScaledWebsiteSectionCrop,
  getWebsiteTransitionHero,
  getWebsiteSectionFileName,
  shouldClearWebsiteSectionSelection,
} from "./website-media-actions";

describe("website media actions", () => {
  it("selects the first section when the sections view opens", () => {
    expect(
      getDefaultWebsiteSectionId([{ id: "hero" }, { id: "features" }]),
    ).toBe("hero");
    expect(getDefaultWebsiteSectionId([])).toBeUndefined();
  });

  it("matches the transition hero to the website feed crop", () => {
    expect(
      getWebsiteTransitionHero({
        fullPage: { height: 6000, width: 1080 },
        sections: [
          { id: "hero", height: 1500, label: "Hero", position: 0, top: 0 },
        ],
      } as Pick<import("@/domain/website").Website, "fullPage" | "sections">),
    ).toMatchObject({ id: "hero", height: 659, top: 0 });
  });

  it("clears a section on blank gallery surfaces, including the tab row", () => {
    expect(
      shouldClearWebsiteSectionSelection({
        clickedMediaTab: false,
        clickedSection: false,
      }),
    ).toBe(true);
    expect(
      shouldClearWebsiteSectionSelection({
        clickedMediaTab: false,
        clickedSection: true,
      }),
    ).toBe(false);
    expect(
      shouldClearWebsiteSectionSelection({
        clickedMediaTab: true,
        clickedSection: false,
      }),
    ).toBe(false);
  });

  it("scales stored section coordinates to the decoded bitmap", () => {
    expect(
      getScaledWebsiteSectionCrop({
        bitmapHeight: 3000,
        bitmapWidth: 720,
        fullPageHeight: 6000,
        sectionHeight: 1200,
        sectionTop: 1500,
      }),
    ).toEqual({
      height: 600,
      width: 720,
      x: 0,
      y: 750,
    });
  });

  it("clamps a final section to the decoded bitmap bounds", () => {
    expect(
      getScaledWebsiteSectionCrop({
        bitmapHeight: 1000,
        bitmapWidth: 500,
        fullPageHeight: 6000,
        sectionHeight: 1800,
        sectionTop: 5400,
      }),
    ).toEqual({
      height: 100,
      width: 500,
      x: 0,
      y: 900,
    });
  });

  it("creates a safe PNG filename for a section", () => {
    expect(getWebsiteSectionFileName("Atelier / 24", "Hero & Work")).toBe(
      "atelier-24-hero-work.png",
    );
  });
});
