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
    unobserve(target: Element) { if (this.entry.target === target) this.entry.target = undefined; }
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

function intersect(observer: Observer, target: Element, visible: boolean) {
  const rect = target.getBoundingClientRect();
  observer.callback(
    [{
      target,
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
  const [load, play] = observers.filter((observer) => observer.target === video);
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
  const [load, play] = observers.filter((observer) => observer.target === video);
  expect(video.hasAttribute("poster")).toBe(false);
  await act(async () => intersect(load, video, true));
  expect(video.getAttribute("src")).toBe("/preview.mp4");
  expect(video.poster).toBe("/poster.webp");
  expect(video.play).not.toHaveBeenCalled();

  await act(async () => intersect(play, video, true));
  expect(video.play).toHaveBeenCalled();
  video.currentTime = 4.5;
  vi.mocked(video.load).mockClear();
  vi.mocked(video.play).mockClear();
  await act(async () => intersect(play, video, false));
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

it("keeps visible feed videos playing throughout scrolling", async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<FeedPlaybackProvider><LoopingVideo src="/preview.mp4" suspendWithFeed /></FeedPlaybackProvider>));
  const video = container.querySelector("video")!;
  await scroll(video, true);
  video.currentTime = 4.5;
  vi.mocked(video.play).mockClear();
  vi.mocked(video.pause).mockClear();
  await act(async () => window.dispatchEvent(new Event("scroll")));
  await act(async () => vi.advanceTimersByTime(200));
  expect(video.pause).not.toHaveBeenCalled();
  await scroll(video, false);
  expect(video.pause).toHaveBeenCalled();
  vi.mocked(video.play).mockClear();
  await act(async () => window.dispatchEvent(new Event("scroll")));
  await scroll(video, true);
  expect(video.play).toHaveBeenCalled();
  expect(video.currentTime).toBe(4.5);
});

it("keeps a dialog background suspended across scrolling", async () => {
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
  vi.mocked(video.play).mockClear();
  await act(async () => vi.advanceTimersByTime(150));
  expect(video.play).not.toHaveBeenCalled();
  await act(async () => releaseDialog?.());
  expect(video.play).toHaveBeenCalledOnce();
});

it("defers only unstarted previews during scrolling and resumes visited ones immediately", async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<FeedPlaybackProvider>
    <LoopingVideo src="/visited.mp4" suspendWithFeed />
    <LoopingVideo src="/new.mp4" suspendWithFeed />
  </FeedPlaybackProvider>));
  const [visited, fresh] = [...container.querySelectorAll("video")];
  const visitedPlay = vi.fn().mockResolvedValue(undefined);
  const freshPlay = vi.fn().mockResolvedValue(undefined);
  visited.play = visitedPlay;
  fresh.play = freshPlay;
  await scroll(visited, true);
  await act(async () => window.dispatchEvent(new Event("scroll")));
  await scroll(visited, false);
  visitedPlay.mockClear();
  await scroll(fresh, true);
  expect(freshPlay).not.toHaveBeenCalled();
  await scroll(visited, true);
  expect(visitedPlay).toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(149));
  expect(freshPlay).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(freshPlay).toHaveBeenCalled();
});

function mockSafari() {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/27.0 Safari/605.1.15",
  );
}

function presentedFrames(video: HTMLVideoElement) {
  const state = { ready: 4, seeking: false };
  Object.defineProperties(video, {
    readyState: { get: () => state.ready },
    seeking: { get: () => state.seeking },
    videoWidth: { value: 1080 },
    videoHeight: { value: 608 },
  });
  let nextId = 0;
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  video.requestVideoFrameCallback = (callback) => { callbacks.set(++nextId, callback); return nextId; };
  video.cancelVideoFrameCallback = (id) => { callbacks.delete(id); };
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  return {
    state,
    drawImage,
    present() {
      const entry = callbacks.entries().next().value;
      expect(entry).toBeDefined();
      const [id, callback] = entry!;
      callbacks.delete(id);
      callback(performance.now(), {} as VideoFrameCallbackMetadata);
      return callback;
    },
  };
}

