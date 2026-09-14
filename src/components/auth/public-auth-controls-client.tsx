"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";

export function PublicAuthControlsClient({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  const { isLoaded, isSignedIn } = useAuth();

  const content = !isLoaded ? (
    <span
      aria-hidden="true"
      className={
        variant === "desktop"
          ? "inline-block size-[var(--archive-user-avatar-size)]"
          : "inline-block size-[35px]"
      }
    />
  ) : isSignedIn ? (
    <UserButton
      appearance={{
        elements: {
          avatarBox:
            variant === "desktop"
              ? "size-[var(--archive-user-avatar-size)] border border-[#e6e6e6]"
              : "size-[35px] border border-[#e6e6e6]",
        },
      }}
    />
  ) : (
    <Link
      href={"/sign-in" as Route}
      scroll={false}
      className={
        variant === "desktop"
          ? "archive-copy-type focus-ring inline-flex h-[var(--archive-sign-in-height)] w-[var(--archive-sign-in-width)] cursor-pointer items-center justify-center bg-[#262626] px-[var(--archive-sign-in-pad-x)] py-[var(--archive-sign-in-pad-y)] font-medium tracking-[0.2px] text-white shadow-[0_1px_1px_#e6e6e6] transition-colors hover:bg-black"
          : "focus-ring inline-flex min-h-10 cursor-pointer items-center justify-center bg-[#262626] px-4 text-[15px] text-white transition-colors hover:bg-black"
      }
    >
      Sign in
    </Link>
  );

  return variant === "mobile" ? (
    <section aria-labelledby="mobile-nav-account" className="mt-6">
      <h2 id="mobile-nav-account" className="mb-2 text-[15px] text-[#666]">
        Account
      </h2>
      {content}
    </section>
  ) : (
    content
  );
}
