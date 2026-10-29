"use client";

import Link from "next/link";
import type { Route } from "next";
import { useActionState, useEffect, useState } from "react";
import { submitCreatorClaimAction } from "@/features/creators/claim-actions";
import type { ClaimActionState } from "@/features/creators/types";
import { ConnectClaimX } from "./connect-claim-x";
import { refreshViewerProfile } from "./use-viewer-profile";

const buttonClass = "focus-ring cursor-pointer rounded-full bg-[#262626] px-5 py-3 text-sm text-white hover:bg-black disabled:cursor-wait disabled:opacity-50";
const inputClass = "focus-ring w-full rounded-xl border border-black/15 bg-white px-3 py-3 text-sm";

export function CreatorClaimForm({ targetId, targetName, returnPath, connectedXUsername, xMatches, report = false, signedIn = true, verificationError }: {
  targetId: string; targetName: string; returnPath: string; connectedXUsername: string | null; xMatches: boolean; report?: boolean; signedIn?: boolean; verificationError?: string;
}) {
  const [reporting, setReporting] = useState(report);
  const [state, action, pending] = useActionState(submitCreatorClaimAction, { status: "idle" } as ClaimActionState);
  useEffect(() => { if (state.status === "success" && !reporting) refreshViewerProfile(); }, [state.status, reporting]);

  if (state.status === "success") return <div className="grid gap-5"><p role="status">{state.message}</p><div className="flex flex-wrap gap-4"><Link className={buttonClass} href={reporting ? "/profile/claims" : "/profile"}>{reporting ? "Your reports" : "Manage your profile"}</Link><Link className="focus-ring cursor-pointer px-4 py-3 text-sm underline" href="/">Continue browsing</Link></div></div>;
  if (reporting && !signedIn) return <div className="grid gap-4"><p>Sign in to report an incorrect attribution or ownership problem.</p><Link className={buttonClass} href={("/sign-in?redirect_url=" + encodeURIComponent(returnPath + "?report=1")) as Route}>Sign in to report</Link></div>;

  return <form action={action} className="grid gap-5">
    <input type="hidden" name="targetCreatorId" value={targetId} />
    <input type="hidden" name="method" value={reporting ? "ownership_report" : "x"} />
    <fieldset disabled={pending} className="grid gap-5">
      {reporting ? <div className="grid gap-4">
        <p className="text-sm leading-6 text-[#666]">Tell us what is incorrect about this profile or its X association. An admin will investigate the report. Reports do not grant ownership.</p>
        <label className="grid gap-2 text-sm">Public evidence URL<input name="evidenceUrl" type="url" required maxLength={2048} placeholder="https://your-portfolio.com" className={inputClass} /></label>
        <label className="grid gap-2 text-sm">Explain the problem<textarea name="evidenceNote" required minLength={20} maxLength={2000} rows={5} className={inputClass} placeholder="Describe the incorrect attribution and where we can verify it. Do not include passwords or private documents." /></label>
      </div> : <div className="grid gap-3 rounded-xl bg-[#f7f7f4] p-4 text-sm leading-6">
        {connectedXUsername ? <><p>Connected X account: <strong>@{connectedXUsername}</strong>.</p><p>{verificationError ?? (xMatches ? "Your X account matches this creator. Confirm below to claim the profile immediately." : "Your X account does not match this profile’s recorded identity. You can report an incorrect attribution.")}</p><Link href="/profile?modal=edit" className="focus-ring w-fit cursor-pointer underline">Manage your X connection</Link></> : <><p>Use the X account associated with {targetName} to verify that this is your profile.</p><ConnectClaimX returnPath={returnPath} /></>}
      </div>}
      {reporting || xMatches ? <>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><input name="confirmed" type="checkbox" required className="mt-1.5 cursor-pointer accent-black" />{reporting ? "I confirm that the information in this report is accurate." : "Yes, this is my creator profile and I want to manage it."}</label>
        {!reporting ? <p className="text-sm leading-6 text-[#666]">Your current creator profile will be combined with this one. Credited work and previous profile addresses are preserved. Profile details you explicitly edited take priority.</p> : null}
        <button disabled={pending} className={buttonClass}>{pending ? "Saving…" : reporting ? "Submit report" : "Claim my profile"}</button>
      </> : null}
      {!report ? <button type="button" onClick={() => setReporting(!reporting)} className="focus-ring w-fit cursor-pointer text-sm underline">{reporting ? "Back to X verification" : "This isn’t me / report incorrect attribution"}</button> : null}
      <Link href="/" className="focus-ring w-fit cursor-pointer text-sm underline">Continue browsing</Link>
    </fieldset>
    {state.status === "error" ? <p role="alert" className="text-sm text-red-700">{state.message}</p> : null}
  </form>;
}
