"use client";
import { useSyncExternalStore } from "react";
import { PublicSignIn } from "@/components/auth/public-sign-in";
import { pendingDraftEmail } from "./local-campaign-draft";
const subscribe = () => () => {};
export function SponsorSignIn() {
  const email = useSyncExternalStore(subscribe, pendingDraftEmail, () => undefined);
  if (email === undefined) return <p role="status">Loading verification…</p>;
  return (
    <div className="w-full max-w-[429px] [&_button:enabled]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
      <PublicSignIn basePath="/sponsor/access" redirectUrl="/sponsor/verify" initialEmail={email} />
    </div>
  );
}
