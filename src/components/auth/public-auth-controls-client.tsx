"use client";

import { SignOutButton, useAuth, useUser } from "@clerk/nextjs";
import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { useContext } from "react";

import { useViewerProfile } from "../profile/use-viewer-profile";
import { useSubmission } from "../submissions/submission-provider";
import { MobileNavigationActionContext } from "../mobile-navigation-actions";
import { mobileNavigationHeadingClass } from "../mobile-navigation-styles";
import { MobileSignInLink } from "./mobile-sign-in-link";
import { NavbarMenu, type NavbarMenuItem } from "../navbar-menu";

export function PublicAuthControlsClient({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { openSubmission } = useSubmission();
  const navigate = useContext(MobileNavigationActionContext);
  const {
    profile,
    capabilities,
    isLoading: profileLoading,
  } = useViewerProfile(isSignedIn ? user?.id : undefined);
  const viewerName = profile?.name ?? user?.fullName;

  const content = !isLoaded ? (
    <span
      aria-hidden="true"
      className={
        variant === "desktop"
          ? "inline-block size-[var(--archive-user-avatar-size)]"
          : "inline-block size-[35px]"
      }
    />
  ) : isSignedIn && user ? (
    <NavbarMenu
      key={user.id}
      label="Account menu"
      triggerClassName={`relative block shrink-0 overflow-hidden rounded-full border border-[#e6e6e6] ${variant === "desktop" ? "size-[var(--archive-user-avatar-size)]" : "size-[35px]"}`}
      menuClassName={`w-56 ${variant === "mobile" ? "left-0" : "right-0"}`}
      trigger={profileLoading ? (
        <span aria-hidden="true" className="absolute inset-0 bg-[#f0f0f0]" />
      ) : (
        <Image src={profile?.avatarUrl || user.imageUrl} alt={viewerName ? `${viewerName}'s profile` : "Your profile"}
          fill sizes="35px" className="object-cover" />
      )}
      items={[
        ...(capabilities?.viewer !== false ? [
          { label: "Profile", href: "/profile" as Route },
          { label: "Saved", href: "/saved" as Route },
          { label: "Submit work", onSelect: () => navigate(openSubmission) },
        ] : []),
        ...(capabilities?.sponsor ? [
          { label: "Sponsorship dashboard", href: "/sponsor/dashboard" as Route },
          { label: "Billing", href: "/sponsor/dashboard#billing" as Route },
        ] : []),
        { label: "Sign out", wrap: (button) => <SignOutButton>{button}</SignOutButton> },
      ] satisfies NavbarMenuItem[]}
    />
  ) : variant === "mobile" ? <MobileSignInLink /> : (
    <Link
      href={"/sign-in" as Route}
      prefetch={false}
      scroll={false}
      className="archive-copy-type focus-ring inline-flex h-[var(--archive-sign-in-height)] w-[var(--archive-sign-in-width)] cursor-pointer items-center justify-center bg-[#262626] px-[var(--archive-sign-in-pad-x)] py-[var(--archive-sign-in-pad-y)] font-medium tracking-[0.2px] text-white shadow-[0_1px_1px_#e6e6e6] transition-colors hover:bg-black"
    >
      Sign in
    </Link>
  );

  return variant === "mobile" ? (
    <section aria-labelledby="mobile-nav-account" className="mt-6">
      <h2 id="mobile-nav-account" className={mobileNavigationHeadingClass}>
        Account
      </h2>
      <div className="mt-2 flex flex-col items-start">{content}</div>
    </section>
  ) : (
    content
  );
}
