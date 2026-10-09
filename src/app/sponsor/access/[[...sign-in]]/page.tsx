import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata, Route } from "next";
import { isClerkConfigured } from "@/auth/config";
import { hasSponsorIntent } from "@/features/sponsorship/onboarding";
import { sponsorshipWritesEnabled } from "@/features/sponsorship/config";
import { SponsorSignIn } from "@/components/sponsorship/sponsor-sign-in";
import { BrandMark } from "@/components/brand-mark";
export const metadata: Metadata = {
  title: "Sponsor access",
  robots: { index: false, follow: false },
};
async function Access() {
  if (!isClerkConfigured() || !sponsorshipWritesEnabled())
    return <p>Sponsor verification is currently unavailable.</p>;
  const { userId } = await auth();
  if (!(await hasSponsorIntent(userId)))
    redirect("/api/sponsorship/intent" as Route);
  if (userId) redirect("/sponsor/verify" as Route);
  return <SponsorSignIn />;
}
export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-10 text-[#262626]">
      <a href="/sponsor" aria-label="Inspora sponsorship">
        <BrandMark />
      </a>
      <h1 className="text-2xl font-semibold">Your sponsor access</h1>
      <p className="max-w-sm text-center text-sm text-[#767676]">
        Verify your email to save a private campaign preparation. Preparing does
        not create a creator profile or paid sponsorship.
      </p>
      <Suspense fallback={<p>Loading verification…</p>}>
        <Access />
      </Suspense>
    </main>
  );
}
