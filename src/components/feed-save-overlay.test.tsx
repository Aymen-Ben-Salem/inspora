import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeedSaveButton, SaveIcon } from "./feed-save-overlay";

describe("FeedSaveOverlay", () => {
  it("reveals the save glyph for pointer hover and keyboard focus", () => {
    const markup = renderToStaticMarkup(<FeedSaveButton postId="post-id" />);

    expect(markup).toContain("group-hover:opacity-100");
    expect(markup).toContain("group-focus-within:opacity-100");
    expect(markup).toContain("opacity-0");
    expect(markup).toContain("var(--archive-card-overlay-size)");
    expect(markup).toContain("var(--archive-card-overlay-inset)");
    expect(markup).toContain('viewBox="0 0 35 35"');
    expect(markup).toContain('stroke-width="1.55558"');
    expect(markup).not.toContain("archive-card-save-padding");
  });

  it("renders the saved state as a filled bookmark", () => {
    const markup = renderToStaticMarkup(<SaveIcon saved />);

    expect(markup).toContain('fill="#262626"');
    expect(markup).toContain('stroke="#262626"');
  });

  it("keeps the sidebar toggle visible and out of absolute card positioning", () => {
    const markup = renderToStaticMarkup(<FeedSaveButton postId="post-id" variant="detail" initiallySaved />);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("detail-bookmark-icon");
    expect(markup).not.toContain("absolute");
    expect(markup).not.toContain("opacity-0");
  });

  it("uses a separate accessible toggle control for a post", () => {
    const markup = renderToStaticMarkup(
      <FeedSaveButton
        postId="11111111-1111-4111-8111-111111111111"
        initiallySaved
      />,
    );

    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Remove from saved posts"');
    expect(markup).toContain('aria-pressed="true"');
  });
});
