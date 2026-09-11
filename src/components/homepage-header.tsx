"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PostCategory, PostView } from "@/domain/post";

import { BrandMark } from "./brand-mark";
import { CategoryFilter } from "./category-filter";
import { ContactSheet } from "./contact-sheet";
import { MobileNavigationOverlay } from "./mobile-navigation-overlay";
import { SubscribeSheet } from "./subscribe-sheet";
import { ViewFilter } from "./view-filter";

type ArchivePage = "design" | "info" | "logos" | "websites";
const archiveInk = "#262626";
const archiveMuted = "rgba(38, 38, 38, 0.6)";

function ArchiveHeading({ page }: { page: ArchivePage }) {
  void page;
  return (
    <>
      A <span style={{ color: archiveInk }}>curated</span> archive of recent{" "}
      <span style={{ color: archiveInk }}>visual design</span> inspiration and{" "}
      <span style={{ color: archiveInk }}>creative work</span>.
    </>
  );
}

export function HomepageHeader({
  category,
  view = "latest",
  page = "design",
  showArchiveContent = true,
}: {
  category?: PostCategory;
  view?: PostView;
  page?: ArchivePage;
  showArchiveContent?: boolean;
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
      <header className="sticky top-0 z-40 w-full bg-white">
        <div className="archive-frame py-[var(--archive-header-pad-y)]">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-[var(--archive-brand-gap)]">
              <Link
                href="/"
                aria-label="Inspora home"
                className="focus-ring shrink-0"
              >
                <BrandMark responsive />
              </Link>

              <nav
                aria-label="Primary navigation"
                className="hidden items-center lg:flex"
              >
                {([
                  ["Design", "/", "design"],
                  ["Websites", "/websites", "websites"],
                  ["Logos", "/logos", "logos"],
                ] as const).map(([label, href, itemPage]) => (
                  <Link
                    key={href}
                  href={href}
                  aria-current={page === itemPage ? "page" : undefined}
                    style={{
                      color: page === itemPage ? archiveInk : archiveMuted,
                    }}
                    className="focus-ring inline-flex h-[34px] items-center px-3 text-[var(--archive-copy-size)] font-medium leading-normal whitespace-nowrap transition-colors hover:!text-[#262626]"
                  >
                    <span aria-hidden="true">{"\\ "}</span>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="hidden items-center gap-4 text-[var(--archive-copy-size)] font-medium leading-normal lg:flex">
              <Link
                href="/info"
                aria-current={page === "info" ? "page" : undefined}
                className={`focus-ring transition-colors hover:text-[#262626] ${
                  page === "info"
                    ? "text-[#262626]"
                    : "text-[rgba(38,38,38,0.6)]"
                }`}
              >
                Info
              </Link>
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="focus-ring cursor-pointer text-[rgba(38,38,38,0.6)] transition-colors hover:text-[#262626]"
              >
                Contact
              </button>
              <button
                type="button"
                onClick={() => setSubscribeOpen(true)}
                className="focus-ring inline-flex h-[var(--archive-control-height)] cursor-pointer items-center justify-center bg-[#262626] px-4 text-white transition-colors hover:bg-black"
              >
                Subscribe
              </button>
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setSubscribeOpen(true)}
                className="focus-ring h-10 cursor-pointer bg-[#262626] px-4 text-[12px] text-white transition-colors hover:bg-black sm:px-5 sm:text-[13px]"
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
                className="focus-ring flex size-10 cursor-pointer items-center justify-center border border-black/15 text-[#262626]"
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
        </div>
      </header>

      {showArchiveContent ? (
        <div className="archive-frame">
          <h1
            style={{ color: archiveMuted }}
            className="mt-[var(--archive-header-gap)] max-w-[590px] text-[var(--archive-copy-size)] font-normal leading-normal tracking-[-0.02em]"
          >
            <ArchiveHeading page={page} />
          </h1>

          {page === "design" ? (
            <div className="mt-[var(--archive-description-gap)] flex min-w-0 items-center justify-between gap-3">
              <CategoryFilter current={category} view={view} />
              <ViewFilter category={category} view={view} />
            </div>
          ) : null}
        </div>
      ) : null}

      {mobileMenuOpen ? (
        <MobileNavigationOverlay
          closing={mobileMenuClosing}
          onClose={closeMobileMenu}
          onClosed={() => {
            setMobileMenuOpen(false);
            setMobileMenuClosing(false);
          }}
          onContact={() => setContactOpen(true)}
          activeHref={
            page === "logos"
              ? "/logos"
              : page === "websites"
                ? "/websites"
                : page === "info"
                  ? "/info"
                  : "/"
          }
        />
      ) : null}

      <SubscribeSheet open={subscribeOpen} onClose={closeSubscribe} />
      <ContactSheet open={contactOpen} onClose={closeContact} />
    </>
  );
}
