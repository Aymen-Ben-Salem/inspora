"use client";

import posthog from "posthog-js";
import { useEffect, useState } from "react";

const analyticsConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
    process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

export function AnalyticsPreferences() {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!analyticsConfigured) return;
      setOptedOut(posthog.has_opted_out_capturing());
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  if (!analyticsConfigured) {
    return (
      <p className="text-[14px] leading-6 text-[#777]">
        Analytics is not active in this environment.
      </p>
    );
  }

  const ready = optedOut !== null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <button
        type="button"
        disabled={!ready}
        aria-pressed={ready ? !optedOut : undefined}
        onClick={() => {
          if (optedOut) {
            posthog.opt_in_capturing({ captureEventName: false });
            setOptedOut(false);
          } else {
            posthog.opt_out_capturing();
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
