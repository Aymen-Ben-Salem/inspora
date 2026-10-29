import { auth } from "@clerk/nextjs/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { afterCreatorMatch } from "@/auth/creator-auth-return";
import { SiteNavbar } from "@/components/site-navbar";
import { CreatorClaimForm } from "@/components/profile/creator-claim-form";
import { verifiedXIdentityForUser } from "@/features/creators/identity/external-identity";
import { findXCreatorCandidates, resolveCreatorXAccount } from "@/features/creators/identity/x-profile";
import { XLookupError } from "@/features/creators/x-api";
import { readAccountCapabilities } from "@/features/sponsorship/authorization";

export const metadata: Metadata = { title: "Your creator profile", robots: { index: false, follow: false } };

export default async function CreatorMatchPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const destination = afterCreatorMatch((await searchParams).returnTo);
  const { userId } = await auth();
  if (!userId) redirect(("/sign-in?redirect_url=" + encodeURIComponent("/profile/claim-match?returnTo=" + encodeURIComponent(destination))) as Route);
  if (!(await readAccountCapabilities(userId)).viewer) redirect("/" as Route);
  const identity = await verifiedXIdentityForUser(userId);
  if (!identity) redirect(destination as Route);
  const candidates = (await findXCreatorCandidates(identity)).filter(row => row.ownerUserId !== userId);
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
  return <main className="min-h-screen bg-white"><SiteNavbar page="profile" /><div className="mx-auto grid max-w-2xl gap-6 px-5 py-12">
    <h1 className="text-3xl font-medium tracking-tight">{target && !target.ownerUserId ? "Is this your creator profile?" : "Check your X attribution"}</h1>
    <p className="text-sm leading-6 text-[#666]">We found an existing creator profile associated with your X account, @{identity.username}. Confirm it to manage your credited work, or report an incorrect attribution.</p>
    {target ? <>
      <Link className="focus-ring w-fit cursor-pointer text-lg underline" href={("/creators/" + target.username) as Route}>{target.name} · @{target.username}</Link>
      <CreatorClaimForm targetId={target.id} targetName={target.name} returnPath={"/creators/" + target.username + "/claim"} connectedXUsername={identity.username} xMatches={matches} verificationError={error} report={Boolean(target.ownerUserId)} />
    </> : <div className="grid gap-4"><p className="text-sm">This X attribution needs correction before you can claim a profile.</p>{candidates.map(row => row.username ? <Link key={row.id} className="focus-ring cursor-pointer rounded-xl border border-black/15 p-4 underline" href={("/creators/" + row.username + "/claim?report=1") as Route}>Report attribution for {row.name}</Link> : <CreatorClaimForm key={row.id} targetId={row.id} targetName={row.name} returnPath="/profile/claim-match" connectedXUsername={identity.username} xMatches={false} report />)}</div>}
    <Link href={destination as Route} className="focus-ring w-fit cursor-pointer text-sm underline">Return to where you were</Link>
  </div></main>;
}
