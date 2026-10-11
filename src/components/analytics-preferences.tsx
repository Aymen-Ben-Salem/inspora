"use client";

import { useEffect, useState } from "react";
import { isAnalyticsDisabled, setAnalyticsDisabled } from "@/analytics/privacy";

export function AnalyticsPreferences() {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setOptedOut(isAnalyticsDisabled());
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const ready = optedOut !== null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <button
        type="button"
        disabled={!ready}
        aria-pressed={ready ? !optedOut : undefined}
        onClick={() => {
          if (optedOut) {
            setAnalyticsDisabled(false);
            setOptedOut(isAnalyticsDisabled());
          } else {
            setAnalyticsDisabled(true);
            setOptedOut(true);
          }
        }}
        className="focus-ring inline-flex min-h-11 items-center justify-center border border-black/15 px-4 py-2.5 text-[14px] leading-5 text-[#262626] transition-colors hover:bg-[#f5f5f5] disabled:cursor-wait disabled:text-[#999]"
      >
        {!ready
          ? "Checking analytics preference"
          : optedOut
            ? "Enable analytics"
            : "Disable analytics"}
      </button>
      <p aria-live="polite" className="text-[14px] leading-6 text-[#777]">
        {!ready
          ? ""
          : optedOut
            ? "Analytics is disabled on this browser."
            : "Anonymous analytics is enabled on this browser."}
      </p>
    </div>
  );
}
