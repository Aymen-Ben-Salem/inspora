import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteNavbar } from "@/components/site-navbar";
import { SponsorPage } from "@/components/sponsorship/sponsor-page";
import { SponsorPageSkeleton } from "@/components/sponsorship/sponsor-page-skeleton";
import { readSeatAvailability } from "@/features/sponsorship/repository";
import { sponsorshipWritesEnabled } from "@/features/sponsorship/config";
export const metadata: Metadata = {
  title: "Sponsor Inspora",
  description:
    "Prepare a private sponsorship campaign for Inspora. Four seats, USD 500 per exact 30-day period.",
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
      <Suspense fallback={<SponsorPageSkeleton />}>
        <Offer />
      </Suspense>
    </>
  );
}
