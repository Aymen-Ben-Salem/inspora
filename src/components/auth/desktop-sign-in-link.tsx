"use client";

import Link from "next/link";
import type { Route } from "next";
import { rememberPublicAuthReturn } from "../../auth/public-auth-return";

export function DesktopSignInLink() {
  return (
    <Link
      href={"/sign-in" as Route}
      prefetch={false}
      scroll={false}
      onNavigate={rememberPublicAuthReturn}
      className="archive-copy-type focus-ring inline-flex h-[var(--archive-sign-in-height)] w-[var(--archive-sign-in-width)] cursor-pointer items-center justify-center bg-[#262626] px-[var(--archive-sign-in-pad-x)] py-[var(--archive-sign-in-pad-y)] font-medium tracking-[0.2px] text-white shadow-[0_1px_1px_#e6e6e6] transition-colors hover:bg-black"
    >
      Sign in
    </Link>
  );
}
