import { describe, expect, it } from "vitest";

import { assertVideoPreviewDimensions } from "./video-preview-validation";

describe("video preview upload preflight", () => {
  it("accepts dimensions at the configured boundary", () => {
    expect(() =>
      assertVideoPreviewDimensions({ width: 1080, height: 1920 }),
    ).not.toThrow();
  });

  it("rejects a browser-reported width above the preview boundary", () => {
    expect(() =>
      assertVideoPreviewDimensions({ width: 1081, height: 608 }),
    ).toThrow("1081?608");
  });

  it("rejects a height above the preview boundary", () => {
    expect(() =>
      assertVideoPreviewDimensions({ width: 1080, height: 1921 }),
    ).toThrow("1080?1921");
  });

  it.each([
    { width: 0, height: 608 },
    { width: 1080.5, height: 608 },
    { width: Number.NaN, height: 608 },
  ])("rejects invalid dimensions: $width?$height", (dimensions) => {
    expect(() => assertVideoPreviewDimensions(dimensions)).toThrow(
      "invalid dimensions",
    );
  });
});
