import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({
  layout: [] as Array<() => void | (() => void)>,
  passive: [] as Array<() => void | (() => void)>,
  root: null as HTMLElement | null,
  refIndex: 0,
  createProxy: vi.fn(),
  tween: vi.fn(),
  waitForMedia: vi.fn((_element: unknown, ready: () => void) => { ready(); return () => {}; }),
  mediaReady: true,
  measurements: [] as Array<{ overflow: string; gutter: string }>,
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (initial: unknown) => ({ current: lifecycle.refIndex++ === 0 ? lifecycle.root : initial }),
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
  set: vi.fn(),
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

  it.each(["logo", "website", "cold-image", "routed-image"])("uses loaded media for %s entrance", (kind) => {
    lifecycle.mediaReady = kind !== "cold-image";
    const rect = { width: 800, height: 450, left: 100, top: 100, right: 900, bottom: 550 };
    const style = { removeProperty: vi.fn() };
    const hero = {
      style, dataset: {}, hasAttribute: () => false,
      getBoundingClientRect: () => rect,
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
        "[data-post-dialog-post-id]": { dataset: { postDialogPostId: kind } },
      })[selector],
    } as unknown as HTMLElement;
    lifecycle.createProxy.mockReturnValue({ style });
    vi.stubGlobal("document", {
      documentElement: { style: { overflow: "", scrollbarGutter: "" } },
      querySelectorAll: () => [source],
    });
    vi.stubGlobal("window", {
      innerWidth: 1440, innerHeight: 900,
      matchMedia: () => ({ matches: false }),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    renderToStaticMarkup(createElement(PostDialog, {
      closeMode: kind === "routed-image" ? "back" : "custom", transitionKey: kind, onClose: () => {},
    }));
    lifecycle.layout.forEach((effect) => effect());
    if (kind === "cold-image" || kind === "routed-image") {
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
