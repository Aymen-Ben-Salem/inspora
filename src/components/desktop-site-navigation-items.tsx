"use client";

import type { Route } from "next";
import Link from "next/link";

import { SITE_NAV_ITEMS, type SiteNavigationHref } from "./site-navigation";

const itemClassName =
  "focus-ring whitespace-nowrap text-[14px] font-normal leading-none tracking-[0.2px] transition-colors hover:text-[#262626]";

export function DesktopSiteNavigationItems({
  activeHref,
  contactHref = "#contact",
  highlightActive = false,
  onContact,
}: {
  activeHref?: SiteNavigationHref;
  contactHref?: string;
  highlightActive?: boolean;
  onContact?: () => void;
}) {
  return SITE_NAV_ITEMS.map((item) => {
    const active = item.kind === "link" && item.href === activeHref;
    const className = `${itemClassName} ${
      active && highlightActive ? "text-[#262626]" : "text-[#777]"
    }`;
    const label = (
      <>
        <span aria-hidden="true">\ </span>
        {item.label}
      </>
    );

    if (item.kind === "action") {
      return onContact ? (
        <button
          key={item.label}
          type="button"
          onClick={onContact}
          className={className}
        >
          {label}
        </button>
      ) : (
        <a key={item.label} href={contactHref} className={className}>
          {label}
        </a>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href as Route}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {label}
      </Link>
    );
  });
}
