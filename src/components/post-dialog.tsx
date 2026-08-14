"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";

import {
  createMediaProxy,
  getCompensatedRadius,
  getCornerRadius,
  getIntrinsicMediaAspectRatio,
} from "./post-dialog-media-proxy";
import { resumeLoopingVideos } from "./looping-video";

gsap.registerPlugin(useGSAP);

export type PostDialogCloseMode = "back" | "home";

const POST_ENTRANCE_DURATION = 0.38;
const POST_EXIT_DURATION = 0.34;
const SIDEBAR_ENTRANCE_DURATION = 0.34;
const SIDEBAR_EXIT_DURATION = 0.2;
const SIDEBAR_ENTRANCE_DELAY = 0;
const POST_EXIT_DELAY = 0.035;
const EXIT_DURATION = POST_EXIT_DELAY + POST_EXIT_DURATION;
const POST_SWAP_DURATION = 0.7;

const PostDialogCloseContext = createContext<(() => void) | undefined>(undefined);

export function usePostDialogClose() {
  return useContext(PostDialogCloseContext);
}

function findFeedPost(postId: string | undefined) {
  if (!postId) return undefined;

  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-feed-post-id]"),
  ).find((candidate) => candidate.dataset.feedPostId === postId);
}

function isVisible(rect: DOMRect | undefined) {
  return Boolean(
    rect &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth,
  );
}

function getOtherGalleryItems(gallery: HTMLElement, hero: HTMLElement) {
  return Array.from(
    gallery.querySelectorAll<HTMLElement>("[data-detail-media]"),
  ).filter((item) => !item.contains(hero));
}

function prepareGalleryForTransition(
  gallery: HTMLElement,
  hero: HTMLElement,
) {
  gsap.set(gallery, {
    overflow: "visible",
    position: "relative",
    zIndex: 2,
  });
  const otherItems = getOtherGalleryItems(gallery, hero);
  if (otherItems.length) gsap.set(otherItems, { visibility: "hidden" });
}

function restoreGalleryAfterTransition(
  gallery: HTMLElement,
  hero: HTMLElement,
) {
  gsap.set(gallery, { clearProps: "overflow,position,zIndex" });
  const otherItems = getOtherGalleryItems(gallery, hero);
  if (otherItems.length) gsap.set(otherItems, { clearProps: "visibility" });
  resumeLoopingVideos(gallery);
}

function restoreEntranceState(
  backdrop: HTMLElement,
  gallery: HTMLElement,
  sidebar: HTMLElement,
  hero: HTMLElement,
) {
  const clearStyles = (element: HTMLElement, properties: string[]) => {
    properties.forEach((property) => element.style.removeProperty(property));
  };

  clearStyles(backdrop, ["opacity", "visibility"]);
  clearStyles(gallery, [
    "opacity",
    "visibility",
    "transform",
    "transform-origin",
    "will-change",
    "overflow",
    "position",
    "z-index",
  ]);
  clearStyles(sidebar, [
    "opacity",
    "visibility",
    "transform",
    "will-change",
  ]);
  clearStyles(hero, [
    "opacity",
    "visibility",
    "transform",
    "transform-origin",
    "will-change",
  ]);
  getOtherGalleryItems(gallery, hero).forEach((item) => {
    item.style.removeProperty("visibility");
  });
  resumeLoopingVideos(gallery);
}

