import { describe, expect, it } from "vitest";

import { getOptimizedImageWidths } from "./image-optimization";

describe("responsive image widths", () => {
  it("creates applicable breakpoints and retains the capped source width", () => {
    expect(getOptimizedImageWidths(2000, "post-media")).toEqual([640, 960, 1600, 2000]);
    expect(getOptimizedImageWidths(4000, "post-media")).toEqual([
      640,
      960,
      1600,
      2560,
    ]);
  });

  it("never upscales small images or creator avatars", () => {
    expect(getOptimizedImageWidths(480, "post-media")).toEqual([480]);
    expect(getOptimizedImageWidths(120, "creator-avatar")).toEqual([120]);
    expect(getOptimizedImageWidths(1200, "creator-avatar")).toEqual([256]);
  });
});
