import { describe, expect, it } from "vitest";

import { resolveSecondaryHeaderVisibility } from "./sticky-header-state";

describe("secondary header visibility", () => {
  it("keeps the filters visible near the top", () => {
    expect(
      resolveSecondaryHeaderVisibility({
        currentScrollY: 80,
        previousScrollY: 60,
        visible: true,
      }),
    ).toBe(true);
  });

  it("hides the filters after meaningful downward scrolling", () => {
    expect(
      resolveSecondaryHeaderVisibility({
        currentScrollY: 140,
        previousScrollY: 120,
        visible: true,
      }),
    ).toBe(false);
  });

  it("reveals the filters as soon as scrolling reverses upward", () => {
    expect(
      resolveSecondaryHeaderVisibility({
        currentScrollY: 500,
        previousScrollY: 520,
        visible: false,
      }),
    ).toBe(true);
  });

  it("ignores tiny scroll jitter", () => {
    expect(
      resolveSecondaryHeaderVisibility({
        currentScrollY: 501,
        previousScrollY: 500,
        visible: false,
      }),
    ).toBe(false);
  });
});
