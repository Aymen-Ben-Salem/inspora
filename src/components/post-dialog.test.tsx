import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({
  layout: [] as Array<() => void | (() => void)>,
  passive: [] as Array<() => void | (() => void)>,
  root: null as HTMLElement | null,
  refIndex: 0,
  refs: [] as Array<{ current: unknown }>,
  createProxy: vi.fn(),
  tween: vi.fn(),
  set: vi.fn(),
  waitForMedia: vi.fn((_element: unknown, ready: () => void) => { ready(); return () => {}; }),
  mediaReady: true,
  measurements: [] as Array<{ overflow: string; gutter: string }>,
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (initial: unknown) => {
    const index = lifecycle.refIndex++;
    return lifecycle.refs[index] ??= { current: index === 0 ? lifecycle.root : initial };
  },
  useEffect: (effect: () => void | (() => void)) => lifecycle.passive.push(effect),
  useLayoutEffect: (effect: () => void | (() => void)) => lifecycle.layout.push(effect),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/logos",
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));
vi.mock("@gsap/react", () => ({
  useGSAP: (effect: () => void | (() => void)) => lifecycle.layout.push(() => {
    const style = document.documentElement.style;
    lifecycle.measurements.push({ overflow: style.overflow, gutter: style.scrollbarGutter });
    return effect();
  }),
}));
vi.mock("gsap", () => ({ default: {
  registerPlugin: vi.fn(),
  set: lifecycle.set,
  timeline: () => ({ to: lifecycle.tween, fromTo: lifecycle.tween, pause: vi.fn(), play: vi.fn(), kill: vi.fn() }),
} }));
vi.mock("./post-dialog-media-proxy", async (importOriginal) => ({
  ...await importOriginal<typeof import("./post-dialog-media-proxy")>(),
  createMediaProxy: lifecycle.createProxy,
  isMediaReady: () => lifecycle.mediaReady,
  waitForMediaReady: lifecycle.waitForMedia,
  removeMediaProxy: vi.fn(),
  getIntrinsicMediaAspectRatio: () => undefined,
  getCornerRadius: () => 0,
  findVisibleDialogHero: (root: HTMLElement) => root.querySelector("[data-post-dialog-hero]"),
}));
vi.mock("./looping-video", () => ({
  useFeedPlaybackSuspension: () => () => () => {},
  resumeLoopingVideos: vi.fn(),
}));
vi.mock("./post-transition-provider", () => ({
  usePostTransition: () => ({ isPostTransitionActive: () => false }),
}));

import { PostDialog, type PostDialogCloseMode } from "./post-dialog";

