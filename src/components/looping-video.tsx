"use client";

import { usePathname } from "next/navigation";
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
  getHiddenVideoGraceRemaining,
  HIDDEN_VIDEO_GRACE_MS,
  type PlaybackSuspensionStore,
} from "./looping-video-state";
import { FeedVideoSurface, type FeedVideoSurfaceHandle } from "./feed-video-surface";


const RECONCILE_EVENT = "looping-video-reconcile";
// Retain two recently visited desktop rows; older previews keep only a timestamp.
const MAX_PAUSED_FEED_VIDEOS = 8;
const pausedFeedVideos = new Map<HTMLVideoElement, () => void>();

function retainPausedFeedVideo(video: HTMLVideoElement, release: () => void) {
  if (!video.hasAttribute("src") || pausedFeedVideos.has(video)) return;
  pausedFeedVideos.set(video, release);
  if (pausedFeedVideos.size <= MAX_PAUSED_FEED_VIDEOS) return;
  const oldest = pausedFeedVideos.keys().next().value;
  if (!oldest) return;
  const releaseOldest = pausedFeedVideos.get(oldest);
  pausedFeedVideos.delete(oldest);
  releaseOldest?.();
}

type LoopingVideoProps = Omit<
  ComponentPropsWithoutRef<"video">,
  "autoPlay" | "controls" | "loop" | "muted" | "playsInline"
> & {
  active?: boolean;
  eager?: boolean;
  lazyPoster?: boolean;
  preservePositionWhileInactive?: boolean;
  releaseWhenNotVisible?: boolean;
  suspendWithFeed?: boolean;
};

type FeedPlaybackContextValue = {
  suspended: boolean;
  scrolling: boolean;
  suspend: () => () => void;
};

const FeedPlaybackContext = createContext<FeedPlaybackContextValue | undefined>(
  undefined,
);

export function FeedPlaybackProvider({ children }: PropsWithChildren) {
  const [suspended, setSuspended] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [store] = useState<PlaybackSuspensionStore>(() =>
    createPlaybackSuspensionStore(setSuspended),
  );

  useEffect(() => {
    let timer: number | undefined;
    const handleScroll = () => {
      setScrolling(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setScrolling(false), 150);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.clearTimeout(timer);
    };
  }, []);

  const suspend = useCallback(() => store.suspend(), [store]);
  const value = useMemo(() => ({ suspended, scrolling, suspend }), [suspend, suspended, scrolling]);

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

function attachVideoSource(
  video: HTMLVideoElement,
  source: string | undefined,
  savedPosition: number | undefined,
) {
  if (!source || video.getAttribute("src") === source) return;

  video.src = source;
  video.load();

  if (savedPosition === undefined) return;
  const restore = () => {
    if (Number.isFinite(savedPosition)) {
      try {
        video.currentTime = savedPosition;
      } catch {
        // A browser may reject seeking until it has decoded enough metadata.
      }
    }
  };
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) restore();
  else {
    video.addEventListener("loadedmetadata", restore, { once: true });
    return () => video.removeEventListener("loadedmetadata", restore);
  }
}

function detachVideoSource(
  video: HTMLVideoElement,
  savePosition: boolean,
) {
  if (
    savePosition && video.hasAttribute("src") &&
    video.readyState >= HTMLMediaElement.HAVE_METADATA &&
    Number.isFinite(video.currentTime)
  ) {
    const position = video.currentTime;
    video.pause();
    video.removeAttribute("src");
    video.load();
    return position;
  }

  video.pause();
  if (!video.hasAttribute("src")) return undefined;
  video.removeAttribute("src");
  video.load();
  return undefined;
}

export function resumeLoopingVideos(root: ParentNode) {
  root
    .querySelectorAll<HTMLVideoElement>("[data-looping-video]")
    .forEach((video) => video.dispatchEvent(new Event(RECONCILE_EVENT)));
}

