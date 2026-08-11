import { describe, expect, it } from "vitest";

import { shouldReturnToFeed } from "./post-route-scroll";

describe("shouldReturnToFeed", () => {
  it("returns to the feed once its start reaches the sticky header", () => {
    expect(
      shouldReturnToFeed({
        currentScrollTop: 940,
        previousScrollTop: 900,
        feedTop: 80,
        headerBottom: 80,
      }),
    ).toBe(true);
  });

  it("keeps the post route while the feed remains below the header", () => {
    expect(
      shouldReturnToFeed({
        currentScrollTop: 700,
        previousScrollTop: 650,
        feedTop: 280,
        headerBottom: 80,
      }),
    ).toBe(false);
  });

  it("does not return while the visitor scrolls upward", () => {
    expect(
      shouldReturnToFeed({
        currentScrollTop: 900,
        previousScrollTop: 940,
        feedTop: 70,
        headerBottom: 80,
      }),
    ).toBe(false);
  });
});
