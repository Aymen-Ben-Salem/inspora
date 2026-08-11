"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  createMediaProxy,
  getCompensatedRadius,
  getCornerRadius,
} from "./post-dialog-media-proxy";
import {
  lockSecondaryHeaderThroughNavigation,
  restoreFiltersAfterInlinePost,
  suppressFiltersForInlinePost,
} from "./inline-post-header";
import {
  resumeLoopingVideos,
  resumeVisibleLoopingVideos,
  suspendLoopingVideos,
} from "./looping-video";
import { shouldReturnToFeed } from "./post-route-scroll";
import {
  getCapturedPostReturnUrl,
  getCapturedPostTransitionSource,
} from "./post-transition-source";

gsap.registerPlugin(useGSAP);

export type PostDialogCloseMode = "back" | "home";

const PostDialogCloseContext = createContext<(() => void) | undefined>(undefined);

export function usePostDialogClose() {
  return useContext(PostDialogCloseContext);
}

function getColumnCount(grid: HTMLElement) {
  return Math.max(
    1,
    getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
  );
}

function getSourceLink(pathname: string) {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>("[data-feed-post-id]"),
  ).find((link) => new URL(link.href, window.location.href).pathname === pathname);
}

function getHeaderBottom() {
  return document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
}

function alignHostBelowHeader(host: HTMLElement) {
  const currentMargin = Number.parseFloat(host.style.marginTop) || 0;
  const unadjustedDocumentTop =
    host.getBoundingClientRect().top + window.scrollY - currentMargin;

  host.style.marginTop = `${getHeaderBottom() - unadjustedDocumentTop}px`;
}

function getSavedFeedScrollPosition() {
  const value = Number(
    window.sessionStorage.getItem("inspora:feed-scroll-position"),
  );

  return Number.isFinite(value) && value >= 0 ? value : window.scrollY;
}

function getInlineFeedOffset(grid: HTMLElement) {
  return Number.parseFloat(grid.dataset.inlineFeedOffset ?? "0") || 0;
}

function getVisibleFeedTop(grid: HTMLElement) {
  return grid.getBoundingClientRect().top + getInlineFeedOffset(grid);
}

function getVisibleFeedHeight(grid: HTMLElement) {
  return Math.max(0, grid.scrollHeight - getInlineFeedOffset(grid));
}

