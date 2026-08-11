"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  type MouseEvent,
  type FocusEvent,
  type PointerEvent,
  type TouchEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import { suppressFiltersForInlinePost } from "./inline-post-header";
import { capturePostTransitionSource } from "./post-transition-source";

type IntentPrefetchLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "prefetch"
> & {
  href: Route;
};

export function IntentPrefetchLink({
  href,
  onClick,
  onFocus,
  onPointerEnter,
  onTouchStart,
  ...props
}: IntentPrefetchLinkProps) {
  const router = useRouter();
  const activated = useRef(false);
  const [prefetchEnabled, setPrefetchEnabled] = useState(false);

  const prefetch = useCallback(() => {
    if (activated.current) return;

    activated.current = true;
    setPrefetchEnabled(true);
    router.prefetch(href);
  }, [href, router]);

  function handleFocus(event: FocusEvent<HTMLAnchorElement>) {
    onFocus?.(event);
    if (!event.defaultPrevented) prefetch();
  }

  function handlePointerEnter(event: PointerEvent<HTMLAnchorElement>) {
    onPointerEnter?.(event);
    if (!event.defaultPrevented) prefetch();
  }

  function handleTouchStart(event: TouchEvent<HTMLAnchorElement>) {
    onTouchStart?.(event);
    if (!event.defaultPrevented) prefetch();
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (
      href.toString().startsWith("/posts/") &&
      event.button === 0 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      capturePostTransitionSource(
        new URL(href.toString(), window.location.href).pathname,
        event.currentTarget,
      );
      suppressFiltersForInlinePost();
      window.sessionStorage.setItem(
        "inspora:feed-scroll-position",
        String(window.scrollY),
      );
    }
  }

  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetchEnabled}
      onClick={handleClick}
      onFocus={handleFocus}
      onPointerEnter={handlePointerEnter}
      onTouchStart={handleTouchStart}
    />
  );
}
