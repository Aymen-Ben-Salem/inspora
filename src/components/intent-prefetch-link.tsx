"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  type FocusEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
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
  ...props
}: IntentPrefetchLinkProps) {
  const router = useRouter();
  const activated = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const prefetch = useCallback(() => {
    if (activated.current) return;

    activated.current = true;
    router.prefetch(href);
  }, [href, router]);

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

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onFocus={handleFocus}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    />
  );
}

