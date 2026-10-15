import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteNavbar } from "@/components/site-navbar";
import { SponsorPage } from "@/components/sponsorship/sponsor-page";
import { SponsorLoading } from "@/components/sponsorship/sponsor-loading";
import { readSeatAvailability } from "@/features/sponsorship/repository";
import { sponsorshipWritesEnabled } from "@/features/sponsorship/config";
import { SITE_NAME, SITE_OG_IMAGE } from "@/lib/seo";

const description =
  "Prepare a private sponsorship campaign for Inspora. Four seats, USD 500 or EUR 500 for one calendar month. One-time or Monthly.";

export const metadata: Metadata = {
  title: "Sponsor Inspora",
  description,
  alternates: { canonical: "/sponsor" },
  openGraph: {
    type: "website",
    title: "Sponsor Inspora",
    description,
    url: "/sponsor",
    siteName: SITE_NAME,
    images: [SITE_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sponsor Inspora",
    description,
    images: [SITE_OG_IMAGE],
  },
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
