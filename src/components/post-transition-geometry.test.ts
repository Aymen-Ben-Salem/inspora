import { describe, expect, it } from "vitest";

import { getOptimisticHeroGeometry } from "./post-transition-geometry";

describe("getOptimisticHeroGeometry", () => {
  it("matches the modal's 85dvh portrait sizing", () => {
    expect(getOptimisticHeroGeometry(0.75)).toEqual({
      aspectRatio: "0.75",
      width: "min(100%, 63.75dvh)",
    });
  });

  it("matches the modal's 72dvh landscape sizing", () => {
    expect(getOptimisticHeroGeometry(1.5)).toEqual({
      aspectRatio: "1.5",
      width: "min(100%, 108dvh)",
    });
  });
});
