"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { usePathname } from "next/navigation";
import {
  createContext,
  type MouseEvent as ReactMouseEvent,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

gsap.registerPlugin(useGSAP);

type TransitionKind = "open" | "swap";

type TransitionSource = {
  aspectRatio: number;
  id: number;
  kind: TransitionKind;
  path: string;
  rect: DOMRect;
  sourceRadius: number;
  url: string;
};

type PostTransitionContextValue = {
  beginPostOpen: (source: HTMLElement, path: string) => void;
  beginPostSwap: (source: HTMLElement, path: string) => void;
};

const PostTransitionContext = createContext<PostTransitionContextValue | undefined>(
  undefined,
);

function getTransitionSource(
  element: HTMLElement,
  path: string,
  kind: TransitionKind,
): Omit<TransitionSource, "id"> | undefined {
  const media = element.querySelector<HTMLImageElement | HTMLVideoElement>("img, video");

  if (!media) return undefined;

  const url =
    media instanceof HTMLImageElement
      ? media.currentSrc || media.src
      : media.poster || media.currentSrc || media.src;

  if (!url) return undefined;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;

  return {
    aspectRatio: rect.width / rect.height,
    kind,
    path,
    rect,
    sourceRadius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
    url,
  };
}

function isPrimaryNavigation(event: ReactMouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function OptimisticPostTransition({
  contentReady,
  source,
  onComplete,
}: {
  contentReady: boolean;
  source: TransitionSource;
  onComplete: () => void;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [entranceComplete, setEntranceComplete] = useState(false);

  useGSAP(
    () => {
      const root = scope.current;
      const backdropElement = backdrop.current;
      const heroElement = hero.current;
      const sidebarElement = sidebar.current;

      if (!root || !backdropElement || !heroElement || !sidebarElement) return;

      const targetRect = heroElement.getBoundingClientRect();
      const scaleX = source.rect.width / targetRect.width;
      const scaleY = source.rect.height / targetRect.height;

      gsap.set(backdropElement, { autoAlpha: 0 });
      gsap.set(sidebarElement, { xPercent: 100, willChange: "transform" });
      gsap.set(heroElement, {
        borderRadius: source.sourceRadius,
        boxShadow: "0 0 0 rgba(0,0,0,0)",
        transformOrigin: "top left",
        x: source.rect.left - targetRect.left,
        y: source.rect.top - targetRect.top,
        scaleX,
        scaleY,
        willChange: "transform,border-radius,box-shadow",
      });

      const timeline = gsap.timeline({ onComplete: () => setEntranceComplete(true) });
      timeline.to(backdropElement, { autoAlpha: 1, duration: 0.22, ease: "power2.out" }, 0);
      timeline.to(
        sidebarElement,
        {
          xPercent: 0,
          duration: 0.34,
          ease: "power3.out",
          clearProps: "transform,willChange",
        },
        0,
      );
      timeline.to(
        heroElement,
        {
          borderRadius: 0,
          boxShadow: "0 18px 60px rgba(0,0,0,0.12)",
          duration: 0.38,
          ease: "power3.out",
          scaleX: 1,
          scaleY: 1,
          x: 0,
          y: 0,
          clearProps: "transform,transformOrigin,willChange",
        },
        0,
      );
    },
    { scope, dependencies: [source.id], revertOnUpdate: true },
  );

  useEffect(() => {
    if (!contentReady || !entranceComplete) return;

    const root = scope.current;
    if (!root) return;

    const timeline = gsap.to(root, {
      autoAlpha: 0,
      duration: 0.16,
      ease: "power2.out",
      onComplete,
    });

    return () => {
      timeline.kill();
    };
  }, [contentReady, entranceComplete, onComplete]);

  return (
    <div
      ref={scope}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] isolate"
    >
      <div ref={backdrop} className="absolute inset-0 bg-gradient-to-b from-white to-[#d2d1d1]" />
      <div className="relative flex h-full w-full flex-col lg:flex-row">
        <section className="flex min-h-[62dvh] min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#262626] lg:h-[100dvh]">
          <figure className="flex min-w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-8 md:px-10 md:py-10 lg:h-full lg:py-0">
            <div
              ref={hero}
              className="relative shrink-0 overflow-hidden bg-[#f3f3f3]"
              style={{
                aspectRatio: String(source.aspectRatio),
                width: "min(100%, 72dvh)",
              }}
            >
              {/* The source is already an R2-optimized card asset; avoid a Vercel image request. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.url} alt="" className="size-full object-cover" />
            </div>
          </figure>
        </section>
        <aside
          ref={sidebar}
          className="flex min-h-fit w-full flex-none flex-col border-t border-[#e6e6e6] bg-white lg:min-h-full lg:w-[clamp(360px,30vw,510px)] lg:shrink-0 lg:border-l lg:border-t-0"
        >
          <div className="flex flex-1 flex-col gap-7 px-5 py-5 sm:px-7 lg:min-h-full lg:px-6 lg:py-5 xl:px-8 xl:py-6 min-[1700px]:px-10 min-[1700px]:py-7">
            <div className="flex h-10 items-center justify-between">
              <span className="size-10 bg-[#f0f0f0]" />
              <span className="size-10 bg-[#f0f0f0]" />
            </div>
            <div className="flex flex-col gap-3 pt-3">
              <span className="h-6 w-20 bg-[#f0f0f0]" />
              <span className="h-5 w-2/3 bg-[#e6e6e6]" />
              <span className="h-4 w-full bg-[#f0f0f0]" />
              <span className="h-4 w-5/6 bg-[#f0f0f0]" />
            </div>
            <div className="mt-auto h-10 w-full bg-[#262626]" />
          </div>
        </aside>
      </div>
    </div>
  );
}

export function PostTransitionProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [source, setSource] = useState<TransitionSource>();
  const [contentReady, setContentReady] = useState(false);
  const nextId = useRef(0);

  const beginTransition = useCallback(
    (element: HTMLElement, path: string, kind: TransitionKind) => {
      const nextSource = getTransitionSource(element, path, kind);
      if (!nextSource) return;

      nextId.current += 1;
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

  useEffect(() => {
    if (!source || pathname !== source.path) return;

    const hasResolvedPost = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-post-dialog-post-pathname]"),
      ).some((element) => element.dataset.postDialogPostPathname === source.path);

    const observer = new MutationObserver(() => {
      if (hasResolvedPost()) {
        setContentReady(true);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = window.requestAnimationFrame(() => {
      if (hasResolvedPost()) {
        setContentReady(true);
        observer.disconnect();
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname, source]);

  const value = { beginPostOpen, beginPostSwap };

  return (
    <PostTransitionContext.Provider value={value}>
      {children}
      {source ? (
        <OptimisticPostTransition
          key={source.id}
          contentReady={contentReady}
          source={source}
          onComplete={() => setSource(undefined)}
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
