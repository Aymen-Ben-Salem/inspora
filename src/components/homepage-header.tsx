"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PostCategory, PostView } from "@/domain/post";

import { BrandMark } from "./brand-mark";
import { CategoryFilter } from "./category-filter";
import { ContactSheet } from "./contact-sheet";
import { NewsletterForm } from "./newsletter-form";
import { SITE_NAV_ITEMS } from "./site-navigation";
import { SubscribeSheet } from "./subscribe-sheet";
import { ViewFilter } from "./view-filter";

function NavigationItems({
  mobile = false,
  onContact,
  onNavigate,
}: {
  mobile?: boolean;
  onContact: () => void;
  onNavigate?: () => void;
}) {
  return SITE_NAV_ITEMS.map((item) => {
    const className = mobile
      ? "focus-ring flex min-h-11 items-center border-b border-black/10 py-3 text-[16px] text-[#555] transition-colors hover:text-[#262626]"
      : "focus-ring whitespace-nowrap text-[13px] text-[#777] transition-colors hover:text-[#262626] min-[1700px]:text-[14px]";

    if (item.kind === "action") {
      return (
        <button
          key={item.label}
          type="button"
          onClick={() => {
            onNavigate?.();
            onContact();
          }}
          className={className}
        >
          {mobile ? null : <span aria-hidden="true">\ </span>}
          {item.label}
        </button>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href as Route}
        aria-current={item.href === "/" ? "page" : undefined}
        onClick={onNavigate}
        className={className}
      >
        {mobile ? null : <span aria-hidden="true">\ </span>}
        {item.label}
      </Link>
    );
  });
}

export function HomepageHeader({
  category,
  view,
}: {
  category?: PostCategory;
  view: PostView;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  const closeContact = useCallback(() => setContactOpen(false), []);
  const closeSubscribe = useCallback(() => setSubscribeOpen(false), []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="mx-auto w-full max-w-[1705px] px-4 pt-5 sm:px-5 sm:pt-6 xl:px-6 min-[1700px]:px-11 min-[1700px]:pt-7">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 lg:gap-x-8 min-[1500px]:gap-x-10">
          <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-8">
            <Link href="/" aria-label="Inspora home" className="focus-ring shrink-0">
              <BrandMark responsive />
            </Link>

            <nav
              aria-label="Primary navigation"
              className="hidden items-center gap-5 lg:flex xl:gap-6"
            >
              <NavigationItems onContact={() => setContactOpen(true)} />
            </nav>
          </div>

          <h1 className="col-span-3 row-start-2 mt-9 max-w-[540px] text-[23px] font-normal leading-[1.15] tracking-[-0.025em] text-[#777] min-[640px]:max-[1499px]:text-[25px] lg:mt-10 min-[1500px]:col-span-1 min-[1500px]:col-start-2 min-[1500px]:row-start-1 min-[1500px]:mt-0 min-[1500px]:max-w-none min-[1500px]:whitespace-nowrap min-[1500px]:text-center min-[1500px]:text-[14px] min-[1700px]:text-[15px]">
            A curated archive of recent <span className="text-[#262626]">visual design inspiration</span> and <span className="text-[#262626]">creative work.</span>
          </h1>

          <div className="col-start-3 row-start-1 hidden w-[310px] justify-self-end lg:block xl:w-[489px]">
            <NewsletterForm compact />
          </div>

          <div className="col-start-3 row-start-1 flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setSubscribeOpen(true)}
              className="focus-ring h-10 bg-[#262626] px-4 text-[12px] text-white transition-colors hover:bg-black sm:px-5 sm:text-[13px]"
            >
              subscribe
            </button>
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((current) => !current)}
              className="focus-ring flex size-10 items-center justify-center border border-black/15 text-[#262626]"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
                {mobileMenuOpen ? (
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <nav aria-label="Mobile navigation" className="mt-6 border-t border-black/10 lg:hidden">
            <NavigationItems
              mobile
              onContact={() => setContactOpen(true)}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </nav>
        ) : null}

        <div className="mt-8 flex min-w-0 items-center justify-between gap-3 lg:mt-9 min-[1500px]:mt-11">
          <CategoryFilter current={category} view={view} />
          <ViewFilter category={category} view={view} />
        </div>
      </header>

      <SubscribeSheet open={subscribeOpen} onClose={closeSubscribe} />
      <ContactSheet open={contactOpen} onClose={closeContact} />
    </>
  );
}
