import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effects: [] as Array<{ effect: () => void | (() => void); deps: unknown[] }>,
  refs: [] as Array<{ current: unknown }>, refIndex: 0,
  pathname: "/", suspended: false, video: null as unknown,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef: (initial: unknown) => { const index = hooks.refIndex++; return hooks.refs[index] ?? (hooks.refs[index] = { current: index === 0 ? hooks.video : initial }); },
  useState: () => ["/"],
  useContext: () => ({ suspended: hooks.suspended }),
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => hooks.effects.push({ effect, deps }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => hooks.pathname }));
import { LoopingVideo } from "./looping-video";

afterEach(() => { hooks.effects = []; hooks.refs = []; hooks.refIndex = 0; hooks.pathname = "/"; hooks.suspended = false; vi.unstubAllGlobals(); });

it("pauses retained feed media across dialog navigation without unloading or restarting it", () => {
  const events = new EventTarget();
  let source: string | undefined;
  const video = {
    currentTime: 4.5, readyState: 4,
    pause: vi.fn(), play: vi.fn(async () => {}), load: vi.fn(),
    get src() { return source; }, set src(value: string | undefined) { source = value; },
    hasAttribute: (name: string) => name === "src" && Boolean(source),
    getAttribute: (name: string) => name === "src" ? source : null,
    removeAttribute: vi.fn((name: string) => { if (name === "src") source = undefined; }),
    setAttribute: vi.fn(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  hooks.video = video;
  vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("window", { clearTimeout, setTimeout });
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
  const mounted: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  function render() {
    hooks.refIndex = 0; hooks.effects = [];
    renderToStaticMarkup(createElement(LoopingVideo, { src: "/preview.mp4", suspendWithFeed: true }));
    hooks.effects.forEach(({ effect, deps }, i) => {
      if (mounted[i] && deps.every((dep, j) => Object.is(dep, mounted[i].deps[j]))) return;
      mounted[i]?.cleanup?.();
      mounted[i] = { deps, cleanup: effect() || undefined };
    });
  }
  render();
  expect(source).toBe("/preview.mp4");
  video.load.mockClear(); video.play.mockClear();
  hooks.pathname = "/posts/example";
  render(); // Navigation may commit before the dialog's suspension effect.
  hooks.suspended = true;
  render();
  expect(source).toBe("/preview.mp4");
  expect(video.load).not.toHaveBeenCalled();
  expect(video.pause).toHaveBeenCalled();
  hooks.pathname = "/"; hooks.suspended = false;
  render();
  expect(video.load).not.toHaveBeenCalled();
  expect(video.currentTime).toBe(4.5);
  expect(video.play).toHaveBeenCalled();
  hooks.pathname = "/logos";
  render();
  expect(source).toBeUndefined(); // Real page navigation still releases resources.
  mounted.reverse().forEach(({ cleanup }) => cleanup?.());
});
