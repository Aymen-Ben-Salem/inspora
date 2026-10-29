"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { changeOwnClaimAction } from "@/features/creators/claim-actions";
import type { ClaimActionState, OwnCreatorClaim } from "@/features/creators/types";
import { refreshViewerProfile } from "./use-viewer-profile";

function ClaimCard({ claim, history }: { claim: OwnCreatorClaim; history: boolean }) {
  const [state, action, busy] = useActionState(changeOwnClaimAction, { status: "idle" } as ClaimActionState);
  const href = claim.targetUsername ? "/creators/" + claim.targetUsername : null;
  const labels = { pending: claim.method === "ownership_report" ? "Report pending review" : "Claim again with X", approved: "Creator profile claimed", rejected: "Request closed", withdrawn: "Request withdrawn", resolved: "Ownership report resolved" };
  return <article className="grid gap-3 rounded-xl border border-[#e6e6e6] bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{claim.targetName}</h3><span className="text-xs text-[#666]">{claim.attentionReason ? "Needs your attention" : labels[claim.status]}</span></div>
    <p className="text-xs text-[#777]">{claim.method === "x" ? "X verification" : claim.method === "manual" ? "Manual review" : "Ownership report"} · {new Date(claim.createdAt).toISOString().slice(0, 10)}</p>
    {claim.attentionReason || claim.reviewReason ? <p className="whitespace-pre-wrap text-sm leading-6">{claim.attentionReason ?? claim.reviewReason}</p> : null}
    {claim.status === "approved" ? <p className="text-sm">Your account now manages this creator profile and its credited work.</p> : null}
    <div className="flex flex-wrap items-center gap-4 text-sm">
      {href ? <Link href={href as Route} className="focus-ring cursor-pointer underline">View creator</Link> : null}
      {claim.status === "approved" ? <Link href="/profile" className="focus-ring cursor-pointer underline">Manage profile</Link> : null}
      {claim.status === "pending" && claim.method !== "ownership_report" && href ? <Link href={(href + "/claim") as Route} className="focus-ring cursor-pointer underline">Claim with X</Link> : null}
      {(claim.status === "rejected" || claim.status === "withdrawn") && href ? <Link href={(href + "/claim") as Route} className="focus-ring cursor-pointer underline">Submit corrected evidence</Link> : null}
      {claim.status === "pending" || (!history && !claim.dismissedAt) ? <form action={action}>
        <input type="hidden" name="claimId" value={claim.id} /><input type="hidden" name="operation" value={claim.status === "pending" ? "withdraw" : "dismiss"} />
        <button disabled={busy} className="focus-ring cursor-pointer rounded-full border border-black/15 px-4 py-2 disabled:cursor-wait disabled:opacity-50">{busy ? "Saving…" : claim.status === "pending" ? "Withdraw request" : "Dismiss notification"}</button>
      </form> : null}
    </div>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className="text-sm">{state.message}</p> : null}
  </article>;
}

export function CreatorClaimsPanel({ claims, history = false }: { claims: OwnCreatorClaim[]; history?: boolean }) {
  const router = useRouter();
  const pending = claims.some((claim) => claim.status === "pending");
  const approved = claims.some((claim) => claim.status === "approved");
  useEffect(() => { if (approved) refreshViewerProfile(); }, [approved]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [pending, router]);
  if (!history && !claims.length) return null;
  return <section aria-label="Your creator claims" className="grid gap-4">
    <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-medium">{history ? "Your claims and ownership reports" : "Creator claims"}</h2>{!history ? <Link href="/profile/claims" className="focus-ring cursor-pointer text-sm underline">View all</Link> : null}</div>
    {claims.length ? claims.map((claim) => <ClaimCard key={claim.id} claim={claim} history={history} />) : <p className="text-sm text-[#666]">You have no claims yet. Open an existing creator profile and choose Claim this profile to get started.</p>}
  </section>;
}
