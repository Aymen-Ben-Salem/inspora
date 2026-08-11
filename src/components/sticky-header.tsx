"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  isSecondaryHeaderScrollLocked,
  subscribeToSecondaryHeaderLock,
} from "./inline-post-header";
import { resolveSecondaryHeaderVisibility } from "./sticky-header-state";

export function StickyHeader({
  notice,
  primary,
  secondary,
}: {
  notice?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  const [secondaryVisible, setSecondaryVisible] = useState(true);
  const previousScrollY = useRef(0);

  useEffect(() => {
    if (!secondary) return;

    previousScrollY.current = Math.max(window.scrollY, 0);
    let frame: number | null = null;

    function updateHeader() {
      frame = null;
      const currentScrollY = Math.max(window.scrollY, 0);

      if (isSecondaryHeaderScrollLocked()) {
        setSecondaryVisible(false);
        previousScrollY.current = currentScrollY;
        return;
      }

      setSecondaryVisible((visible) =>
        resolveSecondaryHeaderVisibility({
          currentScrollY,
          previousScrollY: previousScrollY.current,
          visible,
        }),
      );
      previousScrollY.current = currentScrollY;
    }

    function handleScroll() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateHeader);
    }

    function keepSecondaryHidden() {
      setSecondaryVisible(false);
      previousScrollY.current = Math.max(window.scrollY, 0);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    const unsubscribeFromHeaderLock = subscribeToSecondaryHeaderLock(
      keepSecondaryHidden,
    );
    return () => {
      window.removeEventListener("scroll", handleScroll);
      unsubscribeFromHeaderLock();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [secondary]);

  return (
    <header className="sticky top-0 z-40 bg-white">
      {notice}

      <div className="mx-auto flex h-[72px] max-w-[1705px] items-center justify-between gap-3 px-4 sm:px-5 xl:h-20 xl:px-6 2xl:px-8 min-[1700px]:px-[46px]">
        {primary}
      </div>

      {secondary ? (
        <div
          aria-hidden={!secondaryVisible}
          inert={!secondaryVisible}
          data-header-filters={secondaryVisible ? "visible" : "hidden"}
          className={`absolute inset-x-0 top-full bg-white transition-[opacity,transform,visibility] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
            secondaryVisible
              ? "visible translate-y-0 opacity-100"
              : "invisible pointer-events-none -translate-y-2 opacity-0"
          }`}
        >
          <div className="mx-auto max-w-[1705px] px-4 pb-4 pt-3 sm:px-5 xl:px-6 xl:pb-[49px] xl:pt-[22px] 2xl:px-8 min-[1700px]:px-[46px]">
            {secondary}
          </div>
        </div>
      ) : null}
    </header>
  );
}
