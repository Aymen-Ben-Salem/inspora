import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState, userState, viewerProfile } = vi.hoisted(() => ({
  authState: vi.fn(),
  userState: vi.fn(),
  viewerProfile: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => authState(),
  useUser: () => userState(),
}));

vi.mock("../profile/use-viewer-profile", () => ({
  useViewerProfile: (userId: string | undefined) => viewerProfile(userId),
}));

import { PublicAuthControlsClient } from "./public-auth-controls-client";

describe("PublicAuthControlsClient", () => {
  beforeEach(() => {
    viewerProfile.mockReturnValue({ profile: null, isLoading: false });
  });
  it.each(["desktop" as const, "mobile" as const])(
    "does not flash the Clerk avatar while the saved photo loads on %s",
    (variant) => {
      authState.mockReturnValue({ isLoaded: true, isSignedIn: true });
      userState.mockReturnValue({ user: { id: "viewer-a", imageUrl: "https://img.example/clerk.jpg" } });
      viewerProfile.mockReturnValue({ profile: null, isLoading: true });
      const html = renderToStaticMarkup(<PublicAuthControlsClient variant={variant} />);
      expect(html).not.toContain("clerk.jpg");
      expect(html).toContain('href="/profile"');
    },
  );

  afterEach(() => {
    authState.mockReset();
    userState.mockReset();
    viewerProfile.mockReset();
  });

  it.each(["desktop" as const, "mobile" as const])(
    "reserves a non-interactive loading placeholder for %s",
    (variant) => {
      authState.mockReturnValue({ isLoaded: false, isSignedIn: undefined });
      userState.mockReturnValue({ user: null });

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
      userState.mockReturnValue({ user: null });

      const html = renderToStaticMarkup(<PublicAuthControlsClient variant={variant} />);

      expect(html).toContain("Sign in");
      expect(html).toContain('href="/sign-in"');
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
      userState.mockReturnValue({ user: null });

      const html = renderToStaticMarkup(<PublicAuthControlsClient variant={variant} />);

      expect(html).toContain("Sign in");
      expect(html).not.toContain("Sign up");
      expect(html).not.toContain("Account menu");
    },
  );

  it.each(["desktop" as const, "mobile" as const])(
    "links the signed-in viewer avatar to their own profile on %s",
    (variant) => {
      authState.mockReturnValue({ isLoaded: true, isSignedIn: true });
      userState.mockReturnValue({
        user: { fullName: "Ada Lovelace", imageUrl: "https://img.example/ada.jpg" },
      });

      const html = renderToStaticMarkup(<PublicAuthControlsClient variant={variant} />);

      expect(html).toContain('href="/profile"');
      expect(html).toContain('aria-label="Open your profile"');
      expect(html).toContain("Ada Lovelace&#x27;s profile");
      expect(html).not.toContain("Sign in");
      expect(html).not.toContain("Sign up");
    },
  );

  it.each(["desktop" as const, "mobile" as const])(
    "uses the viewer saved profile photo on %s",
    (variant) => {
      authState.mockReturnValue({ isLoaded: true, isSignedIn: true });
      userState.mockReturnValue({
        user: { id: "viewer-a", fullName: "Clerk name", imageUrl: "https://img.example/clerk.jpg" },
      });
      viewerProfile.mockReturnValue({
        profile: { name: "Saved name", avatarUrl: "https://img.example/saved.jpg" },
        isLoading: false,
      });
      const html = renderToStaticMarkup(<PublicAuthControlsClient variant={variant} />);
      expect(html).toContain("saved.jpg");
      expect(html).not.toContain("clerk.jpg");
      expect(viewerProfile).toHaveBeenCalledWith("viewer-a");
      expect(html).toContain('href="/profile"');
    },
  );
});
