"use client";

import { type RefObject, useEffect, useRef, useSyncExternalStore } from "react";

// Bound still-image storage separately from the much smaller video source cache.
const MAX_SAVED_FRAMES = 64;
const MAX_FRAME_EDGE = 384;
const savedFrames = new Map<HTMLCanvasElement, () => void>();
const pendingPosters = new Map<HTMLImageElement, string>();
let posterObserver: IntersectionObserver | undefined;

function preparePoster(image: HTMLImageElement, poster: string) {
  if (!("IntersectionObserver" in window)) {
    image.src = poster;
    return;
  }
  const stop = (target: HTMLImageElement) => {
    pendingPosters.delete(target);
    posterObserver?.unobserve(target);
    if (pendingPosters.size === 0) {
      posterObserver?.disconnect();
      posterObserver = undefined;
    }
  };
  posterObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const target = entry.target as HTMLImageElement;
      const source = pendingPosters.get(target);
      if (source) target.src = source;
      stop(target);
    }
  }, { rootMargin: `${Math.max(1000, window.innerHeight * 2)}px 0px` });
  pendingPosters.set(image, poster);
  posterObserver.observe(image);
  return () => stop(image);
}

const subscribe = () => () => {};
const serverSnapshot = () => false;
const safariSnapshot = () =>
  /AppleWebKit/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) &&
  !/Chrome|Chromium|CriOS|Edg|OPR|Android/.test(navigator.userAgent);

export type SafariVideoSurfaceHandle = {
  hold: () => void;
  loading: () => void;
  waitForFrame: () => void;
};

export function SafariVideoSurface({
  videoRef,
  surfaceRef,
  poster,
  source,
  eager,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  surfaceRef: RefObject<SafariVideoSurfaceHandle | null>;
  poster?: string;
  source?: string;
  eager: boolean;
}) {
  const enabled = useSyncExternalStore(subscribe, safariSnapshot, serverSnapshot);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!enabled || !image || !poster || eager) return;
    return preparePoster(image, poster);
  }, [enabled, poster, eager]);

  useEffect(() => {
    const video = videoRef.current;
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !video || !image || !canvas) return;

    let pending = true;
    let coverPausedFrame = false;
    let hasFrame = false;
    let hasSnapshot = false;
    let snapshotTime: number | undefined;
    let frameRequest: number | undefined;
    let paintRequest: number | undefined;
    let generation = 0;
    const originalPosition = video.style.position;
    if (getComputedStyle(video).position === "static") video.style.position = "relative";

    const updateSurface = () => {
      image.style.visibility = !hasSnapshot && !hasFrame ? "visible" : "hidden";
      canvas.style.visibility = pending && hasSnapshot ? "visible" : "hidden";
      canvas.style.zIndex = coverPausedFrame ? "1" : "auto";
    };
    const releaseSnapshot = () => {
      savedFrames.delete(canvas);
      canvas.width = 0;
      canvas.height = 0;
      hasSnapshot = false;
      snapshotTime = undefined;
      updateSurface();
    };
    const cancelFrame = () => {
      generation++;
      if (frameRequest !== undefined) video.cancelVideoFrameCallback(frameRequest);
      if (paintRequest !== undefined) cancelAnimationFrame(paintRequest);
      frameRequest = undefined;
      paintRequest = undefined;
    };
    const loading = () => {
      cancelFrame();
      hasFrame = false;
      coverPausedFrame = false;
      pending = true;
      updateSurface();
    };
    const waitForFrame = () => {
      if (!pending || frameRequest !== undefined || paintRequest !== undefined) return;
      const requestedGeneration = generation;
      const presented = () => {
        if (requestedGeneration !== generation) return;
        frameRequest = undefined;
        paintRequest = undefined;
        if (video.readyState < 2 || video.seeking) {
          waitForFrame();
          return;
        }
        hasFrame = true;
        coverPausedFrame = false;
        pending = false;
        video.dataset.loopingVideoPainted = "";
        video.removeAttribute("poster");
        updateSurface();
      };
      if (typeof video.requestVideoFrameCallback === "function") {
        frameRequest = video.requestVideoFrameCallback(presented);
      } else if (video.readyState >= 2 && !video.seeking) {
        paintRequest = requestAnimationFrame(() => {
          paintRequest = requestAnimationFrame(presented);
        });
      }
    };
    const hold = () => {
      cancelFrame();
      // An unplayed preview can keep its poster; copying its first frame only
      // adds GPU work while new rows pass through the viewport during scrolling.
      if (hasFrame && video.currentTime > 0 && video.readyState >= 2 && !video.seeking &&
        video.videoWidth > 0 && video.videoHeight > 0 && snapshotTime !== video.currentTime) {
        try {
          const scale = Math.min(1, MAX_FRAME_EDGE / video.videoWidth, MAX_FRAME_EDGE / video.videoHeight);
          const width = Math.max(1, Math.round(video.videoWidth * scale));
          const height = Math.max(1, Math.round(video.videoHeight * scale));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            hasSnapshot = false;
          }
          const context = canvas.getContext("2d", { alpha: false });
          if (context) {
            // Keep the canvas on screen; no pixel readback/export or CORS change.
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            hasSnapshot = true;
            snapshotTime = video.currentTime;
            savedFrames.delete(canvas);
            savedFrames.set(canvas, releaseSnapshot);
            if (savedFrames.size > MAX_SAVED_FRAMES) savedFrames.values().next().value?.();
          } else if (!hasSnapshot) releaseSnapshot();
        } catch {
          if (!hasSnapshot) releaseSnapshot();
        }
      }
      pending = true;
      coverPausedFrame = hasSnapshot;
      updateSurface();
    };

    const handle = {
      hold,
      loading,
      waitForFrame: () => {
        // Expose the native paused frame before play, with the snapshot beneath
        // it until presentation. Keeping video renderable avoids reload stalls.
        coverPausedFrame = false;
        updateSurface();
        waitForFrame();
      },
    };
    surfaceRef.current = handle;
    video.addEventListener("emptied", loading);
    video.addEventListener("playing", waitForFrame);
    video.addEventListener("loadeddata", waitForFrame);
    video.addEventListener("seeked", waitForFrame);
    updateSurface();
    waitForFrame();
    return () => {
      cancelFrame();
      video.removeEventListener("emptied", loading);
      video.removeEventListener("playing", waitForFrame);
      video.removeEventListener("loadeddata", waitForFrame);
      video.removeEventListener("seeked", waitForFrame);
      releaseSnapshot();
      video.style.position = originalPosition;
      delete video.dataset.loopingVideoPainted;
      if (surfaceRef.current === handle) surfaceRef.current = null;
    };
  }, [enabled, poster, source, surfaceRef, videoRef]);

  if (!enabled || !poster) return null;
  return (
    <>
      {/* Keep a backing surface below Safari's native video layer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        data-video-fallback="poster"
        src={eager ? poster : undefined}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="eager"
        className="pointer-events-none absolute inset-0 size-full object-cover"
      />
      <canvas
        ref={canvasRef}
        data-video-fallback="frame"
        aria-hidden="true"
        width={0}
        height={0}
        className="pointer-events-none absolute inset-0 size-full object-cover"
        style={{ visibility: "hidden" }}
      />
    </>
  );
}
