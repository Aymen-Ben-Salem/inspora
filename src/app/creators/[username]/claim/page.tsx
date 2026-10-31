import { auth } from "@clerk/nextjs/server";
import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireDatabase } from "@/db/client";
import { creators } from "@/db/schema";
import { ClaimPageLayout } from "@/components/profile/claim-page-layout";
import { CreatorClaimForm } from "@/components/profile/creator-claim-form";
import { resolvePublicCreatorProfile } from "@/features/creators/identity";
import { visibleClaimTarget } from "@/features/creators/identity/claim-requests";
import { resolveCreatorXAccount } from "@/features/creators/identity/x-profile";
import { XLookupError } from "@/features/creators/x-api";
import { verifiedXIdentityForUser } from "@/features/creators/identity/external-identity";
import { getCreatorClaimPreview } from "@/features/creators/identity/claim-presentation";

export const metadata: Metadata = { title: "Claim creator profile", robots: { index: false, follow: false } };

export default async function CreatorClaimPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams?: Promise<{ report?: string }> }) {
  const resolved = await resolvePublicCreatorProfile((await params).username);
  if (!resolved) notFound();
  const path = "/creators/" + resolved.canonicalUsername + "/claim";
  const { userId } = await auth();
  const [target, identity] = await Promise.all([
    requireDatabase().query.creators.findFirst({ where: eq(creators.id, resolved.profile.id) }),
    userId ? verifiedXIdentityForUser(userId) : null,
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
  const preview = await getCreatorClaimPreview(target, xMatches && userId ? userId : undefined, xMatches ? identity?.providerAccountId : undefined);
  return <ClaimPageLayout editorial title={report ? "Let’s correct this profile" : "Claim your profile"}
    description={report ? "Let us know about an incorrect attribution or ownership problem." : "Bring your work together and make this profile yours."}
    backHref={"/creators/" + resolved.canonicalUsername} backLabel={`Back to ${target.name}`}>
    <CreatorClaimForm key={`${target.id}:${xMatches}`} targetId={target.id} targetName={target.name} returnPath={path} connectedXUsername={identity?.username ?? null} xMatches={xMatches} report={report} signedIn={Boolean(userId)} verificationError={verificationError} preview={preview} />
  </ClaimPageLayout>;
}
