import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SiteNavbar } from "@/components/site-navbar";
import { CampaignEditor } from "@/components/sponsorship/campaign-editor";
import { SponsorLoading } from "@/components/sponsorship/sponsor-loading";
import { SponsorOwnerBoundary } from "@/components/sponsorship/sponsor-owner-boundary";
import { paidCampaignService } from "@/features/sponsorship/campaign-service";
export const metadata: Metadata = {
  title: "Edit your campaign",
  robots: { index: false, follow: false, nocache: true },
};
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await paidCampaignService.list();
  if (!list.ok)
    return (
      <main className="px-4 py-16">
        <p>{list.message}</p>
        <a className="focus-ring underline" href="/api/sponsorship/intent">
          Sign in
        </a>
      </main>
    );
  if (id === "new") {
    if (list.value.readonly) notFound();
    return <SponsorOwnerBoundary key={list.value.ownerUserId} ownerUserId={list.value.ownerUserId}><CampaignEditor paid={{ readonly: false }} /></SponsorOwnerBoundary>;
  }
  if (!z.uuid().safeParse(id).success) notFound();
  const campaign = list.value.campaigns.find((c) => c.id === id);
  if (!campaign) notFound();
  return (
    <SponsorOwnerBoundary key={list.value.ownerUserId} ownerUserId={list.value.ownerUserId}><CampaignEditor
      key={id}
      paid={{ campaign, readonly: list.value.readonly }}
    /></SponsorOwnerBoundary>
  );
}
export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <>
      <SiteNavbar page="sponsor" />
      <Suspense
        fallback={
          <SponsorLoading label="Loading campaign…" />
        }
      >
        <Content {...props} />
      </Suspense>
    </>
  );
}
