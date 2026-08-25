import { describe, expect, it, vi } from "vitest";

import { createPlaybackSuspensionStore } from "./looping-video-state";

describe("feed playback suspension", () => {
  it("remains suspended until every caller releases its token", () => {
    const onChange = vi.fn();
    const store = createPlaybackSuspensionStore(onChange);

    const releaseDialog = store.suspend();
    const releaseTransition = store.suspend();

    expect(store.isSuspended()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true);

    releaseDialog();
    expect(store.isSuspended()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);

    releaseTransition();
    expect(store.isSuspended()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("makes release callbacks idempotent", () => {
    const onChange = vi.fn();
    const store = createPlaybackSuspensionStore(onChange);
    const release = store.suspend();

    release();
    release();

    expect(store.isSuspended()).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });
});
