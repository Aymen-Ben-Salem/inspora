"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  type ComponentProps,
  type FocusEvent,
  type PointerEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type IntentPrefetchLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "prefetch"
> & {
  href: Route;
};

export function IntentPrefetchLink({
  href,
  onFocus,
  onPointerEnter,
  onPointerLeave,
  onTouchStart,
  ...props
}: IntentPrefetchLinkProps) {
  const [prefetchEnabled, setPrefetchEnabled] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const prefetch = useCallback(() => {
    setPrefetchEnabled(true);
  }, []);

  const cancelHoverPrefetch = useCallback(() => {
    if (!hoverTimer.current) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);

  useEffect(() => cancelHoverPrefetch, [cancelHoverPrefetch]);

  function handleFocus(event: FocusEvent<HTMLAnchorElement>) {
    onFocus?.(event);
    if (!event.defaultPrevented) prefetch();
  }

  function handlePointerEnter(event: PointerEvent<HTMLAnchorElement>) {
    onPointerEnter?.(event);
    if (event.defaultPrevented || event.pointerType === "touch") return;

    cancelHoverPrefetch();
    hoverTimer.current = setTimeout(prefetch, 100);
  }

  function handlePointerLeave(event: PointerEvent<HTMLAnchorElement>) {
    onPointerLeave?.(event);
    cancelHoverPrefetch();
  }

  function handleTouchStart(event: TouchEvent<HTMLAnchorElement>) {
    onTouchStart?.(event);
    if (!event.defaultPrevented) prefetch();
  }

  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetchEnabled}
      onFocus={handleFocus}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
    />
  );
}