export function LoopingVideo({
  active = true,
  eager = false,
  lazyPoster = false,
  poster,
  preload,
  preservePositionWhileInactive = false,
  releaseWhenNotVisible = false,
  src,
  suspendWithFeed = false,
  ...props
}: LoopingVideoProps) {
  const pathname = usePathname();
  const [mountedPathname] = useState(pathname);
  const videoRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<FeedVideoSurfaceHandle | null>(null);
  const savedPositionRef = useRef<{ source: string; time: number } | undefined>(undefined);
  const feedPlayback = useContext(FeedPlaybackContext);
  const suspended = suspendWithFeed && Boolean(feedPlayback?.suspended);
  const scrolling = suspendWithFeed && Boolean(feedPlayback?.scrolling);
  // Intercepted post routes keep the archive mounted behind the dialog.
  const routeActive = pathname === mountedPathname ||
    (suspendWithFeed && pathname.startsWith("/posts/"));
  const playbackState = useRef({ active, routeActive, suspended, scrolling });

  useEffect(() => {
    playbackState.current = { active, routeActive, suspended, scrolling };
    videoRef.current?.dispatchEvent(new Event(RECONCILE_EVENT));
  }, [active, routeActive, suspended, scrolling]);

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
    let visible = false;
    let started = false;
    let withinLoadMargin = false;
    let hiddenAt: number | undefined;
    let hiddenCleanup: number | undefined;
    let removePositionRestore: (() => void) | undefined;

    const clearHiddenCleanup = () => {
      if (hiddenCleanup !== undefined) {
        window.clearTimeout(hiddenCleanup);
        hiddenCleanup = undefined;
      }
    };
    const detach = (savePosition = preservePositionWhileInactive) => {
      surfaceRef.current?.hold(true);
      pausedFeedVideos.delete(video);
      removePositionRestore?.();
      removePositionRestore = undefined;
      const saved = detachVideoSource(video, savePosition);
      if (saved !== undefined && source) savedPositionRef.current = { source, time: saved };
      else if (!savePosition) savedPositionRef.current = undefined;
    };
    const pause = () => {
      // Visible videos retain their native paused frame. Capture departing cards
      // individually instead of copying the whole viewport for dialog suspension.
      if (!visible) surfaceRef.current?.hold();
      video.pause();
    };
    const scheduleHiddenCleanup = () => {
      clearHiddenCleanup();
      if (hiddenAt === undefined) return;
      const remaining = getHiddenVideoGraceRemaining(hiddenAt, Date.now());
      hiddenCleanup = window.setTimeout(() => {
        hiddenCleanup = undefined;
        if (document.hidden) detach();
      }, remaining);
    };
    const reconcile = () => {
      const { active, routeActive, suspended, scrolling } = playbackState.current;
      if (!active || !routeActive) {
        clearHiddenCleanup();
        detach();
        return;
      }

      if (document.hidden) {
        pause();
        hiddenAt ??= Date.now();
        if (Date.now() - hiddenAt >= HIDDEN_VIDEO_GRACE_MS) detach();
        else scheduleHiddenCleanup();
        return;
      }

      hiddenAt = undefined;
      clearHiddenCleanup();
      if (!withinLoadMargin) {
        if (releaseWhenNotVisible) detach(false);
        else {
          pause();
          retainPausedFeedVideo(video, () => detach(true));
        }
        return;
      }

      if (lazyPoster && poster && !video.hasAttribute("data-looping-video-painted") &&
        video.getAttribute("poster") !== poster) {
        video.poster = poster;
      }
      pausedFeedVideos.delete(video);
      if (source && video.getAttribute("src") !== source) {
        surfaceRef.current?.loading();
        removePositionRestore?.();
        const saved = savedPositionRef.current;
        removePositionRestore = attachVideoSource(
          video, source, saved?.source === source ? saved.time : undefined,
        );
      }
      // During scrolling, continue/resume visited previews immediately. Defer
      // only the first playback of new rows that may just pass through view.
      if (visible && !suspended && (started || !scrolling)) {
        started = true;
        if (video.paused) {
          surfaceRef.current?.waitForFrame();
          playSilently(video);
        }
      } else pause();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        pause();
        scheduleHiddenCleanup();
      } else {
        reconcile();
      }
    };

    let loadObserver: IntersectionObserver | undefined;
    let playObserver: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window) {
      loadObserver = new IntersectionObserver(
        ([entry]) => {
          withinLoadMargin = Boolean(entry?.isIntersecting);
          reconcile();
        },
        {
          rootMargin: releaseWhenNotVisible ? "0px" : "240px 0px",
          threshold: 0.01,
        },
      );
      playObserver = new IntersectionObserver(
        ([entry]) => {
          visible = Boolean(entry?.isIntersecting);
          reconcile();
        },
        { threshold: 0.01 },
      );
      loadObserver.observe(video);
      playObserver.observe(video);
    } else {
      withinLoadMargin = true;
      visible = true;
      reconcile();
    }

    video.addEventListener(RECONCILE_EVENT, reconcile);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearHiddenCleanup();
      loadObserver?.disconnect();
      playObserver?.disconnect();
      video.removeEventListener(RECONCILE_EVENT, reconcile);
      document.removeEventListener("visibilitychange", handleVisibility);
      detach();
    };
  }, [
    eager,
    lazyPoster,
    poster,
    preservePositionWhileInactive,
    releaseWhenNotVisible,
    src,
  ]);

  return (
    <>
      {suspendWithFeed ? (
        <FeedVideoSurface
          videoRef={videoRef}
          surfaceRef={surfaceRef}
          poster={poster}
          source={typeof src === "string" ? src : undefined}
          eager={eager || !lazyPoster}
        />
      ) : null}
      <video
        ref={videoRef}
        {...props}
        poster={lazyPoster && !eager ? undefined : poster}
        data-looping-video
        autoPlay={false}
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        loop
        muted
        playsInline
        preload={preload ?? (eager ? "auto" : "none")}
      />
    </>
  );
}
