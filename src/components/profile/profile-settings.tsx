"use client";

import { useAuth, useClerk, useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";

import {
  getOwnAccountDeletionStatus,
  requestOwnAccountDeletion,
} from "@/features/profiles/actions";

export function ProfileSettings({ onEdit }: { onEdit: () => void }) {
  const { sessionId } = useAuth();
  const clerk = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deletionState, setDeletionState] = useState<"active" | "deleting">("active");
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [requestingDeletion, startDeletion] = useTransition();
  const requestDeletion = useReverification(requestOwnAccountDeletion);
  const rowClass = "flex items-center justify-between gap-4 rounded-[3px] border border-[#e6e6e6] px-4 py-3";
  const buttonClass = "focus-ring shrink-0 cursor-pointer border border-[#e6e6e6] bg-[#fafafa] px-[11px] py-[10px] text-sm leading-[normal] tracking-[0.2px] disabled:cursor-not-allowed";

  useEffect(() => {
    void getOwnAccountDeletionStatus().then((status) => {
      if (status.state === "deleting") {
        setDeletionState("deleting");
        setDeletionError(status.error);
      }
    });
  }, []);

  return (
    <div className="mt-9 grid gap-6 text-sm leading-[normal] tracking-[0.2px]">
      <button type="button" onClick={onEdit} className={`focus-ring w-full cursor-pointer text-left hover:bg-[#fafafa] ${rowClass}`}>
        <span className="grid gap-1">
          <span className="font-medium text-[#262626]">Edit Profile</span>
          <span className="text-xs text-[#767676]">Photo, name, username, website and social links</span>
        </span>
        <Image src="/icons/profile/chevron.svg" alt="" width={12} height={7} className="h-[7px] w-3 shrink-0 -rotate-90" />
      </button>
      <section className={rowClass}>
        <div className="grid gap-1">
          <h3 className="font-medium text-[#262626]">Sign Out</h3>
          <p className="text-xs text-[#767676]">Sign out of your account on this device</p>
        </div>
        <button type="button" disabled={signingOut || !sessionId}
          onClick={async () => {
            if (!sessionId) return;
            setSigningOut(true);
            setError(undefined);
            try {
              await clerk.signOut({ sessionId, redirectUrl: "/" });
            } catch {
              setError("Could not sign out. Try again.");
              setSigningOut(false);
            }
          }} className={buttonClass}>
          {signingOut ? "Signing out…" : "Sign Out"}
        </button>
      </section>
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
      <section className="grid justify-items-start gap-4 rounded-[3px] border border-[#febbbb] bg-[rgba(239,148,148,0.07)] px-4 py-3">
        <div className="grid gap-1">
          <h3 className="font-medium text-[#262626]">Delete account</h3>
          <p className="max-w-[360px] text-xs text-[#767676]">Published work and creator credit remain after deletion. Private account data will be removed. This can’t be undone.</p>
        </div>
        {deletionState === "deleting" ? (
          <div role="status" className="text-xs text-[#767676]">
            {deletionError ? `Deletion needs another retry: ${deletionError}` : "Deletion is pending. Cleanup retries automatically if a provider is unavailable."}
          </div>
        ) : confirmingDeletion ? (
          <div className="grid w-full gap-3">
            <label className="grid gap-2 text-xs text-[#767676]">
              Type DELETE to confirm
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="focus-ring min-h-11 border border-[#e6e6e6] bg-white px-3 text-sm text-[#262626]" />
            </label>
            <div className="flex gap-3">
              <button type="button" disabled={requestingDeletion} onClick={() => { setConfirmingDeletion(false); setConfirmation(""); setDeletionError(null); }} className={buttonClass}>Cancel</button>
              <button type="button" disabled={requestingDeletion || confirmation !== "DELETE"} onClick={() => {
                setDeletionError(null);
                startDeletion(async () => {
                  try {
                    const result = await requestDeletion();
                    if (!result.ok) {
                      setDeletionError(result.message);
                      return;
                    }
                    setDeletionState("deleting");
                    setConfirmingDeletion(false);
                  } catch (requestError) {
                    if (!isReverificationCancelledError(requestError)) {
                      setDeletionError("Account deletion could not be started. Try again.");
                    }
                  }
                });
              }} className={`${buttonClass} border-[#febbbb] text-[#ff0404] disabled:opacity-50`}>
                {requestingDeletion ? "Starting…" : "Permanently delete"}
              </button>
            </div>
            {deletionError ? <p role="alert" className="text-xs text-red-700">{deletionError}</p> : null}
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingDeletion(true)} className={`${buttonClass} border-[#febbbb] text-[#ff0404]`}>
            Delete account
          </button>
        )}
      </section>
    </div>
  );
}