function safariSurface() {
  return {
    poster: container.querySelector<HTMLImageElement>('[data-video-fallback="poster"]')!,
    frame: container.querySelector<HTMLCanvasElement>('[data-video-fallback="frame"]')!,
  };
}

it("keeps the Safari thumbnail visible until a video frame is presented after seeking", async () => {
  mockSafari();
  const video = await mount();
  const frames = presentedFrames(video);
  const { poster, frame } = safariSurface();
  await scroll(video, true);
  expect(video.style.opacity).not.toBe("0");
  await act(async () => {
    video.dispatchEvent(new Event("loadeddata"));
    video.dispatchEvent(new Event("playing"));
  });
  expect(poster.style.visibility).toBe("visible");
  expect(frame.style.visibility).toBe("hidden");
  frames.state.seeking = true;
  frames.present();
  expect(poster.style.visibility).toBe("visible");
  frames.state.seeking = false;
  frames.present();
  expect(poster.style.visibility).toBe("hidden");
});

it.each(["Safari", "Chromium"])("holds the last %s frame through source eviction and timestamp restoration", async (browser) => {
  if (browser === "Safari") mockSafari();
  else vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36");
  await act(async () => root.render(<>{Array.from({ length: 16 }, (_, i) => (
    <LoopingVideo key={i} src={`/preview-${i}.mp4`} poster={`/poster-${i}.webp`} suspendWithFeed />
  ))}</>));
  const videos = [...container.querySelectorAll("video")];
  const video = videos[0];
  const frames = presentedFrames(video);
  const { poster, frame } = safariSurface();
  await scroll(video, true);
  video.currentTime = 4.5;
  frames.present();
  await scroll(video, false);
  expect(frames.drawImage).toHaveBeenCalledTimes(browser === "Safari" ? 1 : 0);
  expect(Math.max(frame.width, frame.height)).toBeLessThanOrEqual(384);
  expect(frame.style.visibility).toBe(browser === "Safari" ? "visible" : "hidden");
  if (browser === "Safari") expect(poster.style.visibility).toBe("hidden");
  else expect(poster).toBeNull();
  expect(frame.nextElementSibling).toBe(video);

  for (const other of videos.slice(1)) {
    await act(async () => {
      const pair = observers.filter((observer) => observer.target === other);
      pair.forEach((observer) => intersect(observer, other, true));
      pair.forEach((observer) => intersect(observer, other, false));
    });
  }
  expect(video.hasAttribute("src")).toBe(false);
  expect(frames.drawImage).toHaveBeenCalledOnce();
  expect(frame.width).toBeGreaterThan(0);
  expect(container.querySelectorAll("video[src]").length).toBeLessThanOrEqual(8);
  frames.state.ready = 0;
  await act(async () => video.dispatchEvent(new Event("emptied")));
  await scroll(video, true);
  expect(container.querySelector("video")).toBe(video);
  expect(frame.style.visibility).toBe("visible");
  if (browser === "Safari") expect(poster.style.visibility).toBe("hidden");
  else expect(poster).toBeNull();
  frames.state.ready = 4;
  frames.state.seeking = true;
  await act(async () => video.dispatchEvent(new Event("loadedmetadata")));
  expect(video.currentTime).toBe(4.5);
  frames.present();
  expect(frame.style.visibility).toBe("visible");
  frames.state.seeking = false;
  frames.present();
  expect(frame.style.visibility).toBe("hidden");
  expect(video.style.opacity).not.toBe("0");
  if (browser === "Safari") expect(poster.style.visibility).toBe("hidden");
  else expect(poster).toBeNull();
});

it("does not let an old Safari frame callback uncover a paused video", async () => {
  mockSafari();
  const video = await mount();
  const frames = presentedFrames(video);
  await scroll(video, true);
  video.currentTime = 4.5;
  const staleCallback = frames.present();
  await scroll(video, false);
  staleCallback(performance.now(), {} as VideoFrameCallbackMetadata);
  expect(safariSurface().frame.style.visibility).toBe("visible");
});

