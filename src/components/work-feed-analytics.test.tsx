// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pathname: "/", suspended: false, observe: vi.fn(), dispose: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("./looping-video", () => ({ useFeedSuspended: () => state.suspended }));
vi.mock("@/analytics/work-feed-views", () => ({ observeWorkFeedViews: state.observe }));
import { WorkFeedAnalytics } from "./work-feed-analytics";
it("stops measuring feed cards behind a work dialog and resumes after closing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.observe.mockReturnValue(state.dispose);
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<WorkFeedAnalytics />));
    expect(state.observe).toHaveBeenCalledExactlyOnceWith("/");
    state.suspended = true;
    await act(async () => root.render(<WorkFeedAnalytics />));
    expect(state.dispose).toHaveBeenCalledTimes(1);
    expect(state.observe).toHaveBeenCalledTimes(1);
    state.suspended = false;
    await act(async () => root.render(<WorkFeedAnalytics />));
    expect(state.observe).toHaveBeenCalledTimes(2);
    state.pathname = "/logos";
    await act(async () => root.render(<WorkFeedAnalytics />));
    expect(state.observe).toHaveBeenLastCalledWith("/logos");
    expect(state.dispose).toHaveBeenCalledTimes(2);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
