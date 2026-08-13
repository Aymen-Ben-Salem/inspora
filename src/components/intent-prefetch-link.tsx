"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  type ComponentProps,
  type FocusEvent,
  type PointerEvent,
  type TouchEvent,
  useCallback,
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
  onPointerMove,
  onTouchStart,
  ...props
}: IntentPrefetchLinkProps) {
  const [prefetchEnabled, setPrefetchEnabled] = useState(false);
  const activated = useRef(false);

  const prefetch = useCallback(() => {
    if (activated.current) return;

    activated.current = true;
    setPrefetchEnabled(true);
  }, []);

  function handleFocus(event: FocusEvent<HTMLAnchorElement>) {
    onFocus?.(event);
    if (!event.defaultPrevented) prefetch();
  }

  function handlePointerMove(event: PointerEvent<HTMLAnchorElement>) {
    onPointerMove?.(event);
    if (event.defaultPrevented || event.pointerType === "touch") return;
    prefetch();
  }

  function handleTouchStart(event: TouchEvent<HTMLAnchorElement>) {
    onTouchStart?.(event);
    if (!event.defaultPrevented) prefetch();
  }

  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetchEnabled ? null : false}
      onFocus={handleFocus}
      onPointerMove={handlePointerMove}
      onTouchStart={handleTouchStart}
    />
  );
}

