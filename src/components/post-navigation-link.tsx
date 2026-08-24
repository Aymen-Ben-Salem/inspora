"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ComponentProps, ReactNode } from "react";

import { usePostTransition } from "./post-transition-provider";

type PostNavigationLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  children: ReactNode;
  href: Route;
};

export function PostNavigationLink({
  children,
  href,
  onClick,
  ...props
}: PostNavigationLinkProps) {
  const { beginPostSwap, isPrimaryNavigation } = usePostTransition();

  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !isPrimaryNavigation(event)) return;

        const source = document.querySelector<HTMLElement>("[data-post-dialog-hero]");
        if (source) beginPostSwap(source, href);
      }}
    >
      {children}
    </Link>
  );
}
