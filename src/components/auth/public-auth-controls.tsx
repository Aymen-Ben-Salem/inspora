import "server-only";

import Link from "next/link";
import type { Route } from "next";

import { isClerkConfigured } from "../../auth/config";
import { PublicAuthControlsClient } from "./public-auth-controls-client";
import { mobileNavigationHeadingClass } from "../mobile-navigation-styles";
import { MobileSignInLink } from "./mobile-sign-in-link";

export function PublicAuthControls({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  if (!isClerkConfigured()) {
    const signIn = variant === "mobile" ? <MobileSignInLink /> : (
      <Link
        href={"/sign-in" as Route}
      prefetch={false}
        scroll={false}
        className="archive-copy-type focus-ring inline-flex h-[var(--archive-sign-in-height)] w-[var(--archive-sign-in-width)] items-center justify-center bg-[#262626] px-[var(--archive-sign-in-pad-x)] py-[var(--archive-sign-in-pad-y)] font-medium tracking-[0.2px] text-white shadow-[0_1px_1px_#e6e6e6] transition-colors hover:bg-black"
      >
        Sign in
      </Link>
    );
    return variant === "mobile" ? (
      <section aria-labelledby="mobile-nav-account" className="mt-6">
        <h2 id="mobile-nav-account" className={mobileNavigationHeadingClass}>Account</h2>
        <div className="mt-2 flex flex-col items-start">{signIn}</div>
      </section>
    ) : signIn;
  }

  return <PublicAuthControlsClient variant={variant} />;
}
