"use client";

import { useUser } from "@clerk/nextjs";
import { useSignIn } from "@clerk/nextjs/legacy";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConnectClaimX({ returnPath }: { returnPath: string }) {
  const { user, isLoaded } = useUser();
  const { signIn } = useSignIn();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function connect() {
    setBusy(true); setError(undefined);
    try {
      if (user) {
        const account = await user.createExternalAccount({ strategy: "oauth_x", redirectUrl: window.location.origin + returnPath });
        const url = account.verification?.externalVerificationRedirectURL;
        if (url) window.location.assign(url.toString());
        else { await user.reload(); router.refresh(); }
      } else if (signIn) {
        await signIn.authenticateWithRedirect({ strategy: "oauth_x", redirectUrl: "/profile/x-callback?returnTo=" + encodeURIComponent(returnPath), redirectUrlComplete: returnPath });
      }
    } catch {
      setError("X could not be connected. If this X account belongs to another Inspora login, sign out and sign in with that X account.");
    } finally { setBusy(false); }
  }
  return <div className="grid gap-3">
    <button type="button" disabled={!isLoaded || busy || (!user && !signIn)} onClick={() => void connect()} className="focus-ring w-fit cursor-pointer rounded-full bg-[#262626] px-5 py-3 text-sm text-white hover:bg-black disabled:cursor-wait disabled:opacity-50">{busy ? "Connecting…" : user ? "Connect X" : "Continue with X"}</button>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </div>;
}
