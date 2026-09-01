import type { Metadata } from "next";

import { HomepageHeader } from "@/components/homepage-header";
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
      <HomepageHeader page="logos" />
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
