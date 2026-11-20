"use client";

import { useEffect, useState } from "react";
import { sponsorButton } from "./button-styles";

export function CopySponsorInvite({ inviteId }: { inviteId: string }) {
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  const [manualUrl, setManualUrl] = useState("");

  useEffect(() => {
    if (copiedAt === null) return;
    const timer = setTimeout(() => setCopiedAt(null), 3_000);
    return () => clearTimeout(timer);
  }, [copiedAt]);

  async function copyInvite() {
    const url = new URL(`/sponsor/dashboard/invite/${inviteId}`, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedAt(Date.now());
      setManualUrl("");
    } catch {
      setCopiedAt(null);
      setManualUrl(url);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button type="button" className={sponsorButton.secondary} onClick={() => void copyInvite()}>
        Copy sponsor invite
      </button>
      <span role="status" className="text-xs text-[#66758c]">
        {copiedAt !== null ? "Copied to clipboard" : manualUrl ? "Copy the link below." : ""}
      </span>
      {manualUrl && (
        <input
          aria-label="Sponsor invite URL"
          className="focus-ring min-w-0 basis-full rounded-md border border-[#e6e6e6] bg-white px-3 py-2 text-sm"
          readOnly
          value={manualUrl}
          onFocus={event => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
