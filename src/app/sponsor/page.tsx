import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteNavbar } from "@/components/site-navbar";
import { SponsorPage } from "@/components/sponsorship/sponsor-page";
import { SponsorLoading } from "@/components/sponsorship/sponsor-loading";
import { readSeatAvailability } from "@/features/sponsorship/repository";
import { sponsorshipWritesEnabled } from "@/features/sponsorship/config";
export const metadata: Metadata = {
  title: "Sponsor Inspora",
  description:
    "Prepare a private sponsorship campaign for Inspora. Four seats, USD 500 or EUR 500 for one calendar month. One-time or Monthly.",
};
async function Offer() {
  await connection();
  return (
    <SponsorPage
      availability={await readSeatAvailability()}
      enabled={sponsorshipWritesEnabled()}
    />
  );
}
export default function Page() {
  return (
    <>
      <SiteNavbar page="sponsor" />
      <Suspense fallback={<SponsorLoading />}>
        <Offer />
      </Suspense>
    </>
  );
}
