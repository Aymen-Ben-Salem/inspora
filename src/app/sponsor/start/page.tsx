import type { Metadata } from "next";
import { SiteNavbar } from "@/components/site-navbar";
import { CampaignEditor } from "@/components/sponsorship/campaign-editor";
import { isClerkConfigured } from "@/auth/config";
export const metadata: Metadata = {
  title: "Prepare sponsorship",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <>
      <SiteNavbar page="sponsor" />
      <CampaignEditor authenticationEnabled={isClerkConfigured()} />
    </>
  );
}
