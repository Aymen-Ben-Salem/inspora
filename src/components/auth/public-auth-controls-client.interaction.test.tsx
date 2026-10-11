// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useUser: () => ({ user: { id: "viewer", imageUrl: "https://example.com/avatar.png" } }),
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../profile/use-viewer-profile", () => ({
  useViewerProfile: () => ({ profile: null, isLoading: false, capabilities: { viewer: true, sponsor: true } }),
}));
vi.mock("../submissions/submission-provider", () => ({
  useSubmission: () => ({ openSubmission: vi.fn() }),
}));
import { PublicAuthControlsClient } from "./public-auth-controls-client";
it("keeps the account menu open inside and dismisses it on outside press, Escape and selecting an action", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  document.body.append(container);
  try {
    await act(async () => root.render(<PublicAuthControlsClient variant="desktop" />));
    const trigger = container.querySelector<HTMLElement>('[aria-label="Account menu"]')!;
    await act(async () => trigger.click());
    const profile = container.querySelector<HTMLAnchorElement>('a[href="/profile"]')!;
    await act(async () => profile.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await act(async () => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger.click());
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    const submit = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Submit work")!;
    await act(async () => submit.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
