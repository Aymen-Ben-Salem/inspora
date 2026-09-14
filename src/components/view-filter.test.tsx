import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ViewFilter } from "./view-filter";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("ViewFilter", () => {
  it("keeps the Figma border and shadow visible while closed", () => {
    const markup = renderToStaticMarkup(<ViewFilter view="latest" />);

    expect(markup).toContain("border-[#e6e6e6]");
    expect(markup).toContain("shadow-[0_1px_1px_#e6e6e6]");
    expect(markup).not.toContain("border-transparent");
  });

  it("does not add the design category-rail padding on websites", () => {
    const markup = renderToStaticMarkup(
      <ViewFilter basePath="/websites" view="latest" />,
    );

    expect(markup).not.toContain("py-[var(--archive-filter-pad-y)]");
    expect(markup).toContain('width="9.2"');
    expect(markup).toContain('height="5.2"');
  });
});
