import { describe, expect, it } from "vitest";

import {
  getDefaultWebsiteSectionId,
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

  it("creates safe filenames matching delivered section media", () => {
    expect(
      getWebsiteSectionFileName("Atelier / 24", "Hero & Work", "image/webp"),
    ).toBe("atelier-24-hero-work.webp");
    expect(
      getWebsiteSectionFileName("Atelier / 24", "Hero & Work", "image/jpeg"),
    ).toBe("atelier-24-hero-work.jpg");
  });
});
