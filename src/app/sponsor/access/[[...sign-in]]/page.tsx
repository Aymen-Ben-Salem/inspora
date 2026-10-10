import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata, Route } from "next";
import { isClerkConfigured } from "@/auth/config";
import { hasSponsorIntent } from "@/features/sponsorship/onboarding";
import { sponsorshipWritesEnabled } from "@/features/sponsorship/config";
import { SponsorSignIn } from "@/components/sponsorship/sponsor-sign-in";
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
      <Suspense fallback={<p>Loading verification…</p>}>
        <Access />
      </Suspense>
    </main>
  );
}
