import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effect: vi.fn(), state: vi.fn(), setState: vi.fn(), auth: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => unknown, deps: unknown[]) => hooks.effect(effect, deps),
  useState: () => [hooks.state(), hooks.setState],
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => hooks.auth() }));

import { refreshViewerProfile, useViewerProfile, type ViewerProfileState } from "./use-viewer-profile";
import { ViewerProfileProvider } from "./viewer-profile-provider";

const profile = {
  id: "creator-a", name: "Saved viewer", username: "viewer_a",
  avatarUrl: "https://example.com/saved.jpg", websiteUrl: null, xProfileUrl: null,
};
const fetchMock = vi.fn();
const cleanup: Array<() => void> = [];

function Consumer() {
  const viewer = useViewerProfile("viewer-a");
  return createElement("span", null, viewer.profile?.avatarUrl ?? "loading");
}

function renderPage(key: string) {
  return renderToStaticMarkup(createElement(ViewerProfileProvider, {} as PropsWithChildren,
    createElement(Consumer, { key: key + "-desktop" }),
    createElement(Consumer, { key: key + "-mobile" })));
}

function mountProvider() {
  const html = renderPage("initial");
  const dispose = hooks.effect.mock.lastCall![0]() as (() => void) | undefined;
  if (dispose) cleanup.push(dispose);
  return html;
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.mockReturnValue(null);
  hooks.auth.mockReturnValue({ isSignedIn: true, userId: "viewer-a" });
  hooks.setState.mockImplementation((next: ViewerProfileState | ((value: ViewerProfileState | null) => ViewerProfileState)) => {
    hooks.state.mockReturnValue(typeof next === "function" ? next(hooks.state()) : next);
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => profile });
});
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe("persistent viewer profile provider", () => {
  it("shares one lookup between desktop/mobile and retains it for new page consumers", async () => {
    expect(mountProvider()).toContain("loading");
    await vi.waitFor(() => expect(hooks.setState).toHaveBeenCalled());
    const loaded = { userId: "viewer-a", profile, isLoading: false };
    expect(hooks.state()).toEqual(loaded);
    for (const page of ["websites", "designs"]) {
      expect(renderPage(page)).toContain(profile.avatarUrl);
      expect(hooks.effect.mock.lastCall![1]).toEqual(["viewer-a"]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not request data while signed out", () => {
    hooks.auth.mockReturnValue({ isSignedIn: false, userId: null });
    mountProvider();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a completed lookup from a preceding account", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => { resolve = done; });
    fetchMock.mockReturnValueOnce(pending);
    mountProvider();
    cleanup.pop()!();
    hooks.auth.mockReturnValue({ isSignedIn: true, userId: "viewer-b" });
    resolve({ ok: true, json: async () => profile });
    await pending;
    await new Promise((done) => setTimeout(done, 0));
    expect(hooks.setState).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("keeps the saved photo during edits and failed refreshes", async () => {
    mountProvider();
    await vi.waitFor(() => expect(hooks.setState).toHaveBeenCalled());
    fetchMock.mockResolvedValueOnce({ ok: false });
    refreshViewerProfile();
    expect(renderPage("during-refresh")).toContain(profile.avatarUrl);
    await vi.waitFor(() => expect(hooks.setState).toHaveBeenCalledTimes(2));
    expect(renderPage("after-error")).toContain(profile.avatarUrl);
    const updated = { ...profile, avatarUrl: "https://example.com/new.jpg" };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => updated });
    refreshViewerProfile();
    await vi.waitFor(() => expect(hooks.state().profile).toEqual(updated));
    expect(renderPage("after-edit")).toContain(updated.avatarUrl);
  });

  it("ends loading after an initial error and cleans up its refresh listener", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    mountProvider();
    await vi.waitFor(() => expect(hooks.state()).toEqual({ userId: "viewer-a", profile: null, isLoading: false }));
    cleanup.pop()!();
    refreshViewerProfile();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
