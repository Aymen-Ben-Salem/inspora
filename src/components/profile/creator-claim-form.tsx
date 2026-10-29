"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { submitCreatorClaimAction } from "@/features/creators/claim-actions";
import type { CreatorClaimMethod, ClaimActionState } from "@/features/creators/types";

const buttonClass = "focus-ring cursor-pointer rounded-full bg-[#262626] px-5 py-3 text-sm text-white hover:bg-black disabled:cursor-wait disabled:opacity-50";
const inputClass = "focus-ring w-full rounded-xl border border-black/15 bg-white px-3 py-3 text-sm";

export function CreatorClaimForm({ targetId, targetName, returnPath, connectedXUsername, xMatches, report = false }: {
  targetId: string; targetName: string; returnPath: string; connectedXUsername: string | null; xMatches: boolean; report?: boolean;
}) {
  const { user } = useUser();
  const router = useRouter();
  const [method, setMethod] = useState<CreatorClaimMethod>(report ? "ownership_report" : "x");
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string>();
  const [state, action, pending] = useActionState(submitCreatorClaimAction, { status: "idle" } as ClaimActionState);

  async function connect() {
    if (!user) return;
    setConnecting(true); setConnectionError(undefined);
    try {
      const account = await user.createExternalAccount({ strategy: "oauth_x", redirectUrl: window.location.origin + returnPath });
      const url = account.verification?.externalVerificationRedirectURL;
      if (url) window.location.assign(url.toString());
      else { await user.reload(); router.refresh(); }
    } catch { setConnectionError("X could not be connected. Try again, or choose manual review."); }
    finally { setConnecting(false); }
  }

  if (state.status === "success") return <div className="grid gap-5"><p role="status">{state.message}</p><div className="flex gap-4"><Link className={buttonClass} href="/profile/claims">Your claims</Link><Link className="focus-ring cursor-pointer px-4 py-3 text-sm underline" href="/profile">Your profile</Link></div></div>;

  return <form action={action} className="grid gap-5">
    <input type="hidden" name="targetCreatorId" value={targetId} />
    <input type="hidden" name="method" value={method} />
    <fieldset disabled={pending || connecting} className="grid gap-5">
      {!report ? <div className="flex flex-wrap gap-2" aria-label="Verification method">
        <button type="button" aria-pressed={method === "x"} onClick={() => setMethod("x")} className={method === "x" ? buttonClass : "focus-ring cursor-pointer rounded-full border border-black/15 px-5 py-3 text-sm"}>Verify with X</button>
        <button type="button" aria-pressed={method === "manual"} onClick={() => setMethod("manual")} className={method === "manual" ? buttonClass : "focus-ring cursor-pointer rounded-full border border-black/15 px-5 py-3 text-sm"}>Can’t verify with X?</button>
      </div> : null}
      {method === "x" ? <div className="grid gap-3 rounded-xl bg-[#f7f7f4] p-4 text-sm leading-6">
        {connectedXUsername ? <><p>Connected X account: <strong>@{connectedXUsername}</strong>.</p><p>{xMatches ? "This X account matches the creator profile. An admin will review your request before granting ownership." : "This X account does not match the profile’s recorded X link. Choose manual review if that link is missing or outdated."}</p><Link href="/profile?modal=edit" className="focus-ring cursor-pointer underline">Manage your X connection</Link></> : <><p>Connect the X account associated with {targetName}. Connecting X does not submit your claim.</p><button type="button" disabled={!user || connecting} onClick={() => void connect()} className={buttonClass}>{connecting ? "Connecting…" : "Connect X"}</button></>}
      </div> : <div className="grid gap-4">
        <p className="text-sm leading-6 text-[#666]">{report ? "Tell us why this profile’s ownership needs review. An admin will investigate; submitting a report does not transfer ownership." : "Provide a public portfolio or another source that shows your connection to this creator. An admin will verify the evidence before deciding."}</p>
        <label className="grid gap-2 text-sm">Public evidence URL<input name="evidenceUrl" type="url" required maxLength={2048} placeholder="https://your-portfolio.com" className={inputClass} /></label>
        <label className="grid gap-2 text-sm">Explain your connection<textarea name="evidenceNote" required minLength={20} maxLength={2000} rows={5} className={inputClass} placeholder="Describe which work is yours and where we can verify it. Do not include passwords or private documents." /></label>
      </div>}
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><input name="confirmed" type="checkbox" required className="mt-1.5 cursor-pointer accent-black" />I confirm that I am this creator or authorized to represent them, and that the information I provided is accurate.</label>
      {!report ? <p className="text-sm leading-6 text-[#666]">If approved, this creator profile and your current profile will be merged. Credited work and previous profile addresses are preserved. Profile details you explicitly edited take priority.</p> : null}
      <button disabled={pending || connecting || (method === "x" && (!connectedXUsername || !xMatches))} className={buttonClass}>{pending ? "Submitting…" : report ? "Submit ownership report" : "Submit claim"}</button>
    </fieldset>
    {state.status === "error" || connectionError ? <p role="alert" className="text-sm text-red-700">{connectionError ?? state.message}</p> : null}
  </form>;
}
