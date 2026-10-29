"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { reviewCreatorClaimAction } from "@/features/admin/creator-actions";
import type { ClaimActionState, CreatorClaimMethod } from "@/features/creators/types";

export function CreatorClaimReviewForm({ claimId, version, method }: { claimId: string; version: string; method: CreatorClaimMethod }) {
  const router = useRouter();
  const [decision, setDecision] = useState(method === "ownership_report" ? "resolve" : "reject");
  const [state, action, busy] = useActionState((_state: ClaimActionState, data: FormData) => reviewCreatorClaimAction(data), { status: "idle" });
  const requiresReason = method !== "x" || decision !== "approve";
  return <form action={action} className="grid gap-4 rounded-2xl border border-black/10 bg-white p-5">
    <input name="claimId" type="hidden" value={claimId} /><input name="version" type="hidden" value={version} />
    <fieldset disabled={busy || state.status === "success"} className="grid gap-4">
      <label className="grid gap-2 text-sm">Decision<select name="decision" value={decision} onChange={(event) => setDecision(event.target.value)} className="focus-ring cursor-pointer rounded-xl border border-black/15 p-3">
        {method === "ownership_report" ? <option value="resolve">Mark report resolved</option> : null}<option value="reject">Close with reason</option>
      </select></label>
      <label className="grid gap-2 text-sm">{requiresReason ? "Review reason / evidence verified" : "Review note (optional)"}<textarea name="reason" required={requiresReason} minLength={method === "manual" && decision === "approve" ? 20 : undefined} maxLength={2000} rows={4} className="focus-ring rounded-xl border border-black/15 p-3" placeholder="Explain your decision. This response is visible to the creator." /></label>
      {decision === "approve" ? <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" name="evidenceConfirmed" required className="mt-1.5 cursor-pointer accent-black" />I verified the ownership evidence and reviewed the resulting profile, work, and previous profile addresses.</label> : null}
      <button className="focus-ring cursor-pointer rounded-full bg-[#262626] px-5 py-3 text-sm text-white disabled:cursor-wait disabled:opacity-50">{busy ? "Saving review…" : "Save review"}</button>
    </fieldset>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className="text-sm leading-6">{state.message}</p> : null}
    {state.status === "error" ? <button type="button" onClick={() => router.refresh()} className="focus-ring w-fit cursor-pointer text-sm underline">Reload current review</button> : null}
  </form>;
}
