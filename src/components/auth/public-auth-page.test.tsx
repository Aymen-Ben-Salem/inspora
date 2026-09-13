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
  SignIn: () => renderSignIn(),
  SignUp: () => renderSignUp(),
}));

import { PublicAuthPage } from "./public-auth-page";

describe("PublicAuthPage", () => {
  afterEach(() => {
    isConfigured.mockReset();
    renderSignIn.mockReset();
    renderSignUp.mockReset();
  });

  it.each([
    ["sign-in" as const, "Welcome back.", "Sign in to your Inspora account.", "Sign in"],
    ["sign-up" as const, "Join Inspora.", "Create your Inspora account.", "Sign up"],
  ])(
    "renders the %s editorial flow and matching Clerk adapter",
    (flow, heading, description, formLabel) => {
      isConfigured.mockReturnValue(true);
      renderSignIn.mockReturnValue(<div data-clerk-flow="sign-in" />);
      renderSignUp.mockReturnValue(<div data-clerk-flow="sign-up" />);

      const html = renderToStaticMarkup(<PublicAuthPage flow={flow} />);

      expect(html).toContain(heading);
      expect(html).toContain(description);
      expect(html).toContain('aria-label="' + formLabel + '"');
      expect(html).toContain('data-clerk-flow="' + flow + '"');
      expect(html).not.toContain(
        'data-clerk-flow="' + (flow === "sign-in" ? "sign-up" : "sign-in") + '"',
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
      expect(html).toContain("Clerk configuration is required");
      expect(html).not.toContain("data-clerk-flow");
    },
  );
});
