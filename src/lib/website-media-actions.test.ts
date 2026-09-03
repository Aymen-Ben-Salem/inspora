import { describe, expect, it } from "vitest";

import {
  getDefaultWebsiteSectionId,
  getScaledWebsiteSectionCrop,
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

  it("clears a section only when the gallery canvas is clicked", () => {
    expect(
      shouldClearWebsiteSectionSelection({
        clickedMediaTabs: false,
        clickedSection: false,
      }),
    ).toBe(true);
    expect(
      shouldClearWebsiteSectionSelection({
        clickedMediaTabs: false,
        clickedSection: true,
      }),
    ).toBe(false);
    expect(
      shouldClearWebsiteSectionSelection({
        clickedMediaTabs: true,
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
