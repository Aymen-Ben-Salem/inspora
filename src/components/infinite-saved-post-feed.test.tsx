import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/domain/post", () => import("../domain/post"));

vi.mock("@/domain/saved-post", () => ({
  SAVED_CATEGORIES: [
    "Web",
    "Branding",
    "Product",
    "Motion",
    "Illustration",
    "3D",
    "Print",
    "Logos",
    "Websites",
  ],
}));

import { InfiniteSavedPostFeed } from "./infinite-saved-post-feed";

describe("InfiniteSavedPostFeed", () => {
  it("matches the saved-page count and populated category controls", () => {
    const markup = renderToStaticMarkup(
      <InfiniteSavedPostFeed
        initialPage={{ items: [], nextCursor: null }}
        initialTotal={6}
        initialCounts={{ Web: 3, Branding: 2, Illustration: 1, Logos: 2, Websites: 1 }}
      />,
    );

    expect(markup).toContain("6</span> items you saved for later");
    expect(markup).toContain("Web (3)");
    expect(markup).toContain("Branding (2)");
    expect(markup).toContain("Illustration (1)");
    expect(markup).toContain("Logos (2)");
    expect(markup).toContain("Websites (1)");
    expect(markup).not.toContain("Product (0)");
  });
});
