"use client";

import {
  SignInButton,
  SignUpButton,
  useAuth,
  UserButton,
} from "@clerk/nextjs";

export function PublicAuthControlsClient({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  const { isLoaded, isSignedIn } = useAuth();

  const content = !isLoaded ? (
    <span aria-hidden="true" className="inline-block size-8" />
  ) : isSignedIn ? (
    <UserButton />
  ) : (
    <div
      className={
        variant === "desktop"
          ? "flex items-center gap-3"
          : "flex flex-col items-start gap-1"
      }
    >
      <SignInButton mode="redirect">
        <button
          type="button"
          className={
            variant === "desktop"
              ? "focus-ring cursor-pointer px-1 py-2 text-[rgba(38,38,38,0.6)] transition-colors hover:text-[#262626]"
              : "focus-ring cursor-pointer py-0.5 text-[17px] leading-[1.45] tracking-[-0.012em] text-[#666] transition-colors hover:text-[#262626]"
          }
        >
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="redirect">
        <button
          type="button"
          className={
            variant === "desktop"
              ? "focus-ring inline-flex h-[var(--archive-control-height)] cursor-pointer items-center justify-center border border-[#888] px-4 text-[#262626] transition-colors hover:border-[#262626]"
              : "focus-ring mt-1 inline-flex min-h-10 cursor-pointer items-center justify-center border border-[#888] px-4 text-[15px] text-[#262626] transition-colors hover:border-[#262626]"
          }
        >
          Sign up
        </button>
      </SignUpButton>
    </div>
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
