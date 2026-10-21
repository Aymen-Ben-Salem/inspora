// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/websites" }));
import { FeedPlaybackProvider, LoopingVideo, useFeedPlaybackSuspension } from "./looping-video";

type Observer = {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  target?: Element;
};
let observers: Observer[];
let container: HTMLDivElement;
let root: Root;
const metadataConstant = Object.getOwnPropertyDescriptor(HTMLMediaElement, "HAVE_METADATA");

beforeEach(() => {
  // happy-dom omits the native ready-state constants.
  Object.defineProperty(HTMLMediaElement, "HAVE_METADATA", { configurable: true, value: 1 });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  observers = [];
  vi.stubGlobal("IntersectionObserver", class {
    entry: Observer;
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.entry = { callback, options };
      observers.push(this.entry);
    }
    observe(target: Element) { this.entry.target = target; }
    disconnect() { this.entry.target = undefined; }
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
  if (metadataConstant) Object.defineProperty(HTMLMediaElement, "HAVE_METADATA", metadataConstant);
  else Reflect.deleteProperty(HTMLMediaElement, "HAVE_METADATA");
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

async function browseFeed(count = 64) {
  await act(async () => root.render(<>{Array.from({ length: count }, (_, i) => <LoopingVideo key={i} src={`/preview-${i}.mp4`} suspendWithFeed />)}</>));
  const videos = [...container.querySelectorAll("video")];
  const readyState = vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  const setVisible = (video: HTMLVideoElement, visible: boolean) => {
    observers.filter((observer) => observer.target === video).forEach((observer) => intersect(observer, video, visible));
  };
  for (let row = 0; row < videos.length; row += 4) {
    await act(async () => {
      if (row > 0) videos.slice(row - 4, row).forEach((video) => setVisible(video, false));
      videos.slice(row, row + 4).forEach((video, i) => { setVisible(video, true); video.currentTime = 4.5 + i; });
    });
  }
  return { videos, readyState, setVisible };
}

it("bounds paused sources while browsing a long feed and restores evicted playback positions", async () => {
  const { videos, setVisible } = await browseFeed();
  expect(container.querySelectorAll("video[src]").length).toBeLessThanOrEqual(12);
  expect(videos[0].hasAttribute("src")).toBe(false);
  await act(async () => setVisible(videos[0], true));
  expect(videos[0].currentTime).toBe(4.5);
  expect(videos[0].play).toHaveBeenCalled();
});

it("keeps the saved position when fast scrolling evicts a preview before metadata reloads", async () => {
  const { videos, readyState, setVisible } = await browseFeed(16);
  const first = videos[0];
  const removeListener = vi.spyOn(first, "removeEventListener");
  readyState.mockReturnValue(0);
  await act(async () => { setVisible(first, true); setVisible(first, false); });
  // Revisit enough other previews to evict the pending metadata request.
  await act(async () => videos.slice(4).forEach((video) => { setVisible(video, true); setVisible(video, false); }));
  expect(first.hasAttribute("src")).toBe(false);
  expect(removeListener).toHaveBeenCalledWith("loadedmetadata", expect.any(Function));

  await act(async () => setVisible(first, true));
  readyState.mockReturnValue(4);
  await act(async () => first.dispatchEvent(new Event("loadedmetadata")));
  expect(first.currentTime).toBe(4.5);
});

it("does not restore an evicted timestamp onto a replacement video source", async () => {
  const { videos, setVisible } = await browseFeed(16);
  await act(async () => root.render(<>{videos.map((_, i) => <LoopingVideo key={i} src={i === 0 ? "/replacement.mp4" : `/preview-${i}.mp4`} suspendWithFeed />)}</>));
  expect(container.querySelector("video")).toBe(videos[0]);
  await act(async () => setVisible(videos[0], true));
  expect(videos[0].getAttribute("src")).toBe("/replacement.mp4");
  expect(videos[0].currentTime).toBe(0);
});

it("clears an older cached timestamp when inactive playback is explicitly released", async () => {
  const { videos, setVisible } = await browseFeed(16);
  await act(async () => setVisible(videos[0], true));
  videos[0].currentTime = 9;
  const render = (active: boolean) => root.render(<>{videos.map((_, i) => <LoopingVideo key={i} src={`/preview-${i}.mp4`} suspendWithFeed active={i === 0 ? active : true} />)}</>);
  await act(async () => render(false));
  await act(async () => render(true));
  expect(videos[0].currentTime).toBe(0);
});

it("pauses feed decoding throughout scrolling and resumes once scrolling settles", async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<FeedPlaybackProvider><LoopingVideo src="/preview.mp4" suspendWithFeed /></FeedPlaybackProvider>));
  const video = container.querySelector("video")!;
  await scroll(video, true);
  video.currentTime = 4.5;
  vi.mocked(video.play).mockClear();
  vi.mocked(video.pause).mockClear();

  await act(async () => window.dispatchEvent(new Event("scroll")));
  expect(video.pause).toHaveBeenCalled();
  await scroll(video, true);
  expect(video.play).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(149));
  expect(video.play).not.toHaveBeenCalled();

  await act(async () => window.dispatchEvent(new Event("scroll")));
  await act(async () => vi.advanceTimersByTime(149));
  expect(video.play).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(video.play).toHaveBeenCalledOnce();
  expect(video.currentTime).toBe(4.5);
});

it("does not resume a suspended dialog background when the scroll timer finishes", async () => {
  vi.useFakeTimers();
  let releaseDialog: (() => void) | undefined;
  function DialogControl() {
    const suspend = useFeedPlaybackSuspension();
    return <button onClick={() => { releaseDialog = suspend(); }}>Open dialog</button>;
  }
  await act(async () => root.render(<FeedPlaybackProvider><DialogControl /><LoopingVideo src="/preview.mp4" suspendWithFeed /></FeedPlaybackProvider>));
  const video = container.querySelector("video")!;
  await scroll(video, true);
  vi.mocked(video.play).mockClear();
  await act(async () => window.dispatchEvent(new Event("scroll")));
  await act(async () => container.querySelector("button")!.click());
  await act(async () => vi.advanceTimersByTime(150));
  expect(video.play).not.toHaveBeenCalled();
  await act(async () => releaseDialog?.());
  expect(video.play).toHaveBeenCalledOnce();
});
