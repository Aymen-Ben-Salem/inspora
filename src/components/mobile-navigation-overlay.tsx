"use client";

import type { Route } from "next";
import Link from "next/link";

import { SITE_NAV_ITEMS } from "./site-navigation";

const browseItems = SITE_NAV_ITEMS.filter(
  (item) => item.kind === "link" && item.label !== "info",
);
const infoItem = SITE_NAV_ITEMS.find(
  (item) => item.kind === "link" && item.label === "info",
);

const menuItemTypography =
  "block py-0.5 text-[17px] font-normal leading-[1.45] tracking-[-0.012em]";

export function MobileNavigationOverlay({
  closing,
  onClose,
  onClosed,
  onContact,
}: {
  closing: boolean;
  onClose: () => void;
  onClosed: () => void;
  onContact: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
      data-state={closing ? "closing" : "open"}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClosed();
      }}
      style={{ inset: 0, width: "100dvw" }}
      className="mobile-nav-overlay fixed z-[90] overflow-y-auto bg-white lg:hidden"
    >
      <nav
        aria-label="Mobile navigation"
        className="mobile-nav-directory relative min-h-[100dvh] px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(24px,env(safe-area-inset-top))]"
      >
        <button
          type="button"
          autoFocus
          aria-label="Close navigation"
          onClick={onClose}
          className="focus-ring absolute right-4 top-[max(20px,env(safe-area-inset-top))] flex size-10 items-center justify-center border border-black/15 text-[#262626] transition-colors hover:border-black/25 hover:text-[#777] sm:right-5 sm:top-[max(24px,env(safe-area-inset-top))]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-[19px]"
            fill="none"
          >
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <section aria-labelledby="mobile-nav-browse" className="pt-14">
          <h2
            id="mobile-nav-browse"
            className="text-[15px] font-normal leading-none tracking-[-0.01em] text-[#b0b0b0]"
          >
            Browse
          </h2>

          <div className="mt-2 flex flex-col items-start">
            {browseItems.map((item) => (
              <Link
                key={item.label}
                href={item.href as Route}
                aria-current={item.href === "/" ? "page" : undefined}
                onClick={onClose}
                className={`focus-ring py-0.5 text-[17px] font-normal leading-[1.45] tracking-[-0.012em] transition-colors capitalize ${
                  item.href === "/"
                    ? "text-[#262626]"
                    : "text-[#777] hover:text-[#262626]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="mobile-nav-inspora" className="mt-6">
          <h2
            id="mobile-nav-inspora"
            className="text-[15px] font-normal leading-none tracking-[-0.01em] text-[#b0b0b0]"
          >
            Inspora
          </h2>
          <div className="mt-2 flex flex-col items-start">
            {infoItem ? (
              <Link
                href={infoItem.href as Route}
                onClick={onClose}
                className="focus-ring text-[#777] transition-colors hover:text-[#262626]"
              >
                <span className={`${menuItemTypography} capitalize`}>
                  {infoItem.label}
                </span>
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                onClose();
                onContact();
              }}
              className="focus-ring appearance-none border-0 bg-transparent p-0 text-left text-[#777] transition-colors hover:text-[#262626]"
            >
              <span className={menuItemTypography}>Contact</span>
            </button>
          </div>
        </section>
      </nav>
    </div>
  );
}
