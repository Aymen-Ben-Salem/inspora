import type { Metadata } from "next";
import { isClerkConfigured } from "@/auth/config";
import { SiteNavbar } from "@/components/site-navbar";
import { SponsorSecurity } from "@/components/sponsorship/sponsor-security";

export const metadata: Metadata = {
  title: "Sponsor account security",
  robots: { index: false, follow: false, nocache: true },
};
export default function Page() {
  return (
    <>
      <SiteNavbar page="sponsor" />
      <SponsorSecurity authenticationEnabled={isClerkConfigured()} />
    </>
  );
}
