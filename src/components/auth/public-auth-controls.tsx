import "server-only";

import Link from "next/link";
import type { Route } from "next";

import { isClerkConfigured } from "../../auth/config";
import { PublicAuthControlsClient } from "./public-auth-controls-client";

export function PublicAuthControls({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  if (!isClerkConfigured()) {
    return (
      <Link
        href={"/sign-in" as Route}
        scroll={false}
        className={
          variant === "desktop"
            ? "archive-copy-type focus-ring inline-flex h-[var(--archive-sign-in-height)] w-[var(--archive-sign-in-width)] items-center justify-center bg-[#262626] px-[var(--archive-sign-in-pad-x)] py-[var(--archive-sign-in-pad-y)] font-medium tracking-[0.2px] text-white shadow-[0_1px_1px_#e6e6e6] transition-colors hover:bg-black"
            : "focus-ring inline-flex min-h-10 items-center justify-center bg-[#262626] px-4 text-[15px] text-white transition-colors hover:bg-black"
        }
      >
        Sign in
      </Link>
    );
  }

  return <PublicAuthControlsClient variant={variant} />;
}
