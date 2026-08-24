"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type MouseEvent as ReactMouseEvent,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getOptimisticHeroGeometry } from "./post-transition-geometry";

type TransitionKind = "open" | "swap";

type TransitionSource = {
  aspectRatio: number;
  creatorAvatarUrl?: string;
  creatorName?: string;
  id: number;
  kind: TransitionKind;
  path: string;
  rect: DOMRect;
  sourceRadius: number;
  title?: string;
  url: string;
};

type PostTransitionContextValue = {
  beginPostOpen: (source: HTMLElement, path: string) => void;
  beginPostSwap: (source: HTMLElement, path: string) => void;
  isPostTransitionActive: (path: string) => boolean;
};

const PostTransitionContext = createContext<PostTransitionContextValue | undefined>(
  undefined,
);

function getTransitionSource(
  element: HTMLElement,
  path: string,
  kind: TransitionKind,
): Omit<TransitionSource, "id"> | undefined {
  const feedTarget =
    kind === "swap"
      ? Array.from(
          document.querySelectorAll<HTMLElement>("[data-feed-post-pathname]"),
        ).find((candidate) => candidate.dataset.feedPostPathname === path)
      : undefined;
  const transitionElement = feedTarget ?? element;
  const media =
    transitionElement.querySelector<HTMLImageElement | HTMLVideoElement>(
      "[data-feed-transition-media]",
    ) ??
    transitionElement.querySelector<HTMLImageElement | HTMLVideoElement>(
      "img, video",
    );

  if (!media) return undefined;

  const url =
    media instanceof HTMLImageElement
      ? media.currentSrc || media.src
      : media.poster || media.currentSrc || media.src;

  if (!url) return undefined;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;

  const transitionRect = transitionElement.getBoundingClientRect();
  const aspectRatio =
    transitionRect.width > 0 && transitionRect.height > 0
      ? transitionRect.width / transitionRect.height
      : rect.width / rect.height;

  const metadataRoot =
    transitionElement.closest<HTMLElement>("[data-post-dialog-post-pathname]") ??
    transitionElement;
  const creatorAvatar = metadataRoot.querySelector<HTMLImageElement>(
    "[data-feed-creator-avatar], [data-post-dialog-creator-avatar]",
  );

  return {
    aspectRatio,
    creatorAvatarUrl: creatorAvatar?.currentSrc || creatorAvatar?.src || undefined,
    creatorName:
      metadataRoot.dataset.feedCreatorName ??
      metadataRoot.dataset.postDialogCreatorName,
    kind,
    path,
    rect,
    sourceRadius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
    title:
      metadataRoot.dataset.feedPostTitle ?? metadataRoot.dataset.postDialogPostTitle,
    url,
  };
}

