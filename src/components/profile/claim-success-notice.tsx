"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

const storageKey = "inspora:claimed-profile";
export function rememberClaimSuccess(creatorId: string) {
  try { sessionStorage.setItem(storageKey, JSON.stringify({ creatorId, at: Date.now() })); } catch { /* The profile still opens when storage is unavailable. */ }
}
export function consumeClaimSuccess(creatorId: string) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return false;
    sessionStorage.removeItem(storageKey);
    const receipt = JSON.parse(raw);
    return receipt.creatorId === creatorId && typeof receipt.at === "number" && Date.now() >= receipt.at && Date.now() - receipt.at < 60000;
  } catch { return false; }
}
export function ClaimSuccessNotice({ creatorId, workCount }: { creatorId: string; workCount: number }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hovered = useRef(false);
  const focused = useRef(false);
  function pause() { clearTimeout(timer.current); }
  function resume() {
    pause();
    if (!hovered.current && !focused.current) timer.current = setTimeout(() => setVisible(false), 8000);
  }
  useEffect(() => {
    // Consume after mounting, so refresh/back navigation never repeats success.
    const start = setTimeout(() => {
      if (!consumeClaimSuccess(creatorId)) return;
      setVisible(true);
      timer.current = setTimeout(() => setVisible(false), 8000);
    }, 0);
    return () => { clearTimeout(start); clearTimeout(timer.current); };
  }, [creatorId]);
  if (!visible) return null;
  return <div onMouseEnter={() => { hovered.current = true; pause(); }} onMouseLeave={() => { hovered.current = false; resume(); }}
    onFocus={() => { focused.current = true; pause(); }} onBlur={() => { focused.current = false; resume(); }}
    className="fixed bottom-24 left-1/2 z-40 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-[3px] border border-[#e6e6e6] bg-white py-2 pl-4 pr-1 text-sm shadow-[0_4px_18px_rgba(38,38,38,0.08)]">
    <Check size={17} className="shrink-0" aria-hidden="true" />
    <p role="status">Profile claimed.{workCount > 1 ? ` Your ${workCount} works are now together.` : " You can now manage it."}</p>
    <button type="button" aria-label="Dismiss success message" onClick={() => { pause(); setVisible(false); }} className="focus-ring grid size-10 shrink-0 cursor-pointer place-items-center text-[#767676] hover:text-black"><X size={16} aria-hidden="true" /></button>
  </div>;
}
