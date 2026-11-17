"use client";

import { useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { useState, useTransition } from "react";
import { requestOwnAccountDeletion } from "@/features/profiles/actions";
import { sponsorButton } from "@/components/sponsorship/button-styles";

export function PersonalAccountDeletion({ credits, purchasedCredits }: { credits: number; purchasedCredits: number }) {
  const requestDeletion = useReverification(requestOwnAccountDeletion);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [pending, start] = useTransition();

  if (queued) return <p role="status">Account deletion is in progress. Your Pro access and automatic top-ups have stopped. Any unfinished cleanup will be retried.</p>;

  return (
    <div className="space-y-3">
      <p>Permanently deleting your Inspora account cancels Pro and automatic top-ups and removes your remaining credits. You currently have {credits.toLocaleString("en")} credits, including {purchasedCredits.toLocaleString("en")} purchased credits. There is no automatic refund except where the law requires one. Published work and creator credit remain.</p>
      <p>To keep your account and purchased credits, cancel your Pro renewal instead.</p>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        if (confirmation !== "DELETE" || pending) return;
        setError(null);
        start(async () => {
          try {
            const result = await requestDeletion({ acknowledgeProCreditLoss: true });
            if (!result.ok) { setError(result.message); return; }
            if (result.value.state === "completed") window.location.assign("/");
            else setQueued(true);
          } catch (cause) {
            if (!isReverificationCancelledError(cause)) setError("The deletion result could not be confirmed. Refresh to check its status before trying again.");
          }
        });
      }}>
        <label className="block">Type DELETE to confirm
          <input className="mt-2 block rounded-md border border-[#e6e6e6] px-3 py-2" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        </label>
        <button className={`${sponsorButton.secondary} text-[#a11]`} disabled={pending || confirmation !== "DELETE"}>{pending ? "Starting deletion…" : "Permanently delete account"}</button>
      </form>
      {error ? <p role="alert" className="text-[#a11]">{error}</p> : null}
    </div>
  );
}