it("discards the saved Safari frame when the preview source changes", async () => {
  mockSafari();
  const video = await mount();
  const frames = presentedFrames(video);
  await scroll(video, true);
  video.currentTime = 4.5;
  frames.present();
  await scroll(video, false);
  const { frame } = safariSurface();
  expect(frame.width).toBeGreaterThan(0);
  await act(async () => root.render(<LoopingVideo src="/replacement.mp4" poster="/replacement.webp" suspendWithFeed />));
  expect(frame.width).toBe(0);
  expect(frame.style.visibility).toBe("hidden");
  expect(safariSurface().poster.src).toContain("/replacement.webp");
  expect(safariSurface().poster.style.visibility).toBe("visible");
});

it("keeps Safari's native paused frame if a canvas capture is unavailable", async () => {
  mockSafari();
  const video = await mount();
  const frames = presentedFrames(video);
  await scroll(video, true);
  video.currentTime = 4.5;
  frames.present();
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
  await scroll(video, false);
  expect(safariSurface().poster.style.visibility).toBe("hidden");
  expect(safariSurface().frame.style.visibility).toBe("hidden");
});

it("adds no image or canvas surfaces to detail videos", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36",
  );
  await mount({ suspendWithFeed: false });
  expect(container.querySelector("[data-video-fallback]")).toBeNull();
});

it("waits for paint in Safari environments without video-frame callbacks", async () => {
  mockSafari();
  const paints = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    paints.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { paints.delete(id); });
  const video = await mount();
  Object.defineProperty(video, "readyState", { get: () => 4 });
  await scroll(video, true);
  const paint = () => {
    const [id, callback] = paints.entries().next().value!;
    paints.delete(id);
    callback(performance.now());
  };
  paint();
  expect(safariSurface().poster.style.visibility).toBe("visible");
  paint();
  expect(safariSurface().poster.style.visibility).toBe("hidden");
});

it.each(["Safari", "Chromium"])("bounds %s still-frame storage in a long feed and frees it on unmount", async (browser) => {
  if (browser === "Safari") mockSafari();
  else vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36");
  await act(async () => root.render(<>{Array.from({ length: 70 }, (_, i) => (
    <LoopingVideo key={i} src={`/preview-${i}.mp4`} poster={`/poster-${i}.webp`} suspendWithFeed />
  ))}</>));
  for (const video of container.querySelectorAll("video")) {
    const frames = presentedFrames(video);
    const pair = observers.filter((observer) => observer.target === video);
    await act(async () => pair.forEach((observer) => intersect(observer, video, true)));
    video.currentTime = 1.25;
    frames.present();
    await act(async () => pair.forEach((observer) => intersect(observer, video, false)));
  }
  const canvases = [...container.querySelectorAll("canvas")];
  expect(canvases.filter((canvas) => canvas.width > 0).length).toBeLessThanOrEqual(64);
  expect(canvases.some((canvas) => canvas.width > 0)).toBe(true);
  expect(canvases.reduce((pixels, canvas) => pixels + canvas.width * canvas.height, 0)).toBeLessThanOrEqual(64 * 384 * 384);
  await act(async () => root.render(null));
  expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
});

it("keeps an unadvanced Safari frame visible without copying it", async () => {
  mockSafari();
  const video = await mount();
  const frames = presentedFrames(video);
  await scroll(video, true);
  frames.present();
  expect(video.currentTime).toBe(0);
  await scroll(video, false);
  expect(frames.drawImage).not.toHaveBeenCalled();
  expect(safariSurface().frame.width).toBe(0);
  expect(safariSurface().poster.style.visibility).toBe("hidden");
  expect(video.style.opacity).not.toBe("0");
});

