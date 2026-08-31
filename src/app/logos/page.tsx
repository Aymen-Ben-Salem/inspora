import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Logos",
  alternates: { canonical: "/logos" },
  robots: { index: false, follow: true },
};

export default function LogosPage() {
  return <main aria-label="Logos" className="min-h-[100dvh] bg-white" />;
}