export function PostDialog({
  children,
  closeMode,
}: PropsWithChildren<{ closeMode: PostDialogCloseMode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const sourceRect = useRef<DOMRect | null>(null);
  const originalScrollY = useRef(0);
  const restoreScrollY = useRef(0);
  const nextFeedDocumentTop = useRef<number | null>(null);
  const sourceRowCards = useRef<HTMLElement[]>([]);
  const entranceProxy = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  const closingByScroll = useRef(false);

  const finishClose = useCallback(() => {
    if (closeMode === "back") {
      router.back();
      return;
    }

    router.push("/");
  }, [closeMode, router]);

  const finishScrollClose = useCallback(() => {
    router.replace(getCapturedPostReturnUrl(pathname) as Route, {
      scroll: false,
    });
  }, [pathname, router]);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;

    const host = portalHost;
    const hero = host?.querySelector<HTMLElement>("[data-post-dialog-hero]");
    const heroRect = hero?.getBoundingClientRect();
    const targetRect = sourceRect.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!host || !hero || !heroRect || !targetRect || reducedMotion) {
      finishClose();
      return;
    }

    const proxy = createMediaProxy({
      fallback: hero,
      media: hero,
      rect: heroRect,
      root: document.body,
    });

    if (!proxy) {
      finishClose();
      return;
    }

    gsap.set(hero, { autoAlpha: 0 });
    gsap.to(host, { autoAlpha: 0, duration: 0.18, ease: "power2.in" });
    gsap.to(proxy, {
      x: targetRect.left - heroRect.left,
      y: targetRect.top - heroRect.top,
      scaleX: targetRect.width / heroRect.width,
      scaleY: targetRect.height / heroRect.height,
      borderRadius: getCompensatedRadius(
        getCornerRadius(document.querySelector(`[data-feed-post-id]`) ?? hero),
        targetRect.width / heroRect.width,
        targetRect.height / heroRect.height,
      ),
      duration: 0.32,
      ease: "power3.inOut",
      onComplete: () => {
        proxy.remove();
        finishClose();
      },
    });
  }, [finishClose, portalHost]);

  const returnToFeed = useCallback((visibleFeedTop: number) => {
    if (closing.current) return;

    if (nextFeedDocumentTop.current !== null) {
      restoreScrollY.current = Math.max(
        0,
        nextFeedDocumentTop.current - visibleFeedTop,
      );
    }

    closingByScroll.current = true;
    closing.current = true;
    finishScrollClose();
  }, [finishScrollClose]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestClose]);

  useLayoutEffect(() => {
    if (closeMode !== "back") return;

    const source = getSourceLink(pathname);
    const sourceCard = source?.closest<HTMLElement>("[data-feed-card]");
    const grid = sourceCard?.closest<HTMLElement>(".feed-grid");
    const gridParent = grid?.parentElement;

    if (!source || !sourceCard || !grid || !gridParent) return;

    closing.current = false;
    closingByScroll.current = false;
    suppressFiltersForInlinePost();
    originalScrollY.current = getSavedFeedScrollPosition();
    restoreScrollY.current = originalScrollY.current;
    nextFeedDocumentTop.current = null;
    window.scrollTo({ top: originalScrollY.current, behavior: "instant" });
    sourceRect.current =
      getCapturedPostTransitionSource(pathname) ?? source.getBoundingClientRect();

    entranceProxy.current = createMediaProxy({
      fallback: source,
      media: source,
      rect: sourceRect.current,
      root: document.body,
      mediaSourcePreference: "fallback",
    }) ?? null;

    const cards = Array.from(
      grid.querySelectorAll<HTMLElement>(":scope > [data-feed-card]"),
    );
    const sourceIndex = cards.indexOf(sourceCard);
    const columnCount = getColumnCount(grid);
    const hiddenCount = Math.min(
      cards.length,
      Math.ceil((sourceIndex + 1) / columnCount) * columnCount,
    );
    const hiddenCards = cards.slice(0, hiddenCount);
    const remainingCards = cards.slice(hiddenCount);
    const sourceRowStart = Math.floor(sourceIndex / columnCount) * columnCount;
    const currentSourceRowCards = cards.slice(sourceRowStart, hiddenCount);
    const gridTop = grid.getBoundingClientRect().top;
    const feedOffset = remainingCards.length > 0
      ? Math.max(
          0,
          Math.min(...remainingCards.map((card) => card.getBoundingClientRect().top)) -
            gridTop,
        )
      : grid.scrollHeight;
    nextFeedDocumentTop.current = gridTop + originalScrollY.current + feedOffset;
    const previousVisibilities = hiddenCards.map((card) => card.style.visibility);
    const previousOpacities = hiddenCards.map((card) => card.style.opacity);
    const previousGridTransform = grid.style.transform;
    const previousFeedOffset = grid.dataset.inlineFeedOffset;
    const wasGridInert = grid.inert;
    const previousGridAriaHidden = grid.getAttribute("aria-hidden");
    const host = document.createElement("div");

    host.dataset.inlinePostHost = "";
    host.className = "inline-post-host";
    grid.inert = true;
    grid.setAttribute("aria-hidden", "true");
    suspendLoopingVideos(grid);
    hiddenCards.forEach((card) => {
      card.style.visibility = "hidden";
    });
    currentSourceRowCards.forEach((card) => {
      card.style.opacity = "0";
      card.style.visibility = "visible";
    });
    sourceRowCards.current = currentSourceRowCards;
    grid.style.transform = `translateY(${-feedOffset}px)`;
    grid.dataset.inlineFeedOffset = String(feedOffset);
    gridParent.insertBefore(host, grid);
    alignHostBelowHeader(host);

    const header = document.querySelector<HTMLElement>("header");
    const headerObserver = header
      ? new ResizeObserver(() => alignHostBelowHeader(host))
      : null;
    const handleResize = () => alignHostBelowHeader(host);

    if (header) headerObserver?.observe(header);
    window.addEventListener("resize", handleResize);

    const frame = window.requestAnimationFrame(() => {
      setPortalHost(host);
      const hostTop = host.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, hostTop - getHeaderBottom()), behavior: "instant" });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      headerObserver?.disconnect();
      entranceProxy.current?.remove();
      entranceProxy.current = null;
      sourceRowCards.current = [];
      if (closingByScroll.current) {
        lockSecondaryHeaderThroughNavigation();
      }
      restoreFiltersAfterInlinePost();
      grid.inert = wasGridInert;
      if (previousGridAriaHidden === null) {
        grid.removeAttribute("aria-hidden");
      } else {
        grid.setAttribute("aria-hidden", previousGridAriaHidden);
      }
      grid.style.transform = previousGridTransform;
      if (previousFeedOffset === undefined) {
        delete grid.dataset.inlineFeedOffset;
      } else {
        grid.dataset.inlineFeedOffset = previousFeedOffset;
      }
      hiddenCards.forEach((card, index) => {
        card.style.visibility = previousVisibilities[index] ?? "";
        card.style.opacity = previousOpacities[index] ?? "";
      });
      host.remove();
      setPortalHost(null);
      window.scrollTo({ top: restoreScrollY.current, behavior: "instant" });
      resumeVisibleLoopingVideos(grid);
      nextFeedDocumentTop.current = null;
      closingByScroll.current = false;
    };
  }, [closeMode, pathname]);

  useLayoutEffect(() => {
    if (closeMode !== "back" || !portalHost) return;

    const grid = portalHost.nextElementSibling as HTMLElement | null;
    const preview = portalHost.querySelector<HTMLElement>(
      "[data-post-feed-preview]",
    );
    const resizeObserver = grid && preview
      ? new ResizeObserver(() => {
          preview.style.height = `${getVisibleFeedHeight(grid)}px`;
        })
      : null;

    if (grid && preview) {
      preview.style.height = `${getVisibleFeedHeight(grid)}px`;
      resizeObserver?.observe(grid);
    }

    let previousScrollY = window.scrollY;
    let initialGridTop: number | null = null;
    let frame: number | null = null;

    function evaluateScroll() {
      frame = null;
      const grid = portalHost?.nextElementSibling as HTMLElement | null;
      const preview = portalHost?.querySelector<HTMLElement>("[data-post-feed-preview]");
      const currentScrollY = window.scrollY;
      const headerBottom = getHeaderBottom();

      if (grid && preview) {
        const feedTop = getVisibleFeedTop(grid);
        initialGridTop ??= feedTop;
        const travel = Math.max(initialGridTop - headerBottom, 1);
        const progress = Math.min(Math.max((initialGridTop - feedTop) / travel, 0), 1);
        const remaining = 1 - progress;
        const sourceRowOpacity = Math.min(
          Math.max((progress - 0.62) / 0.38, 0),
          1,
        );

        preview.style.backdropFilter = `blur(${8 * remaining}px)`;
        preview.style.backgroundColor = `rgb(255 255 255 / ${0.24 * remaining})`;
        sourceRowCards.current.forEach((card) => {
          card.style.opacity = String(sourceRowOpacity);
        });

        if (
          shouldReturnToFeed({
            currentScrollTop: currentScrollY,
            previousScrollTop: previousScrollY,
            feedTop,
            headerBottom,
          })
        ) {
          returnToFeed(feedTop);
          return;
        }
      }

      previousScrollY = currentScrollY;
    }

    function handleScroll() {
      if (frame !== null || closing.current) return;
      frame = window.requestAnimationFrame(evaluateScroll);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [closeMode, portalHost, returnToFeed]);

  useGSAP(
    () => {
      if (closeMode !== "back" || !portalHost) return;

      const hero = portalHost.querySelector<HTMLElement>("[data-post-dialog-hero]");
      const sidebar = portalHost.querySelector<HTMLElement>("[data-post-dialog-sidebar]");
      const gallery = portalHost.querySelector<HTMLElement>("[data-post-dialog-gallery]");
      const proxy = entranceProxy.current;

      if (!hero || !proxy) {
        proxy?.remove();
        if (entranceProxy.current === proxy) entranceProxy.current = null;
        if (gallery) resumeLoopingVideos(gallery);
        return;
      }

      const targetRect = hero.getBoundingClientRect();
      const startRect = sourceRect.current;

      if (!startRect || targetRect.width <= 0) {
        proxy.remove();
        entranceProxy.current = null;
        resumeLoopingVideos(gallery ?? portalHost);
        return;
      }

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reducedMotion) {
        proxy.remove();
        entranceProxy.current = null;
        resumeLoopingVideos(gallery ?? portalHost);
        return;
      }

      const scaleX = startRect.width / targetRect.width;
      const scaleY = startRect.height / targetRect.height;

      gsap.set(hero, { autoAlpha: 0 });
      if (sidebar) gsap.set(sidebar, { autoAlpha: 0, x: 18 });
      gsap.set(proxy, {
        left: targetRect.left,
        top: targetRect.top,
        x: startRect.left - targetRect.left,
        y: startRect.top - targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        scaleX,
        scaleY,
        borderRadius: getCompensatedRadius(getCornerRadius(hero), scaleX, scaleY),
      });

      let entranceFinished = false;
      const finishEntrance = () => {
        if (entranceFinished) return;
        entranceFinished = true;
        window.removeEventListener("touchmove", interruptEntrance);
        window.removeEventListener("wheel", interruptEntrance);
        gsap.set(hero, { clearProps: "opacity,visibility" });
        if (sidebar) gsap.set(sidebar, { clearProps: "all" });
        proxy.remove();
        if (entranceProxy.current === proxy) entranceProxy.current = null;
        resumeLoopingVideos(gallery ?? portalHost);
      };

      const timeline = gsap.timeline({
        onComplete: finishEntrance,
      });
      const interruptEntrance = () => {
        timeline.kill();
        finishEntrance();
      };

      window.addEventListener("touchmove", interruptEntrance, { passive: true });
      window.addEventListener("wheel", interruptEntrance, { passive: true });

      timeline.to(proxy, {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        borderRadius: getCornerRadius(hero),
        duration: 0.36,
        ease: "power3.out",
      });
      if (sidebar) {
        timeline.to(
          sidebar,
          { autoAlpha: 1, x: 0, duration: 0.28, ease: "power2.out", clearProps: "all" },
          0.06,
        );
      }

      return () => {
        timeline.kill();
        finishEntrance();
      };
    },
    { scope: portalHost ?? undefined, dependencies: [pathname, portalHost] },
  );

  const content = (
    <PostDialogCloseContext.Provider value={requestClose}>
      {children}
    </PostDialogCloseContext.Provider>
  );

  if (closeMode === "back") {
    return portalHost ? createPortal(content, portalHost) : null;
  }

  return content;
}
