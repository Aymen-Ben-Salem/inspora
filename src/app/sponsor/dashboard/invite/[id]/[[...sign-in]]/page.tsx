import { SignIn, SignOutButton } from "@clerk/nextjs";
import { and, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { publicAuthAppearance } from "@/auth/appearance";
import { SponsorLoading } from "@/components/sponsorship/sponsor-loading";
import { requireDatabase } from "@/db/client";
import { sponsorAccounts, sponsorCheckouts, sponsorIdentities } from "@/db/schema";
import { sponsorshipEnabled } from "@/features/sponsorship/config";
import { readSponsorSecurity } from "@/features/sponsorship/security";

export const metadata: Metadata = {
  title: "Sponsor dashboard access",
  robots: { index: false, follow: false, nocache: true },
};

async function Access({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!sponsorshipEnabled() || !z.uuid().safeParse(id).success) notFound();
  const [invite] = await requireDatabase()
    .select({ owner: sponsorCheckouts.ownerUserId })
    .from(sponsorCheckouts)
    .innerJoin(sponsorIdentities, eq(sponsorIdentities.userId, sponsorCheckouts.ownerUserId))
    .innerJoin(sponsorAccounts, eq(sponsorAccounts.ownerUserId, sponsorCheckouts.ownerUserId))
    .where(and(eq(sponsorCheckouts.id, id), eq(sponsorCheckouts.state, "completed"),
      eq(sponsorIdentities.state, "allowed"),
      sql`${sponsorAccounts.state} in ('active','inactive')`,
      sql`${sponsorCheckouts.snapshot}->>'offlineInvoice' = 'true'`));
  if (!invite) notFound();

  const path = `/sponsor/dashboard/invite/${id}`;
  const session = await readSponsorSecurity();
  if (session.userId === invite.owner) {
    if (session.state === "ready") redirect("/sponsor/dashboard?section=campaigns");
    if (session.state === "verification_required") redirect("/sponsor/security");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-medium">Sponsor dashboard access</h1>
      <p className="text-center text-sm text-[#767676]">Sign in with the email assigned to this sponsorship.</p>
      {session.userId ? <SignOutButton redirectUrl={path}>
        <button type="button" className="focus-ring mt-4 underline">Sign out and switch accounts</button>
      </SignOutButton> : <SignIn
        path={path}
        routing="path"
        forceRedirectUrl={path}
        appearance={{
          ...publicAuthAppearance,
          elements: { ...publicAuthAppearance.elements, socialButtonsRoot: { display: "none" }, dividerRow: { display: "none" } },
        }}
      />}
    </main>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<SponsorLoading />}><Access params={params} /></Suspense>;
}
