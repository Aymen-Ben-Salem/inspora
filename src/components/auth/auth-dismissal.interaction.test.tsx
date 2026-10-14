// @vitest-environment happy-dom
import { act, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { push, replace, back } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname, useRouter: () => ({ push, replace, back }) }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null }),
  useUser: () => ({ user: null }),
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, onNavigate, scroll, prefetch: _prefetch, ...props }: {
    href: string; children: ReactNode; scroll?: boolean; prefetch?: boolean;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; onNavigate?: () => void;
  }) => {
    void _prefetch;
    return <a href={href} {...props} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate?.();
    push(href, { scroll: scroll !== false });
    }}>{children}</a>;
  },
}));

import { PublicAuthControls } from "./public-auth-controls";
import { AuthModalShell } from "./auth-modal-shell";
import { SavedPostsProvider, useSavedPosts } from "../saved-posts-provider";
import { SubmissionProvider, useSubmission } from "../submissions/submission-provider";
import { PostCloseButton } from "../post-close-button";
import { installPublicAuthHistory } from "../../auth/public-auth-return";

let uninstallHistory: () => void;

beforeEach(() => {
  uninstallHistory = installPublicAuthHistory();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("CLERK_SECRET_KEY", "");
  // Simulate same-document traversal at the browser boundary. Happy DOM's
  // traversal can reload a page; the application expects native popstate.
  const commit = window.history.replaceState.bind(window.history);
  const entries = [{ href: window.location.href, state: window.history.state }];
  let cursor = 0;
  vi.spyOn(window.history, "pushState").mockImplementation((state, unused, url) => {
    entries.splice(cursor + 1);
    entries.push({ href: new URL(url ?? window.location.href, window.location.href).href, state });
    cursor++;
    commit(state, unused, entries[cursor].href);
  });
  vi.spyOn(window.history, "replaceState").mockImplementation((state, unused, url) => {
    entries[cursor] = { href: new URL(url ?? window.location.href, window.location.href).href, state };
    commit(state, unused, entries[cursor].href);
  });
  vi.spyOn(window.history, "back").mockImplementation(() => queueMicrotask(() => {
    if (cursor === 0) return;
    const entry = entries[--cursor];
    commit(entry.state, "", entry.href);
    window.dispatchEvent(new PopStateEvent("popstate", { state: entry.state }));
  }));
  push.mockImplementation((href: string) => window.history.pushState(null, "", href));
  replace.mockImplementation((href: string) => window.history.replaceState(null, "", href));
  back.mockImplementation(() => window.history.back());
});

function SaveWorkAction() {
  const { toggle } = useSavedPosts();
  return <button onClick={() => void toggle("work", false)}>Save work</button>;
}

function SubmitWorkAction() {
  const { openSubmission } = useSubmission();
  return <button onClick={openSubmission}>Submit work</button>;
}

it.each(["save", "submit"])("returns sign-in opened by %s work to the original Design URL", async (action) => {
  window.history.replaceState(null, "", "/?category=motion&view=oldest#work-list");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(action === "save"
      ? <SavedPostsProvider><SaveWorkAction /></SavedPostsProvider>
      : <SubmissionProvider authLoaded signedIn={false}><SubmitWorkAction /></SubmissionProvider>));
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(window.location.pathname).toBe("/sign-in");
    expect(push.mock.lastCall?.[1]).toEqual({ scroll: false });
    await act(async () => root.render(<AuthModalShell label="Sign in" overlay><button>Continue</button></AuthModalShell>));
    await act(async () => container.querySelector<HTMLElement>("[data-auth-dismiss]")!.click());
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/?category=motion&view=oldest#work-list");
    expect(replace).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
afterEach(() => { uninstallHistory(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(["/logos?kind=icon#selected-work", "/?category=motion&view=oldest#work-list", "/creators/amy#works"])("closes desktop sign-in back to its original URL %s", async (source) => {
  window.history.replaceState(null, "", source);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PublicAuthControls variant="desktop" />));
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/sign-in"]')!.click());
    expect(window.location.pathname).toBe("/sign-in");
    await act(async () => root.render(<AuthModalShell label="Sign in" overlay><button>Continue</button></AuthModalShell>));
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(replace).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLElement>("[data-auth-dismiss]")!.click());
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(source);
    expect(replace).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("keeps the safe home fallback for a full-page auth visit after a previous modal", async () => {
  window.history.replaceState(null, "", "/sign-in");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AuthModalShell label="Sign in"><button>Continue</button></AuthModalShell>));
    await act(async () => container.querySelector<HTMLElement>("[data-auth-dismiss]")!.click());
    expect(replace).toHaveBeenCalledExactlyOnceWith("/", { scroll: false });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("closes mobile sign-in at its own source page after visiting Clerk steps", async () => {
  window.history.replaceState(null, "", "/websites?view=oldest#website-list");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PublicAuthControls variant="mobile" />));
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/sign-in"]')!.click());
    expect(push).toHaveBeenCalledExactlyOnceWith("/sign-in", { scroll: false });
    window.history.pushState(null, "", "/sign-in/create");
    window.history.pushState(null, "", "/sign-in/create/verify-email-address");
    await act(async () => root.render(<AuthModalShell label="Sign in" overlay><button>Continue</button></AuthModalShell>));
    await act(async () => container.querySelector<HTMLElement>("[data-auth-dismiss]")!.click());
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/websites?view=oldest#website-list");
    expect(replace).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each([0, 2])("can close a work detail back to its archive after dismissing sign-in with %s Clerk steps", async (steps) => {
  window.history.replaceState({ page: "archive" }, "", "/?view=oldest");
  window.history.pushState({ page: "work" }, "", "/posts/fixture-work");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const routerDestinations: string[] = [];
  const observeRouter = () => routerDestinations.push(window.location.pathname);
  window.addEventListener("popstate", observeRouter);
  try {
    await act(async () => root.render(<SavedPostsProvider><SaveWorkAction /></SavedPostsProvider>));
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    for (let index = 0; index < steps; index++) window.history.pushState(null, "", `/sign-in/step-${index}`);
    await act(async () => root.render(<AuthModalShell label="Sign in" overlay><button>Continue</button></AuthModalShell>));
    await act(async () => container.querySelector<HTMLElement>("[data-auth-dismiss]")!.click());
    expect(window.location.pathname).toBe("/posts/fixture-work");
    expect(window.history.state).toEqual({ page: "work" });
    expect(routerDestinations).toEqual(["/posts/fixture-work"]);
    await act(async () => root.render(<PostCloseButton closeMode="back">Close work</PostCloseButton>));
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(`${window.location.pathname}${window.location.search}`).toBe("/?view=oldest");
    expect(window.history.state).toEqual({ page: "archive" });
    expect(routerDestinations).toEqual(["/posts/fixture-work", "/"]);
  } finally {
    window.removeEventListener("popstate", observeRouter);
    await act(async () => root.unmount());
    container.remove();
  }
});
