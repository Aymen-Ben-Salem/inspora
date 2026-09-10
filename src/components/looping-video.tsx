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


const RECONCILE_EVENT = "looping-video-reconcile";

type LoopingVideoProps = Omit<
  ComponentPropsWithoutRef<"video">,
  "autoPlay" | "controls" | "loop" | "muted" | "playsInline"
> & {
  active?: boolean;
  eager?: boolean;
  preservePositionWhileInactive?: boolean;
  releaseWhenNotVisible?: boolean;
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
  else video.addEventListener("loadedmetadata", restore, { once: true });
}

function detachVideoSource(
  video: HTMLVideoElement,
  savePosition: boolean,
) {
  if (savePosition && Number.isFinite(video.currentTime)) {
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
  const savedPositionRef = useRef<number | undefined>(undefined);
  const feedPlayback = useContext(FeedPlaybackContext);
  const suspended = suspendWithFeed && Boolean(feedPlayback?.suspended);
  const routeActive = pathname === mountedPathname;

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
    const lifecycleActive = active && routeActive && !suspended;
    let visible = false;
    let withinLoadMargin = false;
    let hiddenAt: number | undefined;
    let hiddenCleanup: number | undefined;

    const clearHiddenCleanup = () => {
      if (hiddenCleanup !== undefined) {
        window.clearTimeout(hiddenCleanup);
        hiddenCleanup = undefined;
      }
    };
    const detach = (savePosition = preservePositionWhileInactive) => {
      const saved = detachVideoSource(video, savePosition);
      if (saved !== undefined) savedPositionRef.current = saved;
    };
    const scheduleHiddenCleanup = () => {
      clearHiddenCleanup();
      if (hiddenAt === undefined) return;
      const remaining = getHiddenVideoGraceRemaining(hiddenAt, Date.now());
      hiddenCleanup = window.setTimeout(() => {
        hiddenCleanup = undefined;
        if (document.hidden && lifecycleActive) detach();
      }, remaining);
    };
    const reconcile = () => {
      if (!lifecycleActive) {
        clearHiddenCleanup();
        detach();
        return;
      }

      if (document.hidden) {
        video.pause();
        hiddenAt ??= Date.now();
        if (Date.now() - hiddenAt >= HIDDEN_VIDEO_GRACE_MS) detach();
        else scheduleHiddenCleanup();
        return;
      }

      hiddenAt = undefined;
      clearHiddenCleanup();
      if (!withinLoadMargin) {
        detach(false);
        return;
      }

      attachVideoSource(video, source, savedPositionRef.current);
      if (visible) playSilently(video);
      else video.pause();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        video.pause();
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
    active,
    eager,
    preservePositionWhileInactive,
    releaseWhenNotVisible,
    routeActive,
    src,
    suspended,
  ]);

  return (
    <video
      ref={videoRef}
      {...props}
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
  );
}
