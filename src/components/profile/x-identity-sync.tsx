"use client";

import { useEffect, useState, useTransition } from "react";
import { synchronizeOwnXAction } from "@/features/creators/claim-actions";
import { refreshViewerProfile } from "./use-viewer-profile";

export function XIdentitySync({ accountKey }: { accountKey: string | null }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof synchronizeOwnXAction>>>();
  const [busy, startTransition] = useTransition();
  useEffect(() => {
    if (!accountKey) return;
    let active = true;
    void synchronizeOwnXAction(false).then((next) => {
      if (!active) return;
      setResult(next);
      if (next.status === "synced") refreshViewerProfile();
    }).catch(() => {
      if (active) setResult({ status: "error", message: "Could not check your X connection. Please try again." });
    });
    return () => { active = false; };
  }, [accountKey]);
  if (!accountKey) return <p className="mt-3 text-xs leading-5 text-[#767676]">Connect X to verify an X identity. Disconnecting X does not remove your creator ownership.</p>;
  return <div className="mt-3 grid gap-2 text-xs leading-5 text-[#767676]">
    <p role={result?.status === "error" || result?.status === "conflict" ? "alert" : "status"}>{result?.message ?? "Checking your connected X identity…"}</p>
    {result?.status === "confirm" || result?.status === "error" ? <button type="button" disabled={busy} className="focus-ring w-fit cursor-pointer rounded-lg border border-[#e6e6e6] px-3 py-2 text-[#262626] disabled:cursor-wait" onClick={() => startTransition(async () => {
      try {
        const next = await synchronizeOwnXAction(result.status === "confirm"); setResult(next);
        if (next.status === "synced") refreshViewerProfile();
      } catch { setResult({ status: "error", message: "Could not update your X connection. Please try again." }); }
    })}>{busy ? "Updating…" : result.status === "confirm" ? "Confirm new X identity" : "Try again"}</button> : null}
  </div>;
}
