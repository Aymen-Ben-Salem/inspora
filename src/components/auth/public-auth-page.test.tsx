import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { isConfigured, renderSignIn, renderSignUp } = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  renderSignIn: vi.fn(),
  renderSignUp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../auth/config", () => ({
  isClerkConfigured: () => isConfigured(),
}));
vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: ComponentProps<"div">) => renderSignIn(props),
  SignUp: (props: ComponentProps<"div">) => renderSignUp(props),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { PublicAuthPage } from "./public-auth-page";

describe("PublicAuthPage", () => {
  afterEach(() => {
    isConfigured.mockReset();
    renderSignIn.mockReset();
    renderSignUp.mockReset();
  });

  it.each([
    ["sign-in" as const, "Sign in to Inspora"],
    ["sign-up" as const, "Join Inspora"],
  ])(
    "renders the %s modal flow and matching Clerk adapter",
    (flow, dialogLabel) => {
      isConfigured.mockReturnValue(true);
      renderSignIn.mockReturnValue(<div data-clerk-flow="sign-in" />);
      renderSignUp.mockReturnValue(<div data-clerk-flow="sign-up" />);

      const html = renderToStaticMarkup(
        <PublicAuthPage
          flow={flow}
          backdrop={<div data-testid="archive-backdrop" />}
        />,
      );

      expect(html).toContain('aria-label="' + dialogLabel + '"');
      expect(html).toContain("data-auth-backdrop");
      expect(html).toContain("data-auth-dismiss");
      expect(html).toContain('data-testid="archive-backdrop"');
      expect(html).toContain('data-clerk-flow="' + flow + '"');
      expect(html).not.toContain(
        'data-clerk-flow="' + (flow === "sign-in" ? "sign-up" : "sign-in") + '"',
      );
      const activeRenderer = flow === "sign-in" ? renderSignIn : renderSignUp;
      expect(activeRenderer).toHaveBeenCalledWith(
        expect.objectContaining({ appearance: expect.any(Object), routing: "hash" }),
      );
    },
  );

  it.each(["sign-in" as const, "sign-up" as const])(
    "shows neutral setup content for an unconfigured %s flow",
    (flow) => {
      isConfigured.mockReturnValue(false);
      renderSignIn.mockImplementation(() => {
        throw new Error("SignIn must not mount without configuration");
      });
      renderSignUp.mockImplementation(() => {
        throw new Error("SignUp must not mount without configuration");
      });

      const html = renderToStaticMarkup(<PublicAuthPage flow={flow} />);

      expect(html).toContain("Authentication is not available yet.");
      expect(html).toContain("Join Inspora");
      expect(html).not.toContain("data-clerk-flow");
    },
  );

  it("uses a transparent backdrop blur without rendering substitute page content when intercepted", () => {
    isConfigured.mockReturnValue(true);
    renderSignIn.mockReturnValue(<div data-clerk-flow="sign-in" />);

    const html = renderToStaticMarkup(
      <PublicAuthPage
        flow="sign-in"
        overlay
        backdrop={<div data-testid="substitute-backdrop" />}
      />,
    );

    expect(html).toContain('data-auth-overlay="true"');
    expect(html).toContain("backdrop-blur-[5px]");
    expect(html).not.toContain("substitute-backdrop");
  });
});
