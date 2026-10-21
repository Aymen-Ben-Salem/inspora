// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/websites" }));
import { LoopingVideo } from "./looping-video";

type Observer = {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
};
let observers: Observer[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  observers = [];
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      observers.push({ callback, options });
    }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
    // Native load() resets playback even when the same source is reattached.
    this.currentTime = 0;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(props: Partial<ComponentProps<typeof LoopingVideo>> = {}) {
  await act(async () => root.render(<LoopingVideo src="/preview.mp4" poster="/poster.webp" suspendWithFeed {...props} />));
  return container.querySelector("video")!;
}

function intersect(observer: Observer, video: HTMLVideoElement, visible: boolean) {
  const rect = video.getBoundingClientRect();
  observer.callback(
    [{
      target: video,
      isIntersecting: visible,
      intersectionRatio: visible ? 1 : 0,
      boundingClientRect: rect,
      intersectionRect: rect,
      rootBounds: null,
      time: 0,
    }],
    {} as IntersectionObserver,
  );
}

async function scroll(video: HTMLVideoElement, visible: boolean, loadFirst = true) {
  const [load, play] = observers;
  await act(async () => {
    for (const observer of loadFirst ? [load, play] : [play, load]) {
      intersect(observer, video, visible);
    }
  });
}

it.each([true, false])("pauses offscreen feed videos and resumes the same source and position (load observer first: %s)", async (loadFirst) => {
  const video = await mount();
  expect(video.hasAttribute("src")).toBe(false);
  await scroll(video, true, loadFirst);
  video.currentTime = 4.5;
  vi.mocked(video.load).mockClear();
  vi.mocked(video.play).mockClear();
  vi.mocked(video.pause).mockClear();

  await scroll(video, false, loadFirst);
  expect(video.pause).toHaveBeenCalled();
  expect(video.play).not.toHaveBeenCalled();
  expect(video.getAttribute("src")).toBe("/preview.mp4");
  expect(video.load).not.toHaveBeenCalled();
  expect(video.currentTime).toBe(4.5);

  await scroll(video, true, loadFirst);
  expect(container.querySelector("video")).toBe(video);
  expect(video.load).not.toHaveBeenCalled();
  expect(video.currentTime).toBe(4.5);
  expect(video.play).toHaveBeenCalled();
});

it("continues releasing offscreen sources when explicitly requested by a detail gallery", async () => {
  const video = await mount({ releaseWhenNotVisible: true });
  await scroll(video, true);
  video.currentTime = 4.5;
  await scroll(video, false);
  expect(video.hasAttribute("src")).toBe(false);
  expect(video.currentTime).toBe(0);
  expect(observers[0].options?.rootMargin).toBe("0px");
});

it("loads a nearby preview without playing it before it enters the viewport", async () => {
  const video = await mount({ lazyPoster: true });
  expect(video.hasAttribute("poster")).toBe(false);
  await act(async () => intersect(observers[0], video, true));
  expect(video.getAttribute("src")).toBe("/preview.mp4");
  expect(video.poster).toBe("/poster.webp");
  expect(video.play).not.toHaveBeenCalled();

  await act(async () => intersect(observers[1], video, true));
  expect(video.play).toHaveBeenCalled();
  video.currentTime = 4.5;
  vi.mocked(video.load).mockClear();
  vi.mocked(video.play).mockClear();
  await act(async () => intersect(observers[1], video, false));
  expect(video.play).not.toHaveBeenCalled();
  expect(video.currentTime).toBe(4.5);
  expect(video.load).not.toHaveBeenCalled();
});

it("still releases a retained offscreen preview when the component becomes inactive", async () => {
  const video = await mount();
  await scroll(video, true);
  await scroll(video, false);
  expect(video.getAttribute("src")).toBe("/preview.mp4");

  await act(async () => root.render(<LoopingVideo src="/preview.mp4" poster="/poster.webp" suspendWithFeed active={false} />));
  expect(video.hasAttribute("src")).toBe(false);
});

it("still releases a retained offscreen preview after the hidden-tab grace period", async () => {
  vi.useFakeTimers();
  const video = await mount();
  await scroll(video, true);
  await scroll(video, false);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => vi.advanceTimersByTime(29_999));
  expect(video.getAttribute("src")).toBe("/preview.mp4");
  await act(async () => vi.advanceTimersByTime(1));
  expect(video.hasAttribute("src")).toBe(false);
});
