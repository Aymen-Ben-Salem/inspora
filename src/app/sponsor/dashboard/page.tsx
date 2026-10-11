import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteNavbar } from "@/components/site-navbar";
import { SponsorDashboard } from "@/components/sponsorship/dashboard";
import { SponsorLoading } from "@/components/sponsorship/sponsor-loading";
import { SponsorOwnerBoundary } from "@/components/sponsorship/sponsor-owner-boundary";
import { readOwnSponsorDashboard } from "@/features/sponsorship/billing-service";
import { isSponsorBillingMode } from "@/features/sponsorship/purchase-mode";
export const metadata: Metadata = {
  title: "Your sponsorship",
  robots: { index: false, follow: false, nocache: true },
};
async function Content({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  await connection();
  const data = await readOwnSponsorDashboard();
  const { billing } = await searchParams;
  return data ? (
    <SponsorOwnerBoundary key={data.ownerUserId} ownerUserId={data.ownerUserId}><SponsorDashboard initial={data} initialMode={isSponsorBillingMode(billing) ? billing : "one_time"} /></SponsorOwnerBoundary>
  ) : (
    <main className="mx-auto max-w-[1120px] px-4 py-16">
      <h1 className="text-3xl">Private sponsorship</h1>
      <p className="mt-4 text-sm text-[#767676]">
        Sign in with your sponsor identity to open your campaign and billing
        history.
      </p>
      <a
        href="/api/sponsorship/intent"
        className="focus-ring mt-6 inline-block underline"
      >
        Sign in
      </a>
    </main>
  );
}
export default function Page({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  return (
    <>
      <SiteNavbar page="sponsor" />
      <Suspense
        fallback={
          <SponsorLoading />
        }
      >
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}
