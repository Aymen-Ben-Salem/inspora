import type { Metadata } from "next";
import { SponsorVerification } from "@/components/sponsorship/sponsor-verification";
export const metadata: Metadata = {
  title: "Verify sponsor access",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 text-[#262626]">
      <SponsorVerification />
    </main>
  );
}
