import { auth } from "@clerk/nextjs/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { afterCreatorMatch } from "@/auth/creator-auth-return";
import { ClaimPageLayout } from "@/components/profile/claim-page-layout";
import { CreatorClaimForm } from "@/components/profile/creator-claim-form";
import { verifiedXIdentityForUser } from "@/features/creators/identity/external-identity";
import { findXCreatorCandidates, resolveCreatorXAccount } from "@/features/creators/identity/x-profile";
import { XLookupError } from "@/features/creators/x-api";
import { readAccountCapabilities } from "@/features/sponsorship/authorization";
import { getCreatorClaimPreview } from "@/features/creators/identity/claim-presentation";

export const metadata: Metadata = { title: "Your creator profile", robots: { index: false, follow: false } };

export default async function CreatorMatchPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const destination = afterCreatorMatch((await searchParams).returnTo);
  const { userId } = await auth();
  if (!userId) redirect(("/sign-in?redirect_url=" + encodeURIComponent("/profile/claim-match?returnTo=" + encodeURIComponent(destination))) as Route);
  if (!(await readAccountCapabilities(userId)).viewer) redirect("/" as Route);
  const identity = await verifiedXIdentityForUser(userId);
  if (!identity) redirect(destination as Route);
  const candidates = (await findXCreatorCandidates(identity)).filter(row => row.ownerUserId !== userId && !row.trashedAt);
  if (!candidates.length) redirect(destination as Route);
  const target = candidates.length === 1 && candidates[0].username ? candidates[0] : null;
  let matches = false;
  let error: string | undefined;
  if (target && !target.ownerUserId) {
    try { matches = (await resolveCreatorXAccount(target)) === identity.providerAccountId; }
    catch (failure) {
      if (!(failure instanceof XLookupError)) throw failure;
      error = failure.message;
    }
  }
  const preview = target ? await getCreatorClaimPreview(target, matches ? userId : undefined, matches ? identity.providerAccountId : undefined) : undefined;
  return <ClaimPageLayout title={target && !target.ownerUserId ? "Is this your profile?" : "Check your X attribution"}
    description={target?.ownerUserId ? "This profile already has an owner. Let us know if its X attribution is incorrect." : `We found a creator profile linked to @${identity.username}. Review it before claiming your work.`}
    backHref={destination} backLabel="Back">
    {target ? <>
      <CreatorClaimForm key={`${target.id}:${matches}`} targetId={target.id} targetName={target.name} returnPath={"/creators/" + target.username + "/claim"} connectedXUsername={identity.username} xMatches={matches} verificationError={error} report={Boolean(target.ownerUserId)} preview={preview} />
    </> : <div className="grid gap-4"><p className="text-sm">This X attribution needs correction before you can claim a profile.</p>{candidates.map(row => row.username ? <Link key={row.id} className="focus-ring cursor-pointer rounded-xl border border-black/15 p-4 underline" href={("/creators/" + row.username + "/claim?report=1") as Route}>Report attribution for {row.name}</Link> : <CreatorClaimForm key={row.id} targetId={row.id} targetName={row.name} returnPath="/profile/claim-match" connectedXUsername={identity.username} xMatches={false} report />)}</div>}
  </ClaimPageLayout>;
}
