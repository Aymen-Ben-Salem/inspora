import type { Metadata } from "next";

import { SiteNavbar } from "@/components/site-navbar";
import { WebsiteArchive } from "@/components/websites/website-archive";
import { getPublishedWebsites } from "@/data/websites-repository";
import { isPostView } from "@/domain/post";
import { buildWebsiteCollectionStructuredData, serializeJsonLd, SITE_OG_IMAGE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Websites",
  description:
    "Explore curated website design inspiration with full-page previews, individual sections, creator credits, themes, and colours.",
  alternates: { canonical: "/websites" },
  robots: { index: true, follow: true },
  twitter: { card: "summary_large_image", title: "Website design inspiration", description: "Explore curated website design inspiration with full-page previews, individual sections, creator credits, themes, and colours.", images: [SITE_OG_IMAGE] },
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
  const { view: viewParam } = await searchParams;
  const rawView = Array.isArray(viewParam) ? viewParam[0] : viewParam;
  const view = rawView && isPostView(rawView) ? rawView : "latest";
  const websites = await getPublishedWebsites({ view });

  return (
    <div className="min-h-[100dvh] bg-white">
      <SiteNavbar page="websites" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: serializeJsonLd(buildWebsiteCollectionStructuredData(websites)),
      }} />
      <WebsiteArchive websites={websites} view={view} />
    </div>
  );
}
