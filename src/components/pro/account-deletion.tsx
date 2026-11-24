"use client";

import { useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { useState, useTransition } from "react";
import { requestOwnAccountDeletion } from "@/features/profiles/actions";
import { sponsorButton } from "@/components/sponsorship/button-styles";

export function PersonalAccountDeletion({ subscribed }: { subscribed: boolean }) {
  const requestDeletion = useReverification(requestOwnAccountDeletion);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [pending, start] = useTransition();

  if (queued) return <p role="status">Account deletion is in progress. Your Pro access has stopped. Any unfinished cleanup will be retried.</p>;

  return (
    <div className="space-y-3">
      <p>Permanently deleting your Inspora account cancels Pro immediately. There is no automatic refund for the rest of the paid month except where the law requires one. Published work and creator credit remain.</p>
      {subscribed ? <p>To keep Pro until the end of the paid month, cancel your renewal instead.</p> : null}
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        if (confirmation !== "DELETE" || pending) return;
        setError(null);
        start(async () => {
          try {
            const result = await requestDeletion({ acknowledgeProCancellation: subscribed });
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
