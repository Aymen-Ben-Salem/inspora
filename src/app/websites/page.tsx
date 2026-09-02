import type { Metadata } from "next";

import { HomepageHeader } from "@/components/homepage-header";
import { WebsiteArchive } from "@/components/websites/website-archive";
import { getPublishedWebsites } from "@/data/websites-repository";
import { isPostView } from "@/domain/post";
import { SITE_OG_IMAGE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Websites",
  description:
    "Explore curated website design inspiration with full-page previews, individual sections, creator credits, themes, and colours.",
  alternates: { canonical: "/websites" },
  robots: { index: true, follow: true },
  openGraph: {
    url: "/websites",
    title: "Websites — Inspora",
    description: "Curated website design inspiration with complete previews and section breakdowns.",
    images: [SITE_OG_IMAGE],
  },
};

type WebsitesPageProps = {
  searchParams: Promise<{
    website?: string | string[];
    view?: string | string[];
  }>;
};

export default async function WebsitesPage({ searchParams }: WebsitesPageProps) {
  const { website: websiteParam, view: viewParam } = await searchParams;
  const initialSlug = Array.isArray(websiteParam) ? websiteParam[0] : websiteParam;
  const rawView = Array.isArray(viewParam) ? viewParam[0] : viewParam;
  const view = rawView && isPostView(rawView) ? rawView : "latest";
  const websites = await getPublishedWebsites({ view });

  return (
    <div className="min-h-[100dvh] bg-white">
      <HomepageHeader page="websites" />
      <WebsiteArchive websites={websites} initialSlug={initialSlug} view={view} />
    </div>
  );
}
