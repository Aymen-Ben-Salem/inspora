import { PublicAuthControls } from "./auth/public-auth-controls";
import { isMcpPreviewEnabled } from "@/features/inspiration/preview";
import {
  SiteNavbarClient,
  type NavbarPage,
} from "./site-navbar-client";

export function SiteNavbar({ page }: { page?: NavbarPage }) {
  return (
    <SiteNavbarClient
      page={page}
      showMcp={isMcpPreviewEnabled()}
      desktopAuth={<PublicAuthControls variant="desktop" />}
      mobileAuth={<PublicAuthControls variant="mobile" />}
    />
  );
}

