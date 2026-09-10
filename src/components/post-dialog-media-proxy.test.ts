import { describe, expect, it, vi } from "vitest";

import {
  resolveExitMediaRect,
  resolveFeedTransitionTarget,
  removeMediaProxy,
  resolveProxyTargetBoxShadow,
  resolveProxyObjectFit,
  resolveProxyObjectPosition,
  shouldAnimateDialogBackdrop,
} from "./post-dialog-media-proxy";

describe("post dialog media transitions", () => {
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
