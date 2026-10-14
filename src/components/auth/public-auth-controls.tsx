import "server-only";

import { isClerkConfigured } from "../../auth/config";
import { PublicAuthControlsClient } from "./public-auth-controls-client";
import { mobileNavigationHeadingClass } from "../mobile-navigation-styles";
import { MobileSignInLink } from "./mobile-sign-in-link";
import { DesktopSignInLink } from "./desktop-sign-in-link";

export function PublicAuthControls({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  if (!isClerkConfigured()) {
    const signIn = variant === "mobile" ? <MobileSignInLink /> : <DesktopSignInLink />;
    return variant === "mobile" ? (
      <section aria-labelledby="mobile-nav-account" className="mt-6">
        <h2 id="mobile-nav-account" className={mobileNavigationHeadingClass}>Account</h2>
        <div className="mt-2 flex flex-col items-start">{signIn}</div>
      </section>
    ) : signIn;
  }

  return <PublicAuthControlsClient variant={variant} />;
}