function isPrimaryNavigation(event: ReactMouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function OptimisticPostTransition({
  contentReady,
  source,
  onDismiss,
  onComplete,
}: {
  contentReady: boolean;
  source: TransitionSource;
  onDismiss: () => void;
  onComplete: () => void;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const gallery = useRef<HTMLElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [entranceComplete, setEntranceComplete] = useState(false);
  const heroGeometry = getOptimisticHeroGeometry(source.aspectRatio);

  function handleClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (
      target instanceof Element &&
      !target.closest("[data-optimistic-post-surface]")
    ) {
      onDismiss();
    }
  }

  useLayoutEffect(() => {
    const backdropElement = backdrop.current;
    const galleryElement = gallery.current;
    const heroElement = hero.current;
    const sidebarElement = sidebar.current;

    if (!backdropElement || !galleryElement || !heroElement || !sidebarElement) {
      return;
    }

    const targetRect = heroElement.getBoundingClientRect();
    const scaleX = source.rect.width / targetRect.width;
    const scaleY = source.rect.height / targetRect.height;
    const sourceTransform = `translate3d(${source.rect.left - targetRect.left}px, ${source.rect.top - targetRect.top}px, 0) scale(${scaleX}, ${scaleY})`;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => setEntranceComplete(true));
      return () => window.cancelAnimationFrame(frame);
    }

    if (source.kind === "swap") {
      backdropElement.style.opacity = "1";
      const galleryAnimation = galleryElement.animate(
        [
          { opacity: 0.12, transform: "scale(0.95)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: 700,
          easing: "cubic-bezier(0.215, 0.61, 0.355, 1)",
          fill: "both",
        },
      );
      const sidebarAnimation = sidebarElement.animate(
        [
          { opacity: 0.14, transform: "translate3d(28px, 0, 0)" },
          { opacity: 1, transform: "none" },
        ],
        {
          delay: 40,
          duration: 700,
          easing: "cubic-bezier(0.215, 0.61, 0.355, 1)",
          fill: "both",
        },
      );

      sidebarAnimation.onfinish = () => setEntranceComplete(true);

      return () => {
        galleryAnimation.cancel();
        sidebarAnimation.cancel();
      };
    }

    const backdropAnimation = backdropElement.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      {
        duration: 220,
        easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        fill: "both",
      },
    );
    const sidebarAnimation = sidebarElement.animate(
      [{ transform: "translate3d(100%, 0, 0)" }, { transform: "none" }],
      {
        duration: 340,
        easing: "cubic-bezier(0.215, 0.61, 0.355, 1)",
        fill: "both",
      },
    );
    const heroAnimation = heroElement.animate(
      [
        {
          borderRadius: `${source.sourceRadius}px`,
          boxShadow: "0 0 0 rgba(0, 0, 0, 0)",
          transform: sourceTransform,
        },
        {
          borderRadius: "0",
          boxShadow: "0 18px 60px rgba(0, 0, 0, 0.12)",
          transform: "none",
        },
      ],
      {
        duration: 380,
        easing: "cubic-bezier(0.215, 0.61, 0.355, 1)",
        fill: "both",
      },
    );

    heroAnimation.onfinish = () => setEntranceComplete(true);

    return () => {
      backdropAnimation.cancel();
      sidebarAnimation.cancel();
      heroAnimation.cancel();
    };
  }, [source]);

  useEffect(() => {
    if (!contentReady || !entranceComplete) return;

    const root = scope.current;
    if (!root) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete();
      return;
    }

    const animation = root.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      fill: "forwards",
    });
    animation.onfinish = onComplete;

    return () => {
      animation.cancel();
    };
  }, [contentReady, entranceComplete, onComplete]);

  return (
    <div
      ref={scope}
      aria-hidden="true"
      onClick={handleClick}
      className="fixed inset-0 z-[60] isolate"
      data-optimistic-post-transition={source.path}
    >
      <div ref={backdrop} className="absolute inset-0 bg-gradient-to-b from-white to-[#d2d1d1]" />
      <div className="relative flex h-full w-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <section ref={gallery} className="flex min-h-[62dvh] min-w-0 flex-1 items-center justify-center overflow-hidden bg-transparent lg:h-[100dvh]">
          <figure className="flex min-w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-8 md:px-10 md:py-10 lg:h-full lg:py-0">
            <div
              ref={hero}
              data-optimistic-post-surface
              className="relative shrink-0 overflow-hidden bg-[#f3f3f3]"
              style={heroGeometry}
            >
              {/* The source is already an R2-optimized card asset; avoid a Vercel image request. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.url} alt="" className="size-full object-cover" />
            </div>
          </figure>
        </section>
        <aside
          ref={sidebar}
          data-optimistic-post-surface
          className="flex min-h-fit w-full flex-none flex-col border-t border-[#e6e6e6] bg-white lg:min-h-full lg:w-[clamp(360px,30vw,510px)] lg:shrink-0 lg:border-l lg:border-t-0"
        >
          <div className="flex flex-1 flex-col px-5 py-5 sm:px-7 lg:min-h-full lg:px-6 lg:py-5 xl:px-8 xl:py-6 min-[1700px]:px-10 min-[1700px]:py-7">
            <div className="flex h-10 items-center justify-between">
              <span className="flex size-9 items-center justify-center border border-[#e6e6e6] bg-[#e6e6e6] text-[#7b7b7b] sm:size-10 lg:size-9 xl:size-10">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 xl:size-[22px] min-[1800px]:size-6" fill="none">
                  <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <span className="flex items-center gap-3 xl:gap-4 min-[1700px]:gap-5">
                {(["left", "right"] as const).map((direction) => (
                  <span key={direction} className="flex size-9 items-center justify-center border border-[#e6e6e6] bg-[#e6e6e6] text-[#7b7b7b] sm:size-10 lg:size-9 xl:size-10">
                    <svg viewBox="0 0 27 27" aria-hidden="true" className={`size-[22px] xl:size-6 min-[1800px]:size-[27px] ${direction === "right" ? "rotate-180" : ""}`} fill="none">
                      <path d="M22 13.5H5m0 0 7-7m-7 7 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ))}
              </span>
            </div>

            <div className="flex flex-1 items-start pt-8 lg:pt-6 xl:pt-[30px]">
              <div className="flex w-full flex-col gap-6 xl:gap-8 min-[1700px]:gap-10">
                <div className="flex flex-col gap-3 xl:gap-4 min-[1700px]:gap-5">
                  <div className="flex flex-col items-start gap-2.5">
                    <span className="block h-6 w-20 bg-[#f0f0f0]" />
                    <div>
                      {source.title ? (
                        <h1 className="text-[18px] font-medium leading-normal tracking-[0.044px] text-black xl:text-[20px] min-[1700px]:text-[22px]">
                          {source.title}
                        </h1>
                      ) : null}
                      {source.creatorName ? (
                        <div className="mt-1 flex h-6 items-center gap-1.5 text-[13px] tracking-[0.032px] text-[rgba(88,88,88,0.8)] xl:mt-1.5 xl:h-7 xl:text-[14px] min-[1700px]:mt-2 min-[1700px]:h-[30px] min-[1700px]:gap-[7px] min-[1700px]:text-[16px]">
                          {source.creatorAvatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={source.creatorAvatarUrl} alt="" className="size-5 rounded-full object-cover xl:size-[22px] min-[1700px]:size-[25px]" />
                          ) : null}
                          <span>{source.creatorName}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex max-w-[429px] flex-col gap-2" aria-hidden="true">
                    <span className="h-[18px] w-full bg-[#f0f0f0]" />
                    <span className="h-[18px] w-5/6 bg-[#f0f0f0]" />
                  </div>
                </div>

                <div className="flex flex-col gap-3 xl:gap-3.5 min-[1700px]:gap-[15px]">
                  {(["Industries", "Colors", "Styles"] as const).map((label) => (
                    <div key={label} className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-3 xl:grid-cols-[92px_minmax(0,1fr)] xl:gap-4 min-[1700px]:grid-cols-[112px_minmax(0,1fr)] min-[1700px]:gap-5">
                      <span className="pt-1 text-[14px] tracking-[0.04px] text-[#262626] xl:text-[16px] min-[1700px]:text-[20px]">
                        {label}
                      </span>
                      <span className="flex flex-wrap gap-2.5" aria-hidden="true">
                        <span className="h-7 w-20 bg-[#e6e6e6] xl:h-8" />
                        <span className="h-7 w-14 bg-[#f0f0f0] xl:h-8" />
                      </span>
                    </div>
                  ))}
                </div>

                <span className="inline-flex h-9 w-full items-center justify-center bg-[#262626] text-[14px] font-medium tracking-[0.036px] text-white xl:h-[42px] xl:text-[16px] min-[1700px]:h-[43px] min-[1700px]:text-[18px]">
                  View original
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function PostTransitionProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const [source, setSource] = useState<TransitionSource>();
  const [contentReady, setContentReady] = useState(false);
  const activePath = useRef<string | undefined>(undefined);
  const nextId = useRef(0);

  const beginTransition = useCallback(
    (element: HTMLElement, path: string, kind: TransitionKind) => {
      const nextSource = getTransitionSource(element, path, kind);
      if (!nextSource) return;

      nextId.current += 1;
      activePath.current = path;
      setContentReady(false);
      setSource({ ...nextSource, id: nextId.current });
    },
    [],
  );

  const beginPostOpen = useCallback(
    (element: HTMLElement, path: string) => beginTransition(element, path, "open"),
    [beginTransition],
  );
  const beginPostSwap = useCallback(
    (element: HTMLElement, path: string) => beginTransition(element, path, "swap"),
    [beginTransition],
  );
  const isPostTransitionActive = useCallback(
    (path: string) => activePath.current === path,
    [],
  );

  useEffect(() => {
    if (!source || pathname !== source.path) return;

    let readyMedia: HTMLImageElement | HTMLVideoElement | undefined;
    let markedReady = false;

    const findResolvedPost = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-post-dialog-post-pathname]"),
      ).find((element) => element.dataset.postDialogPostPathname === source.path);

    const markReady = () => {
      if (markedReady) return;
      markedReady = true;
      setContentReady(true);
      observer.disconnect();
      window.clearTimeout(timeout);
      if (readyMedia) {
        readyMedia.removeEventListener("load", markReady);
        readyMedia.removeEventListener("loadeddata", markReady);
        readyMedia.removeEventListener("error", markReady);
      }
    };

    const watchResolvedPost = () => {
      const resolvedPost = findResolvedPost();
      if (!resolvedPost) return false;

      const media = resolvedPost.querySelector<HTMLImageElement | HTMLVideoElement>(
        "[data-post-dialog-hero] img, [data-post-dialog-hero] video",
      );

      if (!media) {
        markReady();
        return true;
      }

      const isReady =
        media instanceof HTMLImageElement ? media.complete : media.readyState >= 2;

      if (isReady) {
        markReady();
        return true;
      }

      if (readyMedia !== media) {
        readyMedia = media;
        const readyEvent = media instanceof HTMLImageElement ? "load" : "loadeddata";
        media.addEventListener(readyEvent, markReady, { once: true });
        media.addEventListener("error", markReady, { once: true });
      }

      observer.disconnect();
      return true;
    };

    const observer = new MutationObserver(() => {
      watchResolvedPost();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(markReady, 10_000);
    const frame = window.requestAnimationFrame(() => {
      watchResolvedPost();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.clearTimeout(timeout);
      if (readyMedia) {
        readyMedia.removeEventListener("load", markReady);
        readyMedia.removeEventListener("loadeddata", markReady);
        readyMedia.removeEventListener("error", markReady);
      }
    };
  }, [pathname, source]);

  const value = useMemo(
    () => ({ beginPostOpen, beginPostSwap, isPostTransitionActive }),
    [beginPostOpen, beginPostSwap, isPostTransitionActive],
  );
  const finishTransition = useCallback(() => {
    activePath.current = undefined;
    setSource(undefined);
  }, []);
  const dismissTransition = useCallback(() => {
    if (!source || pathname !== source.path) return;

    activePath.current = undefined;
    setSource(undefined);
    router.back();
  }, [pathname, router, source]);

  return (
    <PostTransitionContext.Provider value={value}>
      {children}
      {source ? (
        <OptimisticPostTransition
          key={source.id}
          contentReady={contentReady}
          source={source}
          onDismiss={dismissTransition}
          onComplete={finishTransition}
        />
      ) : null}
    </PostTransitionContext.Provider>
  );
}

export function usePostTransition() {
  const context = useContext(PostTransitionContext);

  if (!context) {
    throw new Error("usePostTransition must be used within PostTransitionProvider.");
  }

  return {
    ...context,
    isPrimaryNavigation,
  };
}
