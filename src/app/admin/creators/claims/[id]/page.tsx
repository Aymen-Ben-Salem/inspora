import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CreatorClaimReviewForm } from "@/components/admin/creator-claim-review-form";
import { getClaimReviewDetails } from "@/features/creators/identity/claim-review";
import type { CreatorClaimMethod } from "@/features/creators/types";

export default async function ClaimReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getClaimReviewDetails(id);
  if (!detail) notFound();
  const { claim, source, target, merged } = detail;
  const report = claim.method === "ownership_report";
  return <div className="grid max-w-5xl gap-6">
    <Link href="/admin/creators" className="focus-ring w-fit cursor-pointer text-sm underline">Back to creators</Link>
    <div><p className="text-xs uppercase tracking-widest text-[#777]">{report ? "Ownership report" : "Creator ownership claim"} · {claim.status}</p><h1 className="mt-2 text-3xl font-medium">Review {target.name}</h1><p className="mt-2 break-all text-sm text-[#666]">Requester: {claim.requesterUserId} · Submitted {claim.createdAt.toISOString().slice(0, 10)}</p></div>
    <div className="grid gap-4 md:grid-cols-2">{[{ row: source, label: "Requester's current creator", counts: detail.sourceCounts }, { row: target, label: "Requested creator profile", counts: detail.targetCounts }].map(({ row, label, counts }) => <section key={label} className="grid gap-3 rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="text-sm font-medium text-[#666]">{label}</h2>{row ? <><p className="text-xl font-medium">{row.name}</p><p className="text-sm">@{row.username ?? "No public username"}</p><p className="text-sm">{counts?.works ?? 0} credited works · {counts?.submissions ?? 0} submissions</p><p className="text-sm">{row.ownerUserId ? "Has an owner" : "Unowned"}{row.xProviderId ? " · Has a verified X identity" : ""}</p>{row.username ? <Link className="focus-ring cursor-pointer text-sm underline" target="_blank" href={("/creators/" + row.username) as Route}>Open profile and work</Link> : null}{row.xProfileUrl ? <a className="focus-ring cursor-pointer break-all text-sm underline" href={row.xProfileUrl} target="_blank" rel="noopener noreferrer">{row.xProfileUrl}</a> : null}</> : <p className="text-sm">The requester no longer has a creator profile. Approval is unavailable.</p>}
    </section>)}</div>
    <section className="grid gap-3 rounded-2xl border border-black/10 bg-white p-5"><h2 className="text-lg font-medium">Ownership evidence</h2>
      {claim.method === "x" ? <><a className="focus-ring cursor-pointer text-sm underline" target="_blank" rel="noopener noreferrer" href={"https://x.com/" + claim.verifiedXUsername}>Verified X account at submission: @{claim.verifiedXUsername}</a><p className="text-sm text-[#666]">The connected X account will be verified again before approval. Review the creator&apos;s work as well as the identity match.</p></> : <><a href={claim.evidenceUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="focus-ring cursor-pointer break-all text-sm underline">{claim.evidenceUrl}</a><p className="whitespace-pre-wrap text-sm leading-6">{claim.evidenceNote}</p><p className="text-sm text-[#666]">Verify the evidence against an established public source or independently confirmed contact. A submitted URL alone is not proof of ownership.</p></>}
      {claim.attentionReason ? <p className="text-sm text-amber-800">Needs attention: {claim.attentionReason}</p> : null}
    </section>
    {!report && merged ? <section className="grid gap-3 rounded-2xl border border-black/10 bg-white p-5"><h2 className="text-lg font-medium">Result after approval</h2><dl className="grid gap-2 text-sm"><div><dt className="text-[#777]">Name</dt><dd>{merged.name}</dd></div><div><dt className="text-[#777]">Public username</dt><dd>@{merged.username}</dd></div><div><dt className="text-[#777]">Website</dt><dd className="break-all">{merged.url ?? "None"}</dd></div><div><dt className="text-[#777]">Profile photo</dt><dd className="break-all">{merged.avatarUrl}</dd></div><div><dt className="text-[#777]">X identity</dt><dd>{claim.method === "x" ? "The freshly verified X account from this claim." : source?.xProviderId ? "The requester's existing X identity, verified again before merging." : "The target's public X link; no verified X identity is granted."}</dd></div></dl><p className="text-sm leading-6 text-[#666]">The existing creator survives. The requester&apos;s credited work and submissions move to it. Saved work, publication state, and previous profile addresses are retained. Owner-edited profile details take priority.</p></section> : report ? <p className="rounded-xl bg-[#f5f5f2] p-4 text-sm">Resolving this report records your response. It does not transfer creator ownership. Any disputed ownership transfer requires a separate investigation.</p> : null}
    {claim.status === "pending" ? <CreatorClaimReviewForm key={detail.version} claimId={claim.id} version={detail.version} method={claim.method as CreatorClaimMethod} /> : <p className="rounded-xl bg-white p-5 text-sm">{claim.reviewReason ?? "This request is no longer pending."}</p>}
  </div>;
}
