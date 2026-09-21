import type { PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { renderClerkProvider } = vi.hoisted(() => ({
  renderClerkProvider: vi.fn(),
}));

vi.mock("./submissions/submission-provider", () => ({
  ClerkSubmissionProvider: ({ children }: PropsWithChildren) => (
    <div data-submission-provider="clerk">{children}</div>
  ),
  PublicSubmissionProvider: ({ children }: PropsWithChildren) => (
    <div data-submission-provider="public">{children}</div>
  ),
}));
vi.mock("./saved-posts-provider", () => ({
  SavedPostsProvider: ({ children }: PropsWithChildren) => (
    <div data-saved-posts-provider>{children}</div>
  ),
}));
vi.mock("./profile/viewer-profile-provider", () => ({
  ViewerProfileProvider: ({ children }: PropsWithChildren) => (
    <div data-viewer-profile-provider>{children}</div>
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: (props: PropsWithChildren) => renderClerkProvider(props),
}));

import { AuthProvider } from "./auth-provider";

describe("AuthProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    renderClerkProvider.mockReset();
  });

  it.each([
    [undefined, "sk_test_dummy"],
    ["pk_test_dummy", undefined],
    ["   ", "sk_test_dummy"],
    ["pk_test_dummy", "   "],
    ["pk_test_REPLACE_ME", "sk_test_dummy"],
    ["pk_test_dummy", "sk_test_REPLACE_ME"],
  ])(
    "renders public content without mounting Clerk when configuration is unavailable",
    (publishableKey, secretKey) => {
      vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", publishableKey);
      vi.stubEnv("CLERK_SECRET_KEY", secretKey);
      renderClerkProvider.mockImplementation(() => {
        throw new Error("ClerkProvider must not mount without configuration");
      });

      const html = renderToStaticMarkup(
        <AuthProvider>
          <p>Public content</p>
        </AuthProvider>,
      );

      expect(html).toContain("Public content");
      expect(html).toContain('data-submission-provider="public"');
      expect(html).not.toContain("Loading authentication");
      expect(html).not.toContain("data-clerk-provider");
    },
  );

  it("renders children inside Clerk when configuration is present", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_dummy");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_dummy");
    renderClerkProvider.mockImplementation(({ children }: PropsWithChildren) => (
      <div data-clerk-provider>{children}</div>
    ));

    const html = renderToStaticMarkup(
      <AuthProvider>
        <p>Public content</p>
      </AuthProvider>,
    );

    expect(html).toContain("data-clerk-provider");
    expect(html).toContain('data-submission-provider="clerk"');
    expect(html).toContain("data-saved-posts-provider");
    expect(html).toContain("data-viewer-profile-provider");
    expect(html).toContain("Public content");
    expect(html).not.toContain("Loading authentication");
    expect(renderClerkProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.any(Object),
        localization: expect.objectContaining({
          formButtonPrimary: "Continue with email",
        }),
      }),
    );
  });
});
