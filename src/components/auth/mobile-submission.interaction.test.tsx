// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const { openSubmission, push } = vi.hoisted(() => ({
  openSubmission: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useUser: () => ({
    user: { id: "viewer", imageUrl: "https://example.com/avatar.png" },
  }),
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../profile/use-viewer-profile", () => ({
  useViewerProfile: () => ({ profile: null, isLoading: false }),
}));
vi.mock("../submissions/submission-provider", () => ({
  useSubmission: () => ({ openSubmission }),
}));
import { SiteNavbarClient } from "../site-navbar-client";
import { PublicAuthControlsClient } from "./public-auth-controls-client";
import { MobileSignInLink } from "./mobile-sign-in-link";
afterEach(() => {
  openSubmission.mockReset();
  push.mockReset();
  vi.unstubAllGlobals();
});
it("dismisses mobile navigation before following the sign-in link", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <SiteNavbarClient
          desktopAuth={null}
          mobileAuth={<MobileSignInLink />}
        />,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!
        .click(),
    );
    const overlay = container.querySelector('[aria-label="Site navigation"]')!;
    const link =
      overlay.querySelector<HTMLAnchorElement>('a[href="/sign-in"]')!;
    expect(link).not.toBeNull();
    await act(async () =>
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      ),
    );
    expect(push).not.toHaveBeenCalled();
    expect(overlay.getAttribute("data-state")).toBe("closing");
    await act(async () =>
      overlay.dispatchEvent(new Event("animationend", { bubbles: true })),
    );
    expect(
      container.querySelector('[aria-label="Site navigation"]'),
    ).toBeNull();
    expect(push).toHaveBeenCalledWith("/sign-in", { scroll: false });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
it("keeps Design inactive on sponsorship in desktop and mobile navigation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<SiteNavbarClient desktopAuth={null} mobileAuth={null} />),
    );
    expect(
      container
        .querySelector('[aria-label="Primary navigation"] a[href="/"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
    await act(async () =>
      root.render(
        <SiteNavbarClient
          page="sponsor"
          desktopAuth={null}
          mobileAuth={null}
        />,
      ),
    );
    expect(
      container.querySelector(
        '[aria-label="Primary navigation"] [aria-current="page"]',
      ),
    ).toBeNull();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!
        .click(),
    );
    expect(
      container
        .querySelector('[aria-label="Mobile navigation"] a[href="/"]')
        ?.getAttribute("aria-current"),
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
it("dismisses mobile navigation before opening the viewer's submission dialog", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <SiteNavbarClient
          desktopAuth={null}
          mobileAuth={<PublicAuthControlsClient variant="mobile" />}
        />,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!
        .click(),
    );
    const overlay = container.querySelector('[aria-label="Site navigation"]')!;
    expect(overlay).not.toBeNull();
    const submit = [...overlay.querySelectorAll("button")].find(
      (b) => b.textContent === "Submit work",
    )!;
    await act(async () => submit.click());
    expect(openSubmission).not.toHaveBeenCalled();
    await act(async () =>
      overlay.dispatchEvent(new Event("animationend", { bubbles: true })),
    );
    expect(
      container.querySelector('[aria-label="Site navigation"]'),
    ).toBeNull();
    expect(openSubmission).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
