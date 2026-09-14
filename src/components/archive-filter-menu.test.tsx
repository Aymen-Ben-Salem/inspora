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
  });
});
