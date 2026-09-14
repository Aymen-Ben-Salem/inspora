import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ArchiveFilterMenu } from "./archive-filter-menu";

const options = [{ count: 2, value: "Editorial" }];

describe("ArchiveFilterMenu", () => {
  it("uses muted search-text grey when no filter is selected", () => {
    const markup = renderToStaticMarkup(
      <ArchiveFilterMenu
        label="Style"
        options={options}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );

    expect(markup).toContain('style="color:#767676"');
    expect(markup).toContain("w-[var(--archive-filter-width)]");
    expect(markup).toContain("gap-[var(--archive-filter-gap)]");
  });

  it("uses archive black when a filter is selected", () => {
    const markup = renderToStaticMarkup(
      <ArchiveFilterMenu
        label="Style"
        options={options}
        selected={["Editorial"]}
        onToggle={vi.fn()}
      />,
    );

    expect(markup).toContain('style="color:#262626"');
    expect(markup).toContain("w-[var(--archive-filter-selected-width)]");
  });
});
