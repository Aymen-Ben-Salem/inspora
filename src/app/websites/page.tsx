import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Websites",
  alternates: { canonical: "/websites" },
  robots: { index: false, follow: true },
};

export default function WebsitesPage() {
  return <main aria-label="Websites" className="min-h-[100dvh] bg-white" />;
}
