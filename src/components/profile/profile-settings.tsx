"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import Image from "next/image";
import { useState } from "react";

export function ProfileSettings({ onEdit }: { onEdit: () => void }) {
  const { sessionId } = useAuth();
  const clerk = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string>();
  const rowClass = "flex items-center justify-between gap-4 rounded-[3px] border border-[#e6e6e6] px-4 py-3";
  const buttonClass = "focus-ring shrink-0 cursor-pointer border border-[#e6e6e6] bg-[#fafafa] px-[11px] py-[10px] text-sm leading-[normal] tracking-[0.2px] disabled:cursor-not-allowed";

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
        <button type="button" disabled title="Account deletion is not available yet" className={`${buttonClass} border-[#febbbb] text-[#ff0404]`}>
          Delete account
        </button>
      </section>
    </div>
  );
}
