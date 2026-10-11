import type { EventKind } from "./types";

// One observer per original placement. Decorative copies only share activation.
export function measureSponsorPlacement(
  element: HTMLElement,
  emit: (kind: EventKind, milestone?: 25 | 50 | 75 | 100) => void,
) {
  let ratio = 0,
    impressed = false,
    started = false,
    viewed = false,
    disposed = false;
  let impressionTimer: ReturnType<typeof setTimeout> | undefined;
  let playbackTimer: ReturnType<typeof setTimeout> | undefined;
  let playingSince: number | null = null,
    previousTime = 0,
    firstCycle = true;
  const milestones = new Set<number>();
  const video = element.querySelector("video");
  let playing = Boolean(
    video && !video.paused && !video.ended && video.readyState >= 3,
  );
  const foreground = () =>
    !disposed && document.visibilityState !== "hidden" && ratio >= 0.5;
  function update() {
    clearTimeout(playbackTimer);
    playbackTimer = undefined;
    if (!foreground()) {
      clearTimeout(impressionTimer);
      impressionTimer = undefined;
      playingSince = null;
      return;
    }
    if (!impressed && !impressionTimer)
      impressionTimer = setTimeout(() => {
        impressionTimer = undefined;
        if (foreground()) {
          impressed = true;
          emit("sponsor_impression");
        }
      }, 1000);
    if (video && playing && !video.paused && !video.ended) {
      if (!started) {
        started = true;
        emit("sponsor_preview_started");
      }
      playingSince ??= Date.now();
      if (!viewed)
        playbackTimer = setTimeout(
          () => {
            if (
              foreground() &&
              video &&
              playing &&
              !video.paused &&
              !video.ended
            ) {
              viewed = true;
              emit("sponsor_preview_view");
            }
          },
          Math.max(0, 2000 - (Date.now() - playingSince)),
        );
    } else playingSince = null;
  }
  const framed = typeof video?.requestVideoFrameCallback === "function";
  let frameRequest: number | undefined;
  function recordProgress(time: number) {
    if (!video) return;
    if (time < previousTime) {
      if (
        firstCycle &&
        foreground() &&
        playing &&
        Number.isFinite(video.duration) &&
        previousTime >= video.duration - 0.3 &&
        time < 0.3 &&
        !milestones.has(100)
      ) {
        milestones.add(100);
        emit("sponsor_preview_progress", 100);
      }
      firstCycle = false;
    }
    previousTime = time;
    if (
      !firstCycle ||
      !foreground() ||
      !playing ||
      video.paused ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    )
      return;
    const percent = (time / video.duration) * 100;
    for (const n of [25, 50, 75, 100] as const)
      if (percent >= n && !milestones.has(n)) {
        milestones.add(n);
        emit("sponsor_preview_progress", n);
      }
  }
  const progress = () => {
    if (video && !framed) recordProgress(video.currentTime);
  };
  const presented: VideoFrameRequestCallback = (_now, metadata) => {
    if (disposed || !video) return;
    recordProgress(metadata.mediaTime);
    frameRequest = video.requestVideoFrameCallback(presented);
  };
  // Native looping videos need not dispatch ended. Presented frame timestamps
  // retain the first cycle's tail even when coarse timeupdate skips that tail.
  if (video && framed)
    frameRequest = video.requestVideoFrameCallback(presented);
  const begin = () => {
    playing = true;
    update();
  };
  const pause = () => {
    playing = false;
    playingSince = null;
    update();
  };
  function ended() {
    if (firstCycle && foreground() && !milestones.has(100)) {
      milestones.add(100);
      emit("sponsor_preview_progress", 100);
    }
    firstCycle = false;
    playingSince = null;
    update();
  }
  const observer = new IntersectionObserver(
    (entries) => {
      ratio = entries[0]?.intersectionRatio ?? 0;
      update();
    },
    { threshold: [0, 0.5, 1] },
  );
  observer.observe(element);
  const activate = (event: Event) => {
    const target =
      event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (
      !target ||
      !element.contains(target) ||
      (event instanceof MouseEvent &&
        event.type === "auxclick" &&
        event.button !== 1)
    )
      return;
    emit("sponsor_click");
  };
  element.addEventListener("click", activate);
  element.addEventListener("auxclick", activate);
  document.addEventListener("visibilitychange", update);
  video?.addEventListener("playing", begin);
  video?.addEventListener("pause", pause);
  video?.addEventListener("waiting", pause);
  video?.addEventListener("timeupdate", progress);
  video?.addEventListener("ended", ended);
  return {
    dispose() {
      disposed = true;
      observer.disconnect();
      clearTimeout(impressionTimer);
      clearTimeout(playbackTimer);
      if (video && frameRequest !== undefined)
        video.cancelVideoFrameCallback(frameRequest);
      element.removeEventListener("click", activate);
      element.removeEventListener("auxclick", activate);
      document.removeEventListener("visibilitychange", update);
      video?.removeEventListener("playing", begin);
      video?.removeEventListener("pause", pause);
      video?.removeEventListener("waiting", pause);
      video?.removeEventListener("timeupdate", progress);
      video?.removeEventListener("ended", ended);
    },
  };
}
