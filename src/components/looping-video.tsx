"use client";

import {
  type ComponentPropsWithoutRef,
  useEffect,
  useRef,
} from "react";

type LoopingVideoProps = Omit<
  ComponentPropsWithoutRef<"video">,
  "autoPlay" | "controls" | "loop" | "muted" | "playsInline"
> & {
  eager?: boolean;
};

function playSilently(video: HTMLVideoElement) {
  video.controls = false;
  video.defaultMuted = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  void video.play().catch(() => {
    // The poster remains visible if a browser or device declines autoplay.
  });
}

function attachVideoSource(video: HTMLVideoElement, source: string | undefined) {
  if (!source || video.getAttribute("src") === source) return;
  video.src = source;
  video.load();
}

function detachVideoSource(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

export function resumeLoopingVideos(root: ParentNode) {
  root
    .querySelectorAll<HTMLVideoElement>("[data-looping-video]")
    .forEach(playSilently);
}

export function LoopingVideo({
  eager = false,
  preload,
  src,
  ...props
}: LoopingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    const source = typeof src === "string" ? src : undefined;

    if (eager || !("IntersectionObserver" in window)) {
      attachVideoSource(video, source);
      playSilently(video);
      const handleVisibility = () =>
        document.hidden ? video.pause() : playSilently(video);
      document.addEventListener("visibilitychange", handleVisibility);
      return () => document.removeEventListener("visibilitychange", handleVisibility);
    }

    let visible = false;
    const loadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          attachVideoSource(video, source);
          return;
        }
        detachVideoSource(video);
      },
      { rootMargin: "240px 0px", threshold: 0.01 },
    );
    const playObserver = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible && !document.hidden) {
          attachVideoSource(video, source);
          playSilently(video);
          return;
        }
        video.pause();
      },
      { threshold: 0.01 },
    );
    const handleVisibility = () => {
      if (document.hidden || !visible) video.pause();
      else playSilently(video);
    };

    loadObserver.observe(video);
    playObserver.observe(video);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      loadObserver.disconnect();
      playObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      detachVideoSource(video);
    };
  }, [eager, src]);

  return (
    <video
      ref={videoRef}
      {...props}
      src={eager ? src : undefined}
      data-looping-video
      autoPlay={eager}
      controls={false}
      controlsList="nodownload nofullscreen noremoteplayback"
      disablePictureInPicture
      disableRemotePlayback
      loop
      muted
      playsInline
      preload={preload ?? (eager ? "auto" : "none")}
    />
  );
}
