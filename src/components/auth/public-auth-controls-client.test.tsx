import type { PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => authState(),
  SignInButton: ({ children }: PropsWithChildren) => <>{children}</>,
  UserButton: () => <button type="button">Account menu</button>,
}));

import { PublicAuthControlsClient } from "./public-auth-controls-client";

describe("PublicAuthControlsClient", () => {
  afterEach(() => {
    authState.mockReset();
  });

  it.each(["desktop" as const, "mobile" as const])(
    "reserves a non-interactive loading placeholder for %s",
    (variant) => {
      authState.mockReturnValue({ isLoaded: false, isSignedIn: undefined });

      const html = renderToStaticMarkup(<PublicAuthControlsClient variant={variant} />);

      expect(html).not.toContain("Sign in");
      expect(html).not.toContain("Sign up");
      expect(html).not.toContain("Account menu");
      expect(html).not.toContain("<button");
    },
  );

  it.each(["desktop" as const, "mobile" as const])(
    "shows only the sign-in action when %s is signed out",
    (variant) => {
      authState.mockReturnValue({ isLoaded: true, isSignedIn: false });

      const html = renderToStaticMarkup(<PublicAuthControlsClient variant={variant} />);

      expect(html).toContain("Sign in");
      expect(html).not.toContain("Sign up");
      expect(html).not.toContain("Account menu");
    },
  );

  it.each(["desktop" as const, "mobile" as const])(
    "keeps a pending %s session in the signed-out presentation",
    (variant) => {
      authState.mockReturnValue({
        isLoaded: true,
        isSignedIn: false,
        sessionId: "sess_pending",
      });

      const html = renderToStaticMarkup(<PublicAuthControlsClient variant={variant} />);

      expect(html).toContain("Sign in");
      expect(html).not.toContain("Sign up");
      expect(html).not.toContain("Account menu");
    },
  );

  it.each(["desktop" as const, "mobile" as const])(
    "shows only the account menu when %s is signed in",
    (variant) => {
      authState.mockReturnValue({ isLoaded: true, isSignedIn: true });

      const html = renderToStaticMarkup(<PublicAuthControlsClient variant={variant} />);

      expect(html).toContain("Account menu");
      expect(html).not.toContain("Sign in");
      expect(html).not.toContain("Sign up");
    },
  );
});
