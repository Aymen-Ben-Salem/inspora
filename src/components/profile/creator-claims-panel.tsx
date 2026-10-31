"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { changeOwnClaimAction } from "@/features/creators/claim-actions";
import type { ClaimActionState, OwnCreatorClaim } from "@/features/creators/types";

export function claimNeedsAttention(claim: OwnCreatorClaim) {
  return !claim.dismissedAt && claim.status === "pending" && Boolean(claim.attentionReason || claim.method !== "ownership_report");
}

export function CreatorClaimAttention({ claims }: { claims: OwnCreatorClaim[] }) {
  const count = claims.filter(claimNeedsAttention).length;
  if (!count) return null;
  return <div className="archive-frame mb-5">
    <Link href="/profile/claims" className="focus-ring flex min-h-11 w-fit cursor-pointer items-center gap-3 rounded-[3px] border border-[#e6e6e6] bg-[#fafafa] px-4 py-3 text-sm hover:border-[#bcbcbc]">
      <span>{count === 1 ? "A profile request needs your attention" : `${count} profile requests need your attention`}</span><ArrowRight size={15} aria-hidden="true" />
    </Link>
  </div>;
}

function ClaimRow({ claim }: { claim: OwnCreatorClaim }) {
  const [state, action, busy] = useActionState(changeOwnClaimAction, { status: "idle" } as ClaimActionState);
  const href = claim.targetUsername ? "/creators/" + claim.targetUsername : null;
  const labels = { pending: claim.method === "ownership_report" ? "Report sent" : "Action needed", approved: "Claimed", rejected: "Closed", withdrawn: "Withdrawn", resolved: "Resolved" };
  const attention = claimNeedsAttention(claim);
  const linkClass = "focus-ring cursor-pointer py-2 text-sm underline underline-offset-4 hover:text-black";
  return <details className="group border-b border-[#e6e6e6] last:border-b-0">
    <summary className="focus-ring flex min-h-20 cursor-pointer list-none items-center gap-3 py-4 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{claim.targetName}</p><p className="mt-1 text-xs text-[#767676]">{claim.method === "ownership_report" ? "Ownership report" : "Profile claim"} · {new Date(claim.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</p></div>
      <span className={`shrink-0 text-xs ${attention ? "font-medium text-[#262626]" : "text-[#767676]"}`}>{attention ? "Action needed" : labels[claim.status]}</span>
      <ChevronDown size={15} aria-hidden="true" className="shrink-0 text-[#767676] transition-transform group-open:rotate-180" />
    </summary>
    <div className="grid gap-3 pb-5 text-sm leading-6 text-[#767676]">
      {claim.status === "approved" ? <p>Claimed through your connected X account. You now manage this profile and its work.</p>
        : claim.attentionReason || claim.reviewReason ? <p className="whitespace-pre-wrap">{claim.attentionReason ?? claim.reviewReason}</p>
        : claim.status === "pending" ? <p>We’ll review your report. Any updates will appear here.</p> : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {href ? <Link href={href as Route} className={linkClass}>View profile</Link> : null}
        {claim.status === "pending" && claim.method !== "ownership_report" && href ? <Link href={(href + "/claim") as Route} className={linkClass}>Claim with X</Link> : null}
        {(claim.status === "rejected" || claim.status === "withdrawn") && href ? <Link href={(href + "/claim?report=1") as Route} className={linkClass}>Send a new report</Link> : null}
        {claim.status === "pending" ? <form action={action}>
          <input type="hidden" name="claimId" value={claim.id} /><input type="hidden" name="operation" value="withdraw" />
          <button disabled={busy} className="focus-ring min-h-10 cursor-pointer rounded-[3px] border border-[#e6e6e6] px-3 py-2 text-sm hover:bg-[#fafafa] disabled:cursor-wait disabled:opacity-50">{busy ? "Withdrawing…" : "Withdraw request"}</button>
        </form> : null}
      </div>
      {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </div>
  </details>;
}

export function CreatorClaimsPanel({ claims }: { claims: OwnCreatorClaim[]; history?: boolean }) {
  const router = useRouter();
  const pending = claims.some(claim => claim.status === "pending");
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [pending, router]);
  return <section aria-label="Claims and reports" className="border-y border-[#e6e6e6]">
    {claims.length ? claims.map(claim => <ClaimRow key={claim.id} claim={claim} />) : <p className="py-8 text-sm leading-6 text-[#767676]">No claims or reports yet. When you claim a profile or report an attribution problem, it will appear here.</p>}
  </section>;
}
