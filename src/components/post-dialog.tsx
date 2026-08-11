"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type MouseEvent,
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

export function PostDialog({
  children,
  closeMode,
}: PropsWithChildren<{ closeMode: PostDialogCloseMode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const scope = useRef<HTMLDivElement>(null);
  const entrance = useRef<gsap.core.Timeline>(null);
  const entranceHero = useRef<HTMLElement>(null);
  const entranceHeroRect = useRef<DOMRect>(null);
  const entranceProxy = useRef<HTMLDivElement>(null);
  const exitProxy = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

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

        let proxy: HTMLDivElement | undefined;
        const timeline = gsap.timeline({
          onComplete: () => {
            if (proxy) {
              gsap.set(hero, { clearProps: "opacity,visibility" });
              proxy.remove();
              entranceProxy.current = null;
            }

            restoreGalleryAfterTransition(gallery, hero);
          },
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

  return (
    <PostDialogCloseContext.Provider value={requestClose}>
      <div
        ref={scope}
        role="dialog"
        aria-modal="true"
        aria-label="Post details"
        onClick={handleDialogClick}
        className="fixed inset-0 z-50 isolate"
      >
        <div
          data-post-dialog-backdrop
          aria-hidden="true"
          className="absolute inset-0 bg-white/10 backdrop-blur-[5px]"
        />
        <div className="pointer-events-none relative h-full">{children}</div>
      </div>
    </PostDialogCloseContext.Provider>
  );
}
