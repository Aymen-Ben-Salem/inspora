import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteNavbar } from "@/components/site-navbar";
import { CampaignEditor } from "@/components/sponsorship/campaign-editor";
import { isClerkConfigured } from "@/auth/config";
import { readSponsorCurrency } from "@/features/sponsorship/request-currency";
import { SponsorLoading } from "@/components/sponsorship/sponsor-loading";
export const metadata: Metadata = {
  title: "Prepare sponsorship",
  robots: { index: false, follow: false },
};
async function Editor() {
  return <CampaignEditor authenticationEnabled={isClerkConfigured()} initialCurrency={await readSponsorCurrency()} />;
}
export default function Page() {
  return (
    <>
      <SiteNavbar page="sponsor" />
      <Suspense fallback={<SponsorLoading label="Loading campaign…" />}><Editor /></Suspense>
    </>
  );
}
