import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { isConfigured, renderClientControls } = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  renderClientControls: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../auth/config", () => ({
  isClerkConfigured: () => isConfigured(),
}));
vi.mock("./public-auth-controls-client", () => ({
  PublicAuthControlsClient: ({ variant }: { variant: "desktop" | "mobile" }) =>
    renderClientControls(variant),
}));

import { PublicAuthControls } from "./public-auth-controls";

describe("PublicAuthControls", () => {
  afterEach(() => {
    isConfigured.mockReset();
    renderClientControls.mockReset();
  });

  it.each(["desktop" as const, "mobile" as const])(
    "renders nothing for unconfigured %s controls",
    (variant) => {
      isConfigured.mockReturnValue(false);
      renderClientControls.mockImplementation(() => {
        throw new Error("Client controls must not mount without configuration");
      });

      const html = renderToStaticMarkup(<PublicAuthControls variant={variant} />);

      expect(html).toBe("");
      expect(html).not.toContain("Account");
    },
  );

  it.each(["desktop" as const, "mobile" as const])(
    "renders configured %s controls",
    (variant) => {
      isConfigured.mockReturnValue(true);
      renderClientControls.mockReturnValue(
        <div data-auth-variant={variant}>{variant} controls</div>,
      );

      const html = renderToStaticMarkup(<PublicAuthControls variant={variant} />);

      expect(html).toContain('data-auth-variant="' + variant + '"');
      expect(html).toContain(variant + " controls");
    },
  );
});