it("avoids copying every visible Safari video when scrolling starts", async () => {
  mockSafari();
  vi.useFakeTimers();
  await act(async () => root.render(
    <FeedPlaybackProvider><LoopingVideo src="/preview.mp4" poster="/poster.webp" suspendWithFeed /></FeedPlaybackProvider>,
  ));
  const video = container.querySelector("video")!;
  const frames = presentedFrames(video);
  await scroll(video, true);
  video.currentTime = 4.5;
  frames.present();
  vi.mocked(video.pause).mockClear();
  await act(async () => window.dispatchEvent(new Event("scroll")));
  expect(video.pause).not.toHaveBeenCalled();
  expect(frames.drawImage).not.toHaveBeenCalled();
  expect(safariSurface().poster.style.visibility).toBe("hidden");
  await scroll(video, false);
  expect(frames.drawImage).toHaveBeenCalledOnce();
  expect(safariSurface().frame.style.visibility).toBe("visible");
});

it("prepares Safari thumbnails ahead of the video load margin without downloading videos", async () => {
  mockSafari();
  const video = await mount({ lazyPoster: true });
  const { poster } = safariSurface();
  const preparation = observers.find((observer) => observer.target === poster);
  expect(preparation).toBeDefined();
  expect(Number.parseInt(preparation!.options!.rootMargin!)).toBeGreaterThanOrEqual(window.innerHeight * 2);
  expect(poster.hasAttribute("src")).toBe(false);
  await act(async () => intersect(preparation!, poster, true));
  expect(poster.getAttribute("src")).toBe("/poster.webp");
  expect(video.hasAttribute("src")).toBe(false);
});

it.each(["Safari", "Chromium"])("never restores %s's original native poster after the video has painted", async (browser) => {
  if (browser === "Safari") mockSafari();
  else vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36");
  const video = await mount({ lazyPoster: true });
  const frames = presentedFrames(video);
  await scroll(video, true);
  frames.present();
  expect(video.hasAttribute("poster")).toBe(false);
  await scroll(video, false);
  await scroll(video, true);
  expect(video.hasAttribute("poster")).toBe(false);
  expect(video.style.opacity).not.toBe("0");
});

it("keeps the previous Safari backing frame if a later capture fails", async () => {
  mockSafari();
  const video = await mount();
  const frames = presentedFrames(video);
  await scroll(video, true);
  video.currentTime = 4.5;
  frames.present();
  await scroll(video, false);
  const { frame, poster } = safariSurface();
  const width = frame.width;
  await scroll(video, true);
  frames.present();
  video.currentTime = 5.5;
  frames.drawImage.mockImplementation(() => { throw new Error("Frame unavailable"); });
  await scroll(video, false);
  expect(frame.width).toBe(width);
  expect(frame.style.visibility).toBe("visible");
  expect(poster.style.visibility).toBe("hidden");
  expect(video.style.opacity).not.toBe("0");
});

it("prepares Chromium frames only with idle time and cancels preparation on return or unmount", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 Chrome/149.0.0.0 Safari/537.36");
  const idle = new Map<number, IdleRequestCallback>();
  let nextId = 0;
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    idle.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal("cancelIdleCallback", (id: number) => idle.delete(id));
  const video = await mount();
  const frames = presentedFrames(video);
  const runIdle = (remaining: number) => {
    const [id, callback] = idle.entries().next().value!;
    idle.delete(id);
    callback({ didTimeout: false, timeRemaining: () => remaining });
  };
  await scroll(video, true);
  video.currentTime = 4.5;
  frames.present();
  await scroll(video, false);
  expect(frames.drawImage).not.toHaveBeenCalled();
  runIdle(2);
  expect(frames.drawImage).not.toHaveBeenCalled();
  expect(idle.size).toBe(1);
  await scroll(video, true);
  expect(idle.size).toBe(0);
  frames.present();
  await scroll(video, false);
  runIdle(12);
  expect(frames.drawImage).toHaveBeenCalledOnce();
  expect(safariSurface().frame.width).toBeGreaterThan(0);
  expect(safariSurface().frame.style.zIndex).toBe("auto");
  await scroll(video, true);
  frames.present();
  video.currentTime = 5;
  await scroll(video, false);
  expect(idle.size).toBe(1);
  await act(async () => root.render(null));
  expect(idle.size).toBe(0);
});