export function PostDialog({
  children,
  closeMode,
}: PropsWithChildren<{ closeMode: PostDialogCloseMode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const scope = useRef<HTMLDivElement>(null);
  const dismissIndicator = useRef<HTMLDivElement>(null);
  const entrance = useRef<gsap.core.Timeline>(null);
  const entranceHero = useRef<HTMLElement>(null);
  const entranceHeroRect = useRef<DOMRect>(null);
  const entranceProxy = useRef<HTMLDivElement>(null);
  const exitProxy = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const activePathname = useRef<string | null>(null);

  const finishClose = useCallback(() => {
    if (closeMode === "back") {
      router.back();
      return;
    }

    router.push("/");
  }, [closeMode, router]);

  const requestClose = useCallback(() => {
    if (closing.current) return;

    const root = scope.current;

    if (!root) {
      finishClose();
      return;
    }

    closing.current = true;
    root.style.cursor = "";
    if (dismissIndicator.current) {
      dismissIndicator.current.style.opacity = "0";
    }
    entrance.current?.kill();
    entrance.current = null;
    entranceProxy.current?.remove();
    entranceProxy.current = null;
    exitProxy.current?.remove();
    exitProxy.current = null;

    if (entranceHero.current) {
      gsap.set(entranceHero.current, { clearProps: "opacity,visibility" });
    }

    const backdrop = root.querySelector<HTMLElement>("[data-post-dialog-backdrop]");
    const gallery = root.querySelector<HTMLElement>("[data-post-dialog-gallery]");
    const sidebar = root.querySelector<HTMLElement>("[data-post-dialog-sidebar]");
    const hero = root.querySelector<HTMLElement>("[data-post-dialog-hero]");
    const postId = root.querySelector<HTMLElement>("[data-post-dialog-post-id]")
      ?.dataset.postDialogPostId;
    const source = findFeedPost(postId);
    const sourceRect = source?.getBoundingClientRect();
    const finalHeroRect =
      hero === entranceHero.current && entranceHeroRect.current
        ? entranceHeroRect.current
        : hero?.getBoundingClientRect();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (
      reducedMotion ||
      !backdrop ||
      !gallery ||
      !sidebar ||
      !hero ||
      !finalHeroRect
    ) {
      finishClose();
      return;
    }

    gsap.set(root, { pointerEvents: "none" });
    prepareGalleryForTransition(gallery, hero);

    const timeline = gsap.timeline({
      onComplete: () => {
        exitProxy.current?.remove();
        exitProxy.current = null;
        finishClose();
      },
    });

    timeline.to(
      backdrop,
      { autoAlpha: 0, duration: 0.24, ease: "power2.in" },
      EXIT_DURATION - 0.24,
    );
    timeline.to(
      sidebar,
      {
        xPercent: 100,
        duration: SIDEBAR_EXIT_DURATION,
        ease: "power3.out",
      },
      0,
    );

    if (
      source &&
      sourceRect &&
      isVisible(sourceRect) &&
      finalHeroRect.width > 0
    ) {
      const proxy = createMediaProxy({
        fallback: source,
        media: hero,
        rect: finalHeroRect,
        root,
      });

      if (proxy) {
        exitProxy.current = proxy;
        const scaleX = sourceRect.width / finalHeroRect.width;
        const scaleY = sourceRect.height / finalHeroRect.height;
        const sourceRadius = getCornerRadius(source);

        gsap.set(proxy, {
          borderRadius: getCornerRadius(hero),
          boxShadow: getComputedStyle(hero).boxShadow,
        });
        gsap.set(hero, { autoAlpha: 0 });
        timeline.to(
          proxy,
          {
            x: sourceRect.left - finalHeroRect.left,
            y: sourceRect.top - finalHeroRect.top,
            scaleX,
            scaleY,
            borderRadius: getCompensatedRadius(
              sourceRadius,
              scaleX,
              scaleY,
            ),
            boxShadow: "0 0 0 rgba(0, 0, 0, 0)",
            duration: POST_EXIT_DURATION,
            ease: "power3.inOut",
          },
          POST_EXIT_DELAY,
        );
        return;
      }

      timeline.to(
        hero,
        {
          x: sourceRect.left - finalHeroRect.left,
          y: sourceRect.top - finalHeroRect.top,
          scaleX: sourceRect.width / finalHeroRect.width,
          scaleY: sourceRect.height / finalHeroRect.height,
          transformOrigin: "top left",
          duration: POST_EXIT_DURATION,
          ease: "power3.inOut",
        },
        POST_EXIT_DELAY,
      );
      return;
    }

    timeline.to(
      hero,
      {
        autoAlpha: 0,
        scale: 0.96,
        duration: POST_EXIT_DURATION,
        ease: "power2.in",
      },
      POST_EXIT_DELAY,
    );
  }, [finishClose]);

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      entranceProxy.current?.remove();
      entranceProxy.current = null;
      exitProxy.current?.remove();
      exitProxy.current = null;
    };
  }, [requestClose]);

  useGSAP(
    () => {
      const root = scope.current;

      if (!root || closeMode !== "back") return;

      closing.current = false;
      entrance.current = null;
      gsap.set(root, { clearProps: "pointerEvents" });
      entranceProxy.current?.remove();
      entranceProxy.current = null;
      exitProxy.current?.remove();
      exitProxy.current = null;
      root
        .querySelectorAll<HTMLElement>("[data-post-dialog-media-proxy]")
        .forEach((proxy) => proxy.remove());

      const previousPathname = activePathname.current;
      const isPostSwap =
        previousPathname !== null && previousPathname !== pathname;
      activePathname.current = pathname;

      let observer: MutationObserver | undefined;

      const startEntrance = () => {
        const backdrop = root.querySelector<HTMLElement>(
          "[data-post-dialog-backdrop]",
        );
        const gallery = root.querySelector<HTMLElement>(
          "[data-post-dialog-gallery]",
        );
        const sidebar = root.querySelector<HTMLElement>(
          "[data-post-dialog-sidebar]",
        );
        const hero = root.querySelector<HTMLElement>("[data-post-dialog-hero]");
        const postId = root.querySelector<HTMLElement>(
          "[data-post-dialog-post-id]",
        )?.dataset.postDialogPostId;

        if (!backdrop || !gallery || !sidebar || !hero || !postId) return false;

        restoreEntranceState(backdrop, gallery, sidebar, hero);

        const source = findFeedPost(postId);
        const intrinsicAspectRatio = getIntrinsicMediaAspectRatio(source);
        const maxViewportHeight = Number(
          hero.dataset.postDialogMaxViewportHeight,
        );
        const maxPixelWidth = Number(hero.dataset.postDialogMaxPixelWidth);

        if (
          intrinsicAspectRatio &&
          Number.isFinite(maxViewportHeight) &&
          maxViewportHeight > 0
        ) {
          hero.style.aspectRatio = String(intrinsicAspectRatio);
          hero.style.width =
            Number.isFinite(maxPixelWidth) && maxPixelWidth > 0
              ? `min(100%, ${maxViewportHeight * intrinsicAspectRatio}dvh, ${maxPixelWidth}px)`
              : `min(100%, ${maxViewportHeight * intrinsicAspectRatio}dvh)`;
        }

        const targetRect = hero.getBoundingClientRect();
        const sourceRect = source?.getBoundingClientRect();
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

        entranceHero.current = hero;
        entranceHeroRect.current = targetRect;

        if (reducedMotion) {
          gsap.set([backdrop, gallery, sidebar, hero], { clearProps: "all" });
          resumeLoopingVideos(gallery);
          return true;
        }

        if (isPostSwap) {
          const settleSwap = () => {
            restoreEntranceState(backdrop, gallery, sidebar, hero);
          };
          const timeline = gsap.timeline({
            onComplete: settleSwap,
            onInterrupt: settleSwap,
          });

          entrance.current = timeline;
          gsap.set(backdrop, { autoAlpha: 1 });
          timeline.fromTo(
            gallery,
            {
              autoAlpha: 0.12,
              scale: 0.95,
              transformOrigin: "center center",
              willChange: "transform,opacity",
            },
            {
              autoAlpha: 1,
              scale: 1,
              duration: POST_SWAP_DURATION,
              ease: "power3.out",
              clearProps: "transform,transformOrigin,opacity,visibility,willChange",
            },
            0,
          );
          timeline.fromTo(
            sidebar,
            { autoAlpha: 0.14, x: 28, willChange: "transform,opacity" },
            {
              autoAlpha: 1,
              x: 0,
              duration: POST_SWAP_DURATION,
              ease: "power3.out",
              clearProps: "transform,opacity,visibility,willChange",
            },
            0.04,
          );
          return true;
        }

        let proxy: HTMLDivElement | undefined;
        const settleEntrance = () => {
          if (proxy) {
            proxy.remove();
            if (entranceProxy.current === proxy) {
              entranceProxy.current = null;
            }
          }

          restoreEntranceState(backdrop, gallery, sidebar, hero);
        };
        const timeline = gsap.timeline({
          onComplete: settleEntrance,
          onInterrupt: settleEntrance,
        });

        entrance.current = timeline;
        prepareGalleryForTransition(gallery, hero);
        gsap.set(backdrop, { autoAlpha: 0 });
        gsap.set(sidebar, { xPercent: 100, willChange: "transform" });

        timeline.to(
          backdrop,
          { autoAlpha: 1, duration: 0.22, ease: "power2.out" },
          0,
        );
        timeline.to(
          sidebar,
          {
            xPercent: 0,
            duration: SIDEBAR_ENTRANCE_DURATION,
            ease: "power3.out",
            clearProps: "transform,willChange",
          },
          SIDEBAR_ENTRANCE_DELAY,
        );

        if (
          source &&
          sourceRect &&
          isVisible(sourceRect) &&
          targetRect.width > 0
        ) {
          proxy = createMediaProxy({
            fallback: source,
            media: hero,
            rect: targetRect,
            root,
            mediaSourcePreference: hero.hasAttribute(
              "data-post-dialog-animated-media",
            )
              ? "fallback"
              : "media",
          });

          if (proxy) {
            const scaleX = sourceRect.width / targetRect.width;
            const scaleY = sourceRect.height / targetRect.height;
            const targetRadius = getCornerRadius(hero);

            entranceProxy.current = proxy;
            gsap.set(proxy, {
              x: sourceRect.left - targetRect.left,
              y: sourceRect.top - targetRect.top,
              scaleX,
              scaleY,
              borderRadius: getCompensatedRadius(
                getCornerRadius(source),
                scaleX,
                scaleY,
              ),
              boxShadow: "0 0 0 rgba(0, 0, 0, 0)",
            });
            gsap.set(hero, { autoAlpha: 0 });
            timeline.to(
              proxy,
              {
                x: 0,
                y: 0,
                scaleX: 1,
                scaleY: 1,
                borderRadius: targetRadius,
                boxShadow: "0 18px 60px rgba(0, 0, 0, 0.12)",
                duration: POST_ENTRANCE_DURATION,
                ease: "power3.out",
              },
              0,
            );
            return true;
          }

          gsap.set(hero, {
            x: sourceRect.left - targetRect.left,
            y: sourceRect.top - targetRect.top,
            scaleX: sourceRect.width / targetRect.width,
            scaleY: sourceRect.height / targetRect.height,
            transformOrigin: "top left",
            willChange: "transform",
          });
          timeline.to(
            hero,
            {
              x: 0,
              y: 0,
              scaleX: 1,
              scaleY: 1,
              duration: POST_ENTRANCE_DURATION,
              ease: "power3.out",
              clearProps: "transform,transformOrigin,willChange",
            },
            0,
          );
          return true;
        }

        timeline.fromTo(
          hero,
          { autoAlpha: 0, scale: 0.96 },
          {
            autoAlpha: 1,
            scale: 1,
            duration: POST_ENTRANCE_DURATION,
            ease: "power3.out",
            clearProps: "transform,opacity,visibility",
          },
          0,
        );
        return true;
      };

      if (!startEntrance()) {
        observer = new MutationObserver(() => {
          if (startEntrance()) observer?.disconnect();
        });
        observer.observe(root, { childList: true, subtree: true });
      }

      return () => {
        observer?.disconnect();
        entranceProxy.current?.remove();
        entranceProxy.current = null;
        entrance.current = null;

        const backdrop = root.querySelector<HTMLElement>(
          "[data-post-dialog-backdrop]",
        );
        const gallery = root.querySelector<HTMLElement>(
          "[data-post-dialog-gallery]",
        );
        const sidebar = root.querySelector<HTMLElement>(
          "[data-post-dialog-sidebar]",
        );
        const hero = root.querySelector<HTMLElement>(
          "[data-post-dialog-hero]",
        );

        if (backdrop && gallery && sidebar && hero) {
          restoreEntranceState(backdrop, gallery, sidebar, hero);
        } else if (entranceHero.current) {
          [
            "opacity",
            "visibility",
            "transform",
            "transform-origin",
            "will-change",
          ].forEach((property) => {
            entranceHero.current?.style.removeProperty(property);
          });
        }
      };
    },
    { scope, dependencies: [pathname], revertOnUpdate: true },
  );

  function handleDialogClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (target instanceof Element && target.closest("[data-post-dialog-surface]")) {
      return;
    }

    requestClose();
  }

  function handleDialogPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const indicator = dismissIndicator.current;

    if (!indicator) return;

    const target = event.target;
    const isDismissArea =
      event.pointerType !== "touch" &&
      target instanceof Element &&
      !target.closest("[data-post-dialog-surface]");

    if (!isDismissArea || closing.current) {
      indicator.style.opacity = "0";
      event.currentTarget.style.cursor = "";
      return;
    }

    indicator.style.transform = `translate3d(${event.clientX - 20}px, ${event.clientY - 20}px, 0)`;
    indicator.style.opacity = "1";
    event.currentTarget.style.cursor = "none";
  }

  function hideDismissIndicator(event: ReactPointerEvent<HTMLDivElement>) {
    if (dismissIndicator.current) {
      dismissIndicator.current.style.opacity = "0";
    }
    event.currentTarget.style.cursor = "";
  }

  return (
    <PostDialogCloseContext.Provider value={requestClose}>
      <div
        ref={scope}
        role="dialog"
        aria-modal="true"
        aria-label="Post details"
        onClick={handleDialogClick}
        onPointerLeave={hideDismissIndicator}
        onPointerMove={handleDialogPointerMove}
        className="fixed inset-0 z-50 isolate"
      >
        <div
          data-post-dialog-backdrop
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-white to-[#d2d1d1]"
        />
        <div className="pointer-events-none relative h-full">{children}</div>
        <div
          ref={dismissIndicator}
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-20 flex size-10 items-center justify-center rounded-full border border-[#e6e6e6] bg-[#e6e6e6] opacity-0 shadow-[0_2px_10px_rgba(0,0,0,0.06)] transition-opacity duration-100 will-change-transform"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="#95959d"
              d="M14.2608 11.9989L19.6306 6.28357C19.8658 6.03271 19.9979 5.69246 19.9979 5.33769C19.9979 4.98291 19.8658 4.64266 19.6306 4.3918C19.3955 4.14093 19.0765 4 18.744 4C18.4114 4 18.0925 4.14093 17.8573 4.3918L12.5 10.1204L7.14268 4.3918C6.90752 4.14093 6.58859 4 6.25603 4C5.92348 4 5.60454 4.14093 5.36939 4.3918C5.13424 4.64266 5.00213 4.98291 5.00213 5.33769C5.00213 5.69246 5.13424 6.03271 5.36939 6.28357L10.7392 11.9989L5.36939 17.7142C5.25234 17.838 5.15944 17.9853 5.09604 18.1477C5.03264 18.31 5 18.4842 5 18.66C5 18.8359 5.03264 19.01 5.09604 19.1724C5.15944 19.3347 5.25234 19.4821 5.36939 19.6059C5.48548 19.7308 5.6236 19.8299 5.77578 19.8975C5.92795 19.9652 6.09118 20 6.25603 20C6.42089 20 6.58411 19.9652 6.73629 19.8975C6.88847 19.8299 7.02659 19.7308 7.14268 19.6059L12.5 13.8773L17.8573 19.6059C17.9734 19.7308 18.1115 19.8299 18.2637 19.8975C18.4159 19.9652 18.5791 20 18.744 20C18.9088 20 19.072 19.9652 19.2242 19.8975C19.3764 19.8299 19.5145 19.7308 19.6306 19.6059C19.7477 19.4821 19.8406 19.3347 19.904 19.1724C19.9674 19.01 20 18.8359 20 18.66C20 18.4842 19.9674 18.31 19.904 18.1477C19.8406 17.9853 19.7477 17.838 19.6306 17.7142L14.2608 11.9989Z"
            />
          </svg>
        </div>
      </div>
    </PostDialogCloseContext.Provider>
  );
}
