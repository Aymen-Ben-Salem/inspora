import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Info",
  alternates: { canonical: "/info" },
  robots: { index: false, follow: true },
};

export default function InfoPage() {
  return <main aria-label="Info" className="min-h-[100dvh] bg-white" />;
}
