"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { BrandMark } from "./brand-mark";
import { ContactSheet } from "./contact-sheet";
import { SaveIcon } from "./feed-save-overlay";
import { MobileNavigationOverlay } from "./mobile-navigation-overlay";
import { SubscribeSheet } from "./subscribe-sheet";

export type NavbarPage = "design" | "info" | "logos" | "websites";

const archiveInk = "#262626";
const archiveMuted = "#767676";

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EllipsisIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
      <circle cx="5" cy="12" r="1.25" fill="currentColor" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
      <circle cx="19" cy="12" r="1.25" fill="currentColor" />
    </svg>
  );
}

export function SiteNavbarClient({
  page = "design",
  desktopAuth,
  mobileAuth,
}: {
  page?: NavbarPage;
  desktopAuth: ReactNode;
  mobileAuth: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuClosing, setMobileMenuClosing] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowPreview, setOverflowPreview] = useState<
    "contact" | "about" | null
  >(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const highlightedOverflowItem = overflowPreview ?? "contact";

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

  useEffect(() => {
    if (!overflowOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!overflowRef.current?.contains(event.target as Node)) {
        setOverflowOpen(false);
        setOverflowPreview(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOverflowOpen(false);
        setOverflowPreview(null);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [overflowOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white">
        <div className="archive-frame pt-[var(--archive-header-pad-y)]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
            <div className="flex min-w-0 items-center">
              <Link
                href="/"
                aria-label="Inspora home"
                className="focus-ring shrink-0"
              >
                <BrandMark responsive />
              </Link>
            </div>

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
                  className="focus-ring inline-flex h-[var(--archive-nav-height)] items-center gap-1.5 px-[var(--archive-nav-pad-x)] text-[length:var(--archive-nav-size)] font-medium leading-normal whitespace-nowrap transition-colors hover:!text-[#262626]"
                >
                  {label}
                  {itemPage === "design" ? null : (
                    <span className="rounded-[3px] bg-[#767676] px-1 py-0.5 text-[8px] leading-none text-white">
                      New
                    </span>
                  )}
                </Link>
              ))}

              <div ref={overflowRef} className="relative">
                <button
                  type="button"
                  aria-label="More navigation"
                  aria-haspopup="menu"
                  aria-expanded={overflowOpen}
                  onClick={() => {
                    if (overflowOpen) setOverflowPreview(null);
                    setOverflowOpen((open) => !open);
                  }}
                  className={
                    "focus-ring flex h-[var(--archive-nav-height)] w-[var(--archive-overflow-width)] cursor-pointer items-center justify-center rounded-full text-[#767676] transition-colors hover:bg-[#fafafa] hover:text-[#262626] " +
                    (overflowOpen || page === "info"
                      ? "bg-[#fafafa] text-[#262626]"
                      : "")
                  }
                >
                  <span className="size-[var(--archive-overflow-icon)]">
                    <EllipsisIcon />
                  </span>
                </button>

                <div
                  role="menu"
                  aria-hidden={!overflowOpen}
                  onMouseLeave={() => setOverflowPreview(null)}
                  className={
                    "archive-menu-type absolute left-1/2 top-[calc(100%+var(--archive-menu-offset))] z-50 w-[var(--archive-menu-width)] -translate-x-1/2 overflow-hidden rounded-[var(--archive-menu-radius)] bg-[#fafafa] p-[var(--archive-menu-padding)] tracking-[0.2px] transition-[opacity,transform,visibility] duration-150 " +
                    (overflowOpen
                      ? "visible translate-y-0 opacity-100"
                      : "invisible pointer-events-none -translate-y-1 opacity-0")
                  }
                >
                  <span
                    aria-hidden="true"
                    className={
                      "pointer-events-none absolute inset-x-[var(--archive-menu-padding)] top-[var(--archive-menu-padding)] h-[var(--archive-menu-item-height)] rounded-[var(--archive-menu-radius)] bg-[#f0f0f0] transition-transform duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none " +
                      (highlightedOverflowItem === "about"
                        ? "translate-y-[var(--archive-menu-item-height)]"
                        : "translate-y-0")
                    }
                  />
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={overflowOpen ? 0 : -1}
                    onFocus={() => setOverflowPreview("contact")}
                    onMouseEnter={() => setOverflowPreview("contact")}
                    onClick={() => {
                      setOverflowOpen(false);
                      setOverflowPreview(null);
                      setContactOpen(true);
                    }}
                    className={
                      "focus-ring relative z-10 flex h-[var(--archive-menu-item-height)] w-full cursor-pointer items-center rounded-[var(--archive-menu-radius)] px-[var(--archive-menu-item-x)] text-left transition-colors " +
                      (highlightedOverflowItem === "contact"
                        ? "text-[#262626]"
                        : "text-[rgba(38,38,38,0.8)]")
                    }
                  >
                    Contact
                  </button>
                  <Link
                    href="/info"
                    role="menuitem"
                    tabIndex={overflowOpen ? 0 : -1}
                    onFocus={() => setOverflowPreview("about")}
                    onMouseEnter={() => setOverflowPreview("about")}
                    onClick={() => {
                      setOverflowOpen(false);
                      setOverflowPreview(null);
                    }}
                    className={
                      "focus-ring relative z-10 flex h-[var(--archive-menu-item-height)] w-full items-center rounded-[var(--archive-menu-radius)] px-[var(--archive-menu-item-x)] transition-colors " +
                      (highlightedOverflowItem === "about"
                        ? "text-[#262626]"
                        : "text-[rgba(38,38,38,0.8)]")
                    }
                  >
                    About Us
                  </Link>
                </div>
              </div>
            </nav>

            <div className="archive-copy-type hidden min-w-0 items-center justify-end gap-[var(--archive-header-action-gap)] font-medium leading-normal lg:flex">
              <button
                type="button"
                onClick={() => setSubscribeOpen(true)}
                aria-label="Subscribe"
                className="focus-ring size-[var(--archive-header-icon)] cursor-pointer text-[#767676] transition-colors hover:text-[#262626]"
              >
                <PlusIcon />
              </button>
              <span
                aria-label="Saved posts"
                role="img"
                className="size-[var(--archive-card-overlay-size)]"
              >
                <SaveIcon />
              </span>
              {desktopAuth}
            </div>

            <div className="col-start-3 flex items-center justify-end gap-2 lg:hidden">
              {desktopAuth}
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
          auth={mobileAuth}
        />
      ) : null}

      <SubscribeSheet open={subscribeOpen} onClose={closeSubscribe} />
      <ContactSheet open={contactOpen} onClose={closeContact} />
    </>
  );
}
