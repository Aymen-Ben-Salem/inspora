import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effect: vi.fn(), state: vi.fn(), setState: vi.fn(),
}));
vi.mock("react", () => ({
  useEffect: (effect: () => unknown) => hooks.effect(effect),
  useState: () => [hooks.state(), hooks.setState],
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/creators/someone_else" }));

import { refreshViewerProfile, useViewerProfile } from "./use-viewer-profile";

const profile = { name: "Saved viewer", avatarUrl: "https://example.com/saved.jpg" };
const fetchMock = vi.fn();
const cleanup: Array<() => void> = [];

function useMountedViewerProfile(userId?: string) {
  const value = useViewerProfile(userId);
  const dispose = hooks.effect.mock.lastCall![0]() as (() => void) | undefined;
  if (dispose) cleanup.push(dispose);
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.mockReturnValue(null);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => profile });
});
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe("viewer profile lookup", () => {
  it("loads the authenticated viewer, even on someone else's public page", async () => {
    useMountedViewerProfile("viewer-a");
    expect(fetchMock).toHaveBeenCalledWith("/api/profile", expect.objectContaining({ cache: "no-store" }));
    await vi.waitFor(() => expect(hooks.setState).toHaveBeenCalledWith({ userId: "viewer-a", profile }));
  });

  it("never displays the preceding account's saved profile", () => {
    hooks.state.mockReturnValue({ userId: "viewer-a", profile });
    expect(useViewerProfile("viewer-a")).toEqual(profile);
    expect(useViewerProfile("viewer-b")).toBeNull();
    expect(useViewerProfile(undefined)).toBeNull();
  });

  it("does not request a profile while signed out", () => {
    useMountedViewerProfile();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a completed request from an unmounted account", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => { resolve = done; });
    fetchMock.mockReturnValueOnce(pending);
    useMountedViewerProfile("viewer-a");
    cleanup.pop()!();
    resolve({ ok: true, json: async () => profile });
    await pending;
    await new Promise((done) => setTimeout(done, 0));
    expect(hooks.setState).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("refreshes after a saved edit and removes the listener on unmount", async () => {
    useMountedViewerProfile("viewer-a");
    await vi.waitFor(() => expect(hooks.setState).toHaveBeenCalled());
    const changed = { ...profile, avatarUrl: "https://example.com/new.jpg" };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => changed });
    refreshViewerProfile();
    await vi.waitFor(() => expect(hooks.setState).toHaveBeenLastCalledWith({ userId: "viewer-a", profile: changed }));
    cleanup.pop()!();
    refreshViewerProfile();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
