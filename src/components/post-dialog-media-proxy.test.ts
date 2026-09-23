import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findVisibleDialogHero,
  waitForMediaReady,
  resolveExitMediaRect,
  resolveFeedTransitionTarget,
  removeMediaProxy,
  resolveProxyTargetBoxShadow,
  resolveProxyObjectFit,
  resolveProxyObjectPosition,
  shouldAnimateDialogBackdrop,
} from "./post-dialog-media-proxy";

describe("post dialog media transitions", () => {
  it("ignores a preserved hidden hero when a visible website section is active", () => {
    const hiddenHero = {
      getBoundingClientRect: () => ({ height: 0, width: 0 }),
    } as unknown as HTMLElement;
    const visibleHero = {
      getBoundingClientRect: () => ({ height: 720, width: 1280 }),
    } as unknown as HTMLElement;
    const root = {
      querySelectorAll: () => [hiddenHero, visibleHero],
    } as unknown as HTMLElement;

    expect(findVisibleDialogHero(root)).toBe(visibleHero);
  });

  it("preserves contain sizing for transparent logo media", () => {
    expect(resolveProxyObjectFit("contain")).toBe("contain");
    expect(resolveProxyObjectFit("cover")).toBe("cover");
  });

  it("uses an explicit feed media wrapper as the transition target", () => {
    const target = {} as HTMLElement;
    const source = {
      querySelector: (selector: string) =>
        selector === "[data-feed-transition-target]" ? target : null,
    } as unknown as HTMLElement;

    expect(resolveFeedTransitionTarget(source)).toBe(target);
    expect(resolveFeedTransitionTarget(undefined)).toBeUndefined();
  });

  it("allows a detail hero to pin its proxy crop to the top", () => {
    expect(resolveProxyObjectPosition("50% 50%", "center top")).toBe(
      "center top",
    );
    expect(resolveProxyObjectPosition("50% 50%", undefined)).toBe("50% 50%");
  });

  it("matches a website exit proxy to the feed hero aspect ratio", () => {
    expect(
      resolveExitMediaRect({
        heroRect: { height: 1200, left: 24, top: 80, width: 1080 },
        matchSourceAspectRatio: true,
        sourceRect: { height: 659, left: 10, top: 20, width: 1080 },
      }),
    ).toEqual({ height: 659, left: 24, top: 80, width: 1080 });
  });

  it("pauses and detaches temporary video proxies before removal", () => {
    const video = {
      load: vi.fn(),
      pause: vi.fn(),
      removeAttribute: vi.fn(),
    };
    const proxy = {
      querySelectorAll: () => [video],
      remove: vi.fn(),
    };

    removeMediaProxy(proxy as unknown as HTMLElement);

    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(video.load).toHaveBeenCalledOnce();
    expect(proxy.remove).toHaveBeenCalledOnce();
  });
  it("keeps the backdrop visible behind transparent media", () => {
    const transparentHero = {
      hasAttribute: (name: string) =>
        name === "data-post-dialog-transparent-media",
    };
    const opaqueHero = {
      hasAttribute: () => false,
    };

    expect(shouldAnimateDialogBackdrop(transparentHero)).toBe(false);
    expect(shouldAnimateDialogBackdrop(opaqueHero)).toBe(true);
    expect(resolveProxyTargetBoxShadow(false)).toBe(
      "0 0 0 rgba(0, 0, 0, 0)",
    );
    expect(resolveProxyTargetBoxShadow(true)).toBe(
      "0 18px 60px rgba(0, 0, 0, 0.12)",
    );
  });
});


describe("transition media readiness", () => {
  afterEach(() => vi.unstubAllGlobals());

  function imageFixture() {
    let decoded!: () => void;
    class TestImage extends EventTarget {
      complete = false;
      naturalWidth = 0;
      decode = vi.fn(() => new Promise<void>((resolve) => { decoded = resolve; }));
    }
    vi.stubGlobal("HTMLImageElement", TestImage);
    vi.stubGlobal("HTMLVideoElement", class {});
    const media = new TestImage();
    const element = { querySelector: () => media } as unknown as HTMLElement;
    return { media, element, decode: () => decoded() };
  }

  it("retains the feed cover until the full-size image has loaded AND decoded", async () => {
    const { media, element, decode } = imageFixture();
    const ready = vi.fn();
    waitForMediaReady(element, ready);
    expect(ready).not.toHaveBeenCalled();
    media.dispatchEvent(new Event("load"));
    expect(ready).not.toHaveBeenCalled();
    decode();
    await Promise.resolve();
    expect(ready).toHaveBeenCalledOnce();
    media.dispatchEvent(new Event("load"));
    expect(ready).toHaveBeenCalledOnce();
  });

  it("does not start an animation or handoff after closing during decode", async () => {
    const { media, element, decode } = imageFixture();
    media.complete = true; media.naturalWidth = 800;
    const ready = vi.fn();
    const cancel = waitForMediaReady(element, ready);
    cancel(); decode();
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
  });

  it("releases the wait if the detail image fails", () => {
    const { media, element } = imageFixture();
    const ready = vi.fn();
    waitForMediaReady(element, ready);
    media.dispatchEvent(new Event("error"));
    expect(ready).toHaveBeenCalledOnce();
  });
});
