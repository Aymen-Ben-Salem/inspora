import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: () => <span aria-hidden="true" />,
}));
vi.mock("./detail-sidebar-primitives", () => ({
  detailSecondaryActionClassName: "secondary-action",
}));

import { MediaAssetActions } from "./media-asset-actions";

describe("MediaAssetActions", () => {
  it("keeps both actions visible and disabled without an asset", () => {
    const markup = renderToStaticMarkup(
      <MediaAssetActions
        assetKey="website:section:none"
        copyLabel="Copy section"
      />,
    );

    expect(markup).toContain("Copy section");
    expect(markup).toContain("Download");
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });

  it("enables both actions when an asset is available", () => {
    const markup = renderToStaticMarkup(
      <MediaAssetActions
        assetKey="website:preview"
        assetUrl="/api/websites/website/asset"
        copyLabel="Copy website"
      />,
    );

    expect(markup).toContain("Copy website");
    expect(markup).not.toContain('disabled=""');
  });
});
