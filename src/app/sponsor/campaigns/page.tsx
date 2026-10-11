import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteNavbar } from "@/components/site-navbar";
import { CampaignList } from "@/components/sponsorship/campaign-list";
import { SponsorLoading } from "@/components/sponsorship/sponsor-loading";
import { SponsorOwnerBoundary } from "@/components/sponsorship/sponsor-owner-boundary";
import { paidCampaignService } from "@/features/sponsorship/campaign-service";
export const metadata: Metadata = {
  title: "Your campaigns",
  robots: { index: false, follow: false, nocache: true },
};
async function Content() {
  const result = await paidCampaignService.list();
  return result.ok ? (
    <SponsorOwnerBoundary key={result.value.ownerUserId} ownerUserId={result.value.ownerUserId}><CampaignList initial={result.value} /></SponsorOwnerBoundary>
  ) : (
    <main className="mx-auto max-w-[1120px] px-4 py-16">
      <h1 className="text-3xl">Private campaigns</h1>
      <p className="mt-4 text-sm text-[#767676]">{result.message}</p>
      <a
        className="focus-ring mt-6 inline-block underline"
        href="/api/sponsorship/intent"
      >
        Sign in
      </a>
    </main>
  );
}
export default function Page() {
  return (
    <>
      <SiteNavbar page="sponsor" />
      <Suspense
        fallback={
          <SponsorLoading label="Loading campaigns…" />
        }
      >
        <Content />
      </Suspense>
    </>
  );
}
