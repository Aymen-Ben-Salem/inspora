import { PublicAuthControls } from "./auth/public-auth-controls";
import {
  SiteNavbarClient,
  type NavbarPage,
} from "./site-navbar-client";

export function SiteNavbar({ page }: { page?: NavbarPage }) {
  return (
    <SiteNavbarClient
      page={page}
      desktopAuth={<PublicAuthControls variant="desktop" />}
      mobileAuth={<PublicAuthControls variant="mobile" />}
    />
  );
}

