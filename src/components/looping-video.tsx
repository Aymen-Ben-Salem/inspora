"use client";

import {
  type ComponentPropsWithoutRef,
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createPlaybackSuspensionStore,
  type PlaybackSuspensionStore,
} from "./looping-video-state";

type LoopingVideoProps = Omit<
  ComponentPropsWithoutRef<"video">,
  "autoPlay" | "controls" | "loop" | "muted" | "playsInline"
> & {
  eager?: boolean;
  suspendWithFeed?: boolean;
};

type FeedPlaybackContextValue = {
  suspended: boolean;
  suspend: () => () => void;
};

const FeedPlaybackContext = createContext<FeedPlaybackContextValue | undefined>(
  undefined,
);

export function FeedPlaybackProvider({ children }: PropsWithChildren) {
  const [suspended, setSuspended] = useState(false);
  const [store] = useState<PlaybackSuspensionStore>(() =>
    createPlaybackSuspensionStore(setSuspended),
  );

  const suspend = useCallback(() => store.suspend(), [store]);
  const value = useMemo(() => ({ suspended, suspend }), [suspend, suspended]);

  return (
    <FeedPlaybackContext.Provider value={value}>
      {children}
    </FeedPlaybackContext.Provider>
  );
}

export function useFeedPlaybackSuspension() {
  const context = useContext(FeedPlaybackContext);
  if (!context) {
    throw new Error("useFeedPlaybackSuspension requires FeedPlaybackProvider.");
  }
  return context.suspend;
}

function playSilently(video: HTMLVideoElement) {
  video.controls = false;
  video.removeAttribute("controls");
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
  suspendWithFeed = false,
  ...props
}: LoopingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const feedPlayback = useContext(FeedPlaybackContext);
  const suspended = suspendWithFeed && Boolean(feedPlayback?.suspended);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    const removeInjectedControls = () => {
      if (video.controls || video.hasAttribute("controls")) {
        video.controls = false;
        video.removeAttribute("controls");
      }
    };
    const controlsObserver = new MutationObserver(removeInjectedControls);

    removeInjectedControls();
    controlsObserver.observe(video, {
      attributeFilter: ["controls"],
      attributes: true,
    });

    return () => controlsObserver.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    const source = typeof src === "string" ? src : undefined;

    if (suspended) {
      detachVideoSource(video);
      return;
    }

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
  }, [eager, src, suspended]);

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
