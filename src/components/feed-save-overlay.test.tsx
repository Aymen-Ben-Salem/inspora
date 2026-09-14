import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeedSaveOverlay } from "./feed-save-overlay";

describe("FeedSaveOverlay", () => {
  it("reveals the save glyph for pointer hover and keyboard focus", () => {
    const markup = renderToStaticMarkup(<FeedSaveOverlay />);

    expect(markup).toContain("group-hover:opacity-100");
    expect(markup).toContain("group-focus-visible:opacity-100");
    expect(markup).toContain("opacity-0");
    expect(markup).toContain("var(--archive-card-overlay-size)");
    expect(markup).toContain("var(--archive-card-overlay-inset)");
  });
});
