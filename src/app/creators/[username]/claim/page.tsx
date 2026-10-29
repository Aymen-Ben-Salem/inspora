import { auth } from "@clerk/nextjs/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireDatabase } from "@/db/client";
import { creators } from "@/db/schema";
import { SiteNavbar } from "@/components/site-navbar";
import { CreatorClaimForm } from "@/components/profile/creator-claim-form";
import { resolvePublicCreatorProfile } from "@/features/creators/identity";
import { visibleClaimTarget } from "@/features/creators/identity/claim-requests";
import { resolveCreatorXAccount } from "@/features/creators/identity/x-profile";
import { XLookupError } from "@/features/creators/x-api";
import { verifiedXIdentityForUser } from "@/features/creators/identity/external-identity";
import { getPublishedCreatorWorkCounts } from "@/features/profiles/repository";

export const metadata: Metadata = { title: "Claim creator profile", robots: { index: false, follow: false } };

export default async function CreatorClaimPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams?: Promise<{ report?: string }> }) {
  const resolved = await resolvePublicCreatorProfile((await params).username);
  if (!resolved) notFound();
  const path = "/creators/" + resolved.canonicalUsername + "/claim";
  const { userId } = await auth();
  const [target, identity, counts] = await Promise.all([
    requireDatabase().query.creators.findFirst({ where: eq(creators.id, resolved.profile.id) }),
    userId ? verifiedXIdentityForUser(userId) : null, getPublishedCreatorWorkCounts(resolved.profile.id),
  ]);
  if (!target || !visibleClaimTarget(target)) notFound();
  if (userId && target.ownerUserId === userId) redirect("/profile" as Route);
  const report = Boolean(target.ownerUserId) || (await searchParams)?.report === "1";
  let xMatches = false;
  let verificationError: string | undefined;
  if (identity && !report) {
    try { xMatches = (await resolveCreatorXAccount(target)) === identity.providerAccountId; }
    catch (error) {
      if (!(error instanceof XLookupError)) throw error;
      verificationError = error.message;
    }
  }
  return <main className="min-h-screen bg-white"><SiteNavbar page="profile" /><div className="mx-auto grid max-w-2xl gap-6 px-5 py-12">
    <Link href={("/creators/" + resolved.canonicalUsername) as Route} className="focus-ring w-fit cursor-pointer text-sm underline">Back to {target.name}</Link>
    <div><h1 className="text-3xl font-medium tracking-tight">{report ? "Report ownership problem" : "Claim this creator profile"}</h1><p className="mt-3 text-[#666]">{target.name} · @{resolved.canonicalUsername} · {counts.total} published works</p></div>
    <CreatorClaimForm targetId={target.id} targetName={target.name} returnPath={path} connectedXUsername={identity?.username ?? null} xMatches={xMatches} report={report} signedIn={Boolean(userId)} verificationError={verificationError} />
    <Link href="/profile/claims" className="focus-ring w-fit cursor-pointer text-sm underline">View your claims and reports</Link>
  </div></main>;
}
