"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PostCategory, PostView } from "@/domain/post";

import { BrandMark } from "./brand-mark";
import { CategoryFilter } from "./category-filter";
import { ContactSheet } from "./contact-sheet";
import { DesktopSiteNavigationItems } from "./desktop-site-navigation-items";
import { NewsletterForm } from "./newsletter-form";
import { MobileNavigationOverlay } from "./mobile-navigation-overlay";
import { SubscribeSheet } from "./subscribe-sheet";
import { ViewFilter } from "./view-filter";

export function HomepageHeader({
  category,
  view = "latest",
  page = "design",
}: {
  category?: PostCategory;
  view?: PostView;
  page?: "design" | "logos" | "websites";
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuClosing, setMobileMenuClosing] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  const closeContact = useCallback(() => setContactOpen(false), []);
  const closeSubscribe = useCallback(() => setSubscribeOpen(false), []);
  const closeMobileMenu = useCallback(() => setMobileMenuClosing(true), []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeMobileMenu();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [closeMobileMenu, mobileMenuOpen]);

  return (
    <>
      <header className="mx-auto w-full max-w-[1705px] px-4 pt-5 sm:px-5 sm:pt-6 xl:px-6 min-[1700px]:px-11 min-[1700px]:pt-7">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 lg:gap-x-8 min-[1500px]:gap-x-10">
          <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-8">
            <Link
              href="/"
              aria-label="Inspora home"
              className="focus-ring shrink-0"
            >
              <BrandMark responsive />
            </Link>

            <nav
              aria-label="Primary navigation"
              className="hidden items-center gap-5 lg:flex xl:gap-6"
            >
              <DesktopSiteNavigationItems
                activeHref={page === "logos" ? "/logos" : page === "websites" ? "/websites" : "/"}
                onContact={() => setContactOpen(true)}
              />
            </nav>
          </div>

          <h1 className="col-span-3 row-start-2 mt-9 max-w-[540px] text-[23px] font-normal leading-[1.15] tracking-[-0.025em] text-[#777] min-[640px]:max-[1499px]:text-[25px] lg:mt-10 min-[1500px]:col-span-1 min-[1500px]:col-start-2 min-[1500px]:row-start-1 min-[1500px]:mt-0 min-[1500px]:max-w-none min-[1500px]:whitespace-nowrap min-[1500px]:text-center min-[1500px]:text-[14px] min-[1700px]:text-[15px]">
            {page === "logos" ? (
              <>
                A <span className="text-[#262626]">curated</span> archive of{" "}
                <span className="text-[#262626]">logos and icons</span> for
                identity and <span className="text-[#262626]">brand inspiration.</span>
              </>
            ) : page === "websites" ? (
              <>
                A <span className="text-[#262626]">curated</span> archive of{" "}
                <span className="text-[#262626]">website design</span> for
                digital products and <span className="text-[#262626]">creative inspiration.</span>
              </>
            ) : (
              <>
                A <span className="text-[#262626]">curated</span> archive of recent{" "}
                <span className="text-[#262626]">visual design</span> inspiration
                and <span className="text-[#262626]">creative work.</span>
              </>
            )}
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
              aria-label={
                mobileMenuOpen ? "Close navigation" : "Open navigation"
              }
              aria-expanded={mobileMenuOpen}
              onClick={() => {
                if (mobileMenuOpen) {
                  closeMobileMenu();
                  return;
                }

                setMobileMenuClosing(false);
                setMobileMenuOpen(true);
              }}
              className="focus-ring flex size-10 items-center justify-center border border-black/15 text-[#262626]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
              >
                {mobileMenuOpen ? (
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>


        {page === "design" ? (
          <div className="mt-8 flex min-w-0 items-center justify-between gap-3 lg:mt-9 min-[1500px]:mt-11">
            <CategoryFilter current={category} view={view} />
            <ViewFilter category={category} view={view} />
          </div>
        ) : null}
      </header>

      {mobileMenuOpen ? (
        <MobileNavigationOverlay
          closing={mobileMenuClosing}
          onClose={closeMobileMenu}
          onClosed={() => {
            setMobileMenuOpen(false);
            setMobileMenuClosing(false);
          }}
          onContact={() => setContactOpen(true)}
          activeHref={page === "logos" ? "/logos" : page === "websites" ? "/websites" : "/"}
        />
      ) : null}

      <SubscribeSheet open={subscribeOpen} onClose={closeSubscribe} />
      <ContactSheet open={contactOpen} onClose={closeContact} />
    </>
  );
}
