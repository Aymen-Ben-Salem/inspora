// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { measureSponsorPlacement } from "./measurement";

let intersect: (ratio: number) => void;
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
function fixture(withVideo = false, frames = false) {
  vi.useFakeTimers();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        intersect = (ratio) =>
          cb(
            [{ intersectionRatio: ratio } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const element = document.createElement("a");
  element.href = "https://sponsor.example";
  document.body.append(element);
  const video = withVideo ? document.createElement("video") : null;
  let frame: VideoFrameRequestCallback | undefined;
  if (video) {
    Object.defineProperties(video, {
      paused: { value: false, writable: true },
      duration: { value: 4, writable: true },
      currentTime: { value: 0, writable: true },
    });
    element.append(video);
    if (frames) {
      video.requestVideoFrameCallback = vi.fn((callback) => {
        frame = callback;
        return 1;
      });
      video.cancelVideoFrameCallback = vi.fn();
    }
  }
  const emit = vi.fn();
  const measurement = measureSponsorPlacement(element, emit);
  return {
    element,
    emit,
    measurement,
    video,
    frame(time: number) {
      frame?.(0, { mediaTime: time } as VideoFrameCallbackMetadata);
    },
  };
}
it("requires one continuous foreground second at fifty percent and cancels below threshold", () => {
  const f = fixture();
  intersect(0.5);
  vi.advanceTimersByTime(999);
  expect(f.emit).not.toHaveBeenCalled();
  intersect(0.49);
  vi.advanceTimersByTime(1);
  expect(f.emit).not.toHaveBeenCalled();
  intersect(0.5);
  vi.advanceTimersByTime(1000);
  expect(f.emit).toHaveBeenCalledExactlyOnceWith("sponsor_impression");
  intersect(0);
  intersect(1);
  vi.advanceTimersByTime(2000);
  expect(f.emit).toHaveBeenCalledTimes(1);
});
it("uses presented video frames for native loop completion when timeupdate skips the final frame", () => {
  const f = fixture(true, true),
    video = f.video!;
  intersect(1);
  video.dispatchEvent(new Event("playing"));
  for (const time of [0, 1, 2, 3, 3.958333, 0]) f.frame(time);
  expect(
    f.emit.mock.calls
      .filter(([kind]) => kind === "sponsor_preview_progress")
      .map(([, milestone]) => milestone),
  ).toEqual([25, 50, 75, 100]);
  for (const time of [1, 2, 3, 3.958333, 0]) f.frame(time);
  expect(
    f.emit.mock.calls.filter(([, milestone]) => milestone === 100),
  ).toHaveLength(1);
  f.measurement.dispose();
  expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
});
it("requires two continuous seconds of visible playing video and counts only its first-cycle progress", () => {
  const f = fixture(true),
    video = f.video!;
  intersect(1);
  video.dispatchEvent(new Event("playing"));
  vi.advanceTimersByTime(1999);
  expect(
    f.emit.mock.calls.filter(([kind]) => kind === "sponsor_preview_view"),
  ).toHaveLength(0);
  video.dispatchEvent(new Event("waiting"));
  vi.advanceTimersByTime(1000);
  video.dispatchEvent(new Event("playing"));
  vi.advanceTimersByTime(2000);
  expect(
    f.emit.mock.calls.filter(([kind]) => kind === "sponsor_preview_view"),
  ).toHaveLength(1);
  for (const time of [1, 2, 3, 3.95, 0.05, 1, 2, 3, 4]) {
    video.currentTime = time;
    video.dispatchEvent(new Event("timeupdate"));
  }
  expect(
    f.emit.mock.calls
      .filter(([kind]) => kind === "sponsor_preview_progress")
      .map(([, milestone]) => milestone),
  ).toEqual([25, 50, 75, 100]);
  video.dispatchEvent(new Event("playing"));
  vi.advanceTimersByTime(5000);
  expect(
    f.emit.mock.calls.filter(([kind]) => kind === "sponsor_preview_started"),
  ).toHaveLength(1);
  f.measurement.dispose();
});
it("resets on a hidden tab and disposes timers and actual activation listeners", () => {
  const f = fixture();
  intersect(1);
  vi.advanceTimersByTime(900);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(2000);
  expect(f.emit).not.toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(1000);
  expect(f.emit).toHaveBeenCalledWith("sponsor_impression");
  f.element.dispatchEvent(new MouseEvent("mouseover"));
  expect(f.emit).toHaveBeenCalledTimes(1);
  f.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(f.emit).toHaveBeenCalledWith("sponsor_click");
  f.measurement.dispose();
  f.element.dispatchEvent(new MouseEvent("click"));
  expect(f.emit).toHaveBeenCalledTimes(2);
});
