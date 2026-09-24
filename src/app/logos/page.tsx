import type { Metadata } from "next";

import { SiteNavbar } from "@/components/site-navbar";
import { LogoArchive } from "@/components/logos/logo-archive";
import { getPublishedLogos } from "@/data/logos-repository";
import {
  buildLogoCollectionStructuredData,
  serializeJsonLd,
  SITE_OG_IMAGE,
} from "@/lib/seo";

export const metadata: Metadata = {
  title: "Logos",
  description:
    "Explore a curated archive of logos and icons with creator credits, industries, colours, styles, and shapes.",
  alternates: { canonical: "/logos" },
  robots: { index: true, follow: true },
  twitter: { card: "summary_large_image", title: "Logo and app icon inspiration", description: "Explore a curated archive of logos and icons with creator credits, industries, colours, styles, and shapes.", images: [SITE_OG_IMAGE] },
  openGraph: {
    url: "/logos",
    title: "Logos — Inspora",
    description:
      "Curated logo and icon inspiration with creator attribution and visual details.",
    images: [SITE_OG_IMAGE],
  },
};

type LogosPageProps = {
  searchParams: Promise<{ logo?: string | string[] }>;
};

export default async function LogosPage({ searchParams }: LogosPageProps) {
  const [{ logo: logoParam }, logos] = await Promise.all([
    searchParams,
    getPublishedLogos(),
  ]);
  const initialSlug = Array.isArray(logoParam) ? logoParam[0] : logoParam;

  return (
    <div className="min-h-[100dvh] bg-white">
      <SiteNavbar page="logos" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildLogoCollectionStructuredData(logos)),
        }}
      />
      <LogoArchive logos={logos} initialSlug={initialSlug} />
    </div>
  );
}
