"use client";

import type { Route } from "next";
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
import { MobileNavigationOverlay } from "./mobile-navigation-overlay";
import { SponsorIcons } from "./sponsorship/sponsor-icons";
import { NavbarMenu } from "./navbar-menu";

export type NavbarPage = "design" | "info" | "logos" | "profile" | "saved" | "sponsor" | "websites";

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
  const mobileActionRef = useRef<(() => void) | null>(null);

  const closeContact = useCallback(() => setContactOpen(false), []);
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
                  prefetch={true}
                  aria-current={page === itemPage ? "page" : undefined}
                  style={{
                    color: page === itemPage ? archiveInk : archiveMuted,
                  }}
                  className="focus-ring inline-flex h-[var(--archive-nav-height)] items-center gap-1.5 px-[var(--archive-nav-pad-x)] text-[length:var(--archive-nav-size)] font-medium leading-normal whitespace-nowrap transition-colors hover:!text-[#262626]"
                >
                  {label}
                  {itemPage === "design" ? null : (
                    <span
                      className={`rounded-[3px] px-1 py-0.5 text-[8px] leading-none text-white ${page === itemPage ? "bg-[#262626]" : "bg-[#767676]"}`}
                    >
                      New
                    </span>
                  )}
                </Link>
              ))}

              <NavbarMenu
                label="More navigation"
                trigger={<span className="size-[var(--archive-overflow-icon)]"><EllipsisIcon /></span>}
                triggerClassName={(open) =>
                  "flex h-[var(--archive-nav-height)] w-[var(--archive-overflow-width)] items-center justify-center rounded-full text-[#767676] transition-colors hover:bg-[#fafafa] hover:text-[#262626] " +
                  (open || page === "info" ? "bg-[#fafafa] text-[#262626]" : "")
                }
                menuClassName="left-1/2 w-[var(--archive-menu-width)] -translate-x-1/2"
                items={[
                  { label: "Contact", onSelect: () => setContactOpen(true) },
                  { label: "About Us", href: "/info" },
                  { label: "Sponsor", href: "/sponsor" as Route },
                ]}
              />
            </nav>

            <div className="archive-copy-type hidden min-w-0 items-center justify-end gap-[var(--archive-header-action-gap)] font-medium leading-normal lg:flex">
              <SponsorIcons />
              <Link
                href={"/sponsor" as Route}
                aria-label="Become a sponsor"
                className="focus-ring flex size-[35px] shrink-0 items-center justify-center rounded-md border border-dashed border-[#e6e6e6] text-[#767676] transition-colors hover:text-[#262626]"
              ><span className="size-6">
                <PlusIcon />
              </span>
              </Link>
              {desktopAuth}
            </div>

            <div className="col-start-3 flex items-center justify-end gap-2 lg:hidden">
              <Link href={"/sponsor" as Route} aria-label="Become a sponsor" className="focus-ring flex size-10 items-center justify-center rounded-md border border-dashed border-[#e6e6e6] text-[#767676]"><span className="size-5"><PlusIcon /></span></Link>
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
            const action = mobileActionRef.current;
            mobileActionRef.current = null;
            action?.();
          }}
          onAction={(action) => {
            mobileActionRef.current = action;
            closeMobileMenu();
          }}
          onContact={() => setContactOpen(true)}
          activeHref={
            page === "logos"
              ? "/logos"
              : page === "websites"
                ? "/websites"
                : page === "saved"
                  ? "/saved"
                : page === "sponsor"
                  ? "/sponsor"
                : page === "info"
                  ? "/info"
                  : "/"
          }
          auth={mobileAuth}
        />
      ) : null}

      <ContactSheet open={contactOpen} onClose={closeContact} />
    </>
  );
}
