"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetchEnabled}
      onFocus={handleFocus}
      onPointerEnter={handlePointerEnter}
      onTouchStart={handleTouchStart}
    />
  );
}

