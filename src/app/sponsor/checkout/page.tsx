import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignEditor } from "@/components/sponsorship/campaign-editor";
import { SponsorLoading } from "@/components/sponsorship/sponsor-loading";
import { isClerkConfigured } from "@/auth/config";
import { readSponsorCurrency } from "@/features/sponsorship/request-currency";

export const metadata: Metadata = {
  title: "Preparing your payment",
  robots: { index: false, follow: false },
};

async function Handoff() {
  return <CampaignEditor checkoutHandoff authenticationEnabled={isClerkConfigured()} initialCurrency={await readSponsorCurrency()} />;
}

export default function Page() {
  return <Suspense fallback={<SponsorLoading label="Preparing your payment…" />}><Handoff /></Suspense>;
}
