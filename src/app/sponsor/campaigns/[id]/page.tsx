import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SiteNavbar } from "@/components/site-navbar";
import { CampaignEditor } from "@/components/sponsorship/campaign-editor";
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
    return <CampaignEditor paid={{ readonly: false }} />;
  }
  if (!z.uuid().safeParse(id).success) notFound();
  const campaign = list.value.campaigns.find((c) => c.id === id);
  if (!campaign) notFound();
  return (
    <CampaignEditor
      key={id}
      paid={{ campaign, readonly: list.value.readonly }}
    />
  );
}
export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <>
      <SiteNavbar page="sponsor" />
      <Suspense
        fallback={
          <p role="status" className="p-8 text-sm">
            Loading campaign…
          </p>
        }
      >
        <Content {...props} />
      </Suspense>
    </>
  );
}
