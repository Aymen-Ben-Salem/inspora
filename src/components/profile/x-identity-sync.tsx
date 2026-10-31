"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { synchronizeOwnXAction } from "@/features/creators/claim-actions";
import { refreshViewerProfile } from "./use-viewer-profile";

export function XIdentitySync({ accountKey, username }: { accountKey: string | null; username?: string | null }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof synchronizeOwnXAction>>>();
  const [busy, startTransition] = useTransition();
  const matchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accountKey) return;
    let active = true;
    void synchronizeOwnXAction(false).then(next => {
      if (!active) return;
      setResult(next);
      if (next.status === "synced") refreshViewerProfile();
    }).catch(() => { if (active) setResult({ status: "error", message: "Could not check your X connection. Please try again." }); });
    return () => { active = false; };
  }, [accountKey]);
  useEffect(() => {
    if (result?.status === "conflict") matchRef.current?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  }, [result?.status]);
  if (!accountKey || result?.status === "synced" || result?.status === "disconnected") return null;
  if (result?.status === "conflict") return <div ref={matchRef} className="my-3 grid gap-4 rounded-[3px] border border-[#d9d9d9] bg-[#f7f7f7] p-4 sm:mx-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div role="status"><p className="text-sm font-medium text-[#262626]">We found a linked creator profile</p><p className="mt-1 text-xs leading-5 text-[#767676]">A profile on Inspora is linked to {username ? `@${username}` : "your X account"}.</p></div>
    <Link href="/profile/claim-match?returnTo=%2Fprofile%3Fmodal%3Dedit" className="focus-ring inline-flex min-h-11 w-fit cursor-pointer items-center justify-center gap-3 rounded-[3px] bg-[#262626] px-4 py-2 text-sm text-white transition-colors hover:bg-black">Review profile<ArrowRight size={15} aria-hidden="true" /></Link>
  </div>;
  return <div className="px-0 py-3 sm:px-4">
    <p role={result?.status === "error" ? "alert" : "status"} className="text-xs leading-5 text-[#767676]">{result?.message ?? "Checking your X connection…"}</p>
    {result?.status === "confirm" || result?.status === "error" ? <button type="button" disabled={busy} className="focus-ring mt-3 min-h-10 cursor-pointer rounded-[3px] border border-[#e6e6e6] px-3 py-2 text-sm hover:bg-[#fafafa] disabled:cursor-wait" onClick={() => startTransition(async () => {
      try {
        const next = await synchronizeOwnXAction(result.status === "confirm"); setResult(next);
        if (next.status === "synced") refreshViewerProfile();
      } catch { setResult({ status: "error", message: "Could not update your X connection. Please try again." }); }
    })}>{busy ? "Updating…" : result.status === "confirm" ? "Confirm new X identity" : "Try again"}</button> : null}
  </div>;
}
