import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "preview-viewer" }),
}));

import { SavedPostsProvider, useSavedPosts } from "./saved-posts-provider";

const capture = vi.fn<(value: ReturnType<typeof useSavedPosts>) => void>();
function Consumer() {
  capture(useSavedPosts());
  return null;
}
function saved() {
  return capture.mock.lastCall![0];
}
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  renderToStaticMarkup(<SavedPostsProvider><Consumer /></SavedPostsProvider>);
});
afterEach(() => vi.unstubAllGlobals());

describe("saved collection cache after mutations", () => {
  it.each([false, true])("refreshes server collections after a successful toggle from %s", async (current) => {
    let finish!: (response: { ok: boolean }) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const mutation = saved().toggle("fixture", current);
    expect(fetchMock).toHaveBeenCalledWith("/api/saved-posts/fixture", expect.objectContaining({
      method: current ? "DELETE" : "POST",
    }));
    expect(router.refresh).not.toHaveBeenCalled();
    finish({ ok: true });
    expect(await mutation).toBe(!current);
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("restores the prior save state when the request fails", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await saved().toggle("fixture", true)).toBe(true);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
