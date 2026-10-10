"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext } from "react";
import { MobileNavigationActionContext } from "../mobile-navigation-actions";
import { mobileNavigationItemClass } from "../mobile-navigation-styles";

export function MobileSignInLink() {
  const router = useRouter();
  const navigate = useContext(MobileNavigationActionContext);
  return (
    <Link
      href={"/sign-in" as Route}
      prefetch={false}
      scroll={false}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(() => router.push("/sign-in" as Route, { scroll: false }));
      }}
      className={`focus-ring ${mobileNavigationItemClass} text-[#777] transition-colors hover:text-[#262626]`}
    >
      Sign in
    </Link>
  );
}