describe("post dialog scroll-lock lifecycle", () => {
  afterEach(() => {
    lifecycle.layout.length = 0;
    lifecycle.passive.length = 0;
    lifecycle.measurements.length = 0;
    lifecycle.root = null;
    lifecycle.refIndex = 0;
    lifecycle.refs.length = 0;
    lifecycle.mediaReady = true;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it.each<PostDialogCloseMode>(["custom", "back", "home"])(
    "%s keeps page width stable and locks before entrance measurement",
    (closeMode) => {
      // globals.css supplies a stable gutter when there is no inline override.
      const style = { overflow: "", scrollbarGutter: "" };
      vi.stubGlobal("document", { documentElement: { style } });
      vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
      renderToStaticMarkup(createElement(PostDialog, { closeMode, onClose: () => {} }));
      const cleanups: Array<() => void> = [];
      const pageWidth = () => style.scrollbarGutter === "auto" && style.overflow === "hidden" ? 1440 : 1425;
      const initialWidth = pageWidth();
      for (const effect of [...lifecycle.layout, ...lifecycle.passive]) {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      }
      const openWidth = pageWidth();
      cleanups.reverse().forEach((cleanup) => cleanup());
      expect({ open: openWidth, closed: pageWidth() }).toEqual({ open: initialWidth, closed: initialWidth });
      expect(lifecycle.measurements).toEqual([{ overflow: "hidden", gutter: "" }]);
      expect(style).toEqual({ overflow: "", scrollbarGutter: "" });
    },
  );

  it.each(["logo", "website", "cold-image", "routed-image", "streamed-image", "streamed-unmount", "streamed-close", "routed-after-close", "routed-after-back", "routed-swap"])("uses loaded media for %s entrance", (kind) => {
    const routed = kind.startsWith("routed") || kind.startsWith("streamed");
    lifecycle.mediaReady = kind !== "cold-image";
    let identity = kind;
    const rect = { width: 800, height: 450, left: 100, top: 100, right: 900, bottom: 550 };
    const style = { removeProperty: vi.fn() };
    let hasLayout = !kind.startsWith("streamed");
    const frames: FrameRequestCallback[] = [];
    const hero = {
      style, dataset: {}, hasAttribute: () => false,
      getBoundingClientRect: () => hasLayout ? rect : { ...rect, width: 0, height: 0 },
    };
    const gallery = { style, querySelectorAll: () => [] };
    const source = {
      dataset: { feedPostId: kind }, querySelector: () => null,
      getBoundingClientRect: () => ({ ...rect, width: 300, height: 169 }),
    };
    lifecycle.root = {
      style,
      querySelectorAll: () => [],
      querySelector: (selector: string) => ({
        "[data-post-dialog-backdrop]": { style },
        "[data-post-dialog-gallery]": gallery,
        "[data-post-dialog-sidebar]": { style },
        "[data-post-dialog-hero]": hero,
        "[data-post-dialog-post-id]": { dataset: { postDialogPostId: identity } },
      })[selector],
    } as unknown as HTMLElement;
    lifecycle.createProxy.mockReturnValue({ style });
    vi.stubGlobal("document", {
      documentElement: { style: { overflow: "", scrollbarGutter: "" } },
      querySelectorAll: () => [source],
    });
    vi.stubGlobal("window", {
      innerWidth: 1440, innerHeight: 900,
      requestAnimationFrame: (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; },
      cancelAnimationFrame: vi.fn(),
      matchMedia: () => ({ matches: false }),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    renderToStaticMarkup(createElement(PostDialog, {
      closeMode: routed ? "back" : "custom", transitionKey: kind, onClose: () => {},
    }));
    const cleanups = lifecycle.layout.map((effect) => effect());
    if (kind.startsWith("streamed")) {
      expect(lifecycle.tween).not.toHaveBeenCalled();
      expect(lifecycle.createProxy).not.toHaveBeenCalled();
      expect(frames).toHaveLength(1);
      if (kind === "streamed-unmount") {
        cleanups.reverse().forEach((cleanup) => cleanup?.());
        expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
        return;
      }
      if (kind === "streamed-close") {
        const keydown = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === "keydown")?.[1];
        if (typeof keydown !== "function") throw new Error("Missing close listener");
        keydown({ key: "Escape" } as KeyboardEvent);
        lifecycle.tween.mockClear();
        hasLayout = true;
        frames.shift()!(0);
        expect(lifecycle.tween).not.toHaveBeenCalled();
        expect(lifecycle.createProxy).not.toHaveBeenCalled();
        expect(frames).toHaveLength(0);
        return;
      }
      // A second frame without layout still must not consume the animation.
      frames.shift()!(0);
      expect(lifecycle.tween).not.toHaveBeenCalled();
      expect(frames).toHaveLength(1);
      hasLayout = true;
      frames.shift()!(0);
    }
    if (kind.startsWith("routed-after") || kind === "routed-swap") {
      if (kind === "routed-after-close") {
        const keydown = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === "keydown")?.[1];
        if (typeof keydown !== "function") throw new Error("Missing close listener");
        keydown({ key: "Escape" } as KeyboardEvent);
      }
      // Next retains refs when its Activity hides the dialog on return to the
      // feed. Next/previous navigation instead updates the still-open dialog.
      if (kind === "routed-swap") cleanups.at(-1)?.();
      else cleanups.reverse().forEach((cleanup) => cleanup?.());
      lifecycle.layout.length = 0;
      lifecycle.refIndex = 0;
      lifecycle.createProxy.mockClear();
      lifecycle.tween.mockClear();
      identity = "second-post";
      source.dataset.feedPostId = identity;
      renderToStaticMarkup(createElement(PostDialog, { closeMode: "back", transitionKey: identity }));
      if (kind === "routed-swap") lifecycle.layout.at(-1)!();
      else lifecycle.layout.forEach((effect) => effect());
      if (kind === "routed-swap") {
        expect(lifecycle.createProxy).not.toHaveBeenCalled();
        expect(lifecycle.tween).toHaveBeenCalledWith(gallery,
          expect.objectContaining({ scale: 0.95 }),
          expect.objectContaining({ scale: 1, duration: 0.7 }), 0);
        return;
      }
      expect(lifecycle.createProxy).toHaveBeenCalledWith(expect.objectContaining({ fallback: source, media: hero }));
    }
    // Retained design dialogs must clear GSAP's cached exit transform as well
    // as the inline CSS, otherwise their next close jumps to the feed size.
    expect(lifecycle.set).toHaveBeenCalledWith(hero, {
      clearProps: expect.stringContaining("transform"),
    });
    if (kind === "cold-image" || routed) {
      expect(lifecycle.createProxy).toHaveBeenCalledWith(expect.objectContaining({
        fallback: source, media: hero, mediaSourcePreference: "fallback",
      }));
      expect(lifecycle.waitForMedia).toHaveBeenCalled();
      return;
    }
    expect(lifecycle.createProxy).not.toHaveBeenCalled();
    expect(lifecycle.tween).toHaveBeenCalledWith(hero, expect.objectContaining({ scaleX: 1, scaleY: 1 }), 0);
    lifecycle.tween.mockClear();
    const keydown = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === "keydown")?.[1];
    if (typeof keydown !== "function") throw new Error("Missing close listener");
    keydown({ key: "Escape" } as KeyboardEvent);
    expect(lifecycle.createProxy).not.toHaveBeenCalled();
    expect(lifecycle.tween).toHaveBeenCalledWith(hero, expect.objectContaining({ scaleX: 300 / 800 }), expect.any(Number));
  });

});
