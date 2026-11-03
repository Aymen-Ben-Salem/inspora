"use client";
import { useUser } from "@clerk/nextjs";
import { useState, useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

export function SponsorSecurityRecommendation() {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user || user.totpEnabled) return null;
  return <SecurityNotice key={user.id} owner={user.id} />;
}
function SecurityNotice({ owner }: { owner: string }) {
  const key = "inspora:sponsor-security-dismissed:" + owner;
  const [dismissed, setDismissed] = useState(false);
  const stored = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) === "true"; } catch { return false; }
  }, () => true);
  if (stored || dismissed) return null;
  return <aside role="status" aria-live="polite" aria-label="Account security recommendation"
    className="fixed inset-x-4 bottom-4 z-40 rounded-lg border border-[#e6e6e6] bg-white p-5 text-[#262626] shadow-lg sm:left-auto sm:w-[360px]">
    <div className="flex items-start justify-between gap-4">
      <p className="text-sm font-medium">Add another layer of protection</p>
      <button type="button" aria-label="Dismiss security recommendation" className="focus-ring -mr-2 -mt-2 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-xl text-[#767676]"
        onClick={() => { setDismissed(true); try { localStorage.setItem(key, "true"); } catch {} }}>×</button>
    </div>
    <p className="mt-2 text-sm leading-6 text-[#767676]">We recommend optional two-factor authentication to help protect your campaign and account.</p>
    <a href="/sponsor/security" className="focus-ring mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Open security settings</a>
  </aside>;
}
