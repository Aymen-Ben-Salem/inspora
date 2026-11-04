"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ComponentProps } from "react";

type CreatorProfileLinkProps = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & {
  href: Route;
};

export function CreatorProfileLink({
  href,
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...props
}: CreatorProfileLinkProps) {
  const router = useRouter();
  const prefetchedHref = useRef<Route | null>(null);

  function prefetch() {
    if (prefetchedHref.current === href) return;
    prefetchedHref.current = href;
    router.prefetch(href);
  }

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (!event.defaultPrevented) prefetch();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) prefetch();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        if (!event.defaultPrevented) prefetch();
      }}
    />
  );
}
