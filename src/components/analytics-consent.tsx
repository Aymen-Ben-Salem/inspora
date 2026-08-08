"use client";

import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

import { isPrivateAnalyticsPath } from "@/analytics/privacy";

type ConsentStatus = "granted" | "denied" | "pending";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export function AnalyticsConsent() {
  const pathname = usePathname();
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const analyticsAvailable = Boolean(projectToken && apiHost);
  const privateRoute = isPrivateAnalyticsPath(pathname);

  useEffect(() => {
    if (!analyticsAvailable || privateRoute) return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const currentStatus = posthog.get_explicit_consent_status();
      setStatus(currentStatus);
      setPreferencesOpen(currentStatus === "pending");
    });

    return () => {
      active = false;
    };
  }, [analyticsAvailable, privateRoute]);

  if (!analyticsAvailable || privateRoute || status === null) return null;

  function allowAnalytics() {
    posthog.opt_in_capturing({ captureEventName: false });
    setStatus("granted");
    setPreferencesOpen(false);
  }

  function useLimitedAnalytics() {
    posthog.opt_out_capturing();
    setStatus("denied");
    setPreferencesOpen(false);
  }

  if (!preferencesOpen) {
    return (
      <button
        type="button"
        onClick={() => setPreferencesOpen(true)}
        className="focus-ring fixed bottom-3 right-3 z-[70] rounded-full border border-black/10 bg-white/90 px-3 py-2 text-[11px] tracking-[0.01em] text-[#777] shadow-[0_4px_18px_rgba(0,0,0,0.08)] backdrop-blur-md transition-[color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-black sm:bottom-4 sm:right-4"
      >
        Privacy
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="analytics-consent-title"
      className="fixed bottom-3 left-1/2 z-[70] w-[calc(100%-24px)] max-w-[660px] -translate-x-1/2 rounded-2xl border border-black/10 bg-white/95 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.16)] backdrop-blur-xl sm:bottom-5 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <h2
              id="analytics-consent-title"
              className="text-[15px] font-medium tracking-[-0.02em] text-black"
            >
              Analytics preferences
            </h2>
            {status !== "pending" ? (
              <button
                type="button"
                onClick={() => setPreferencesOpen(false)}
                className="focus-ring -mr-1 -mt-1 rounded-full px-2 py-1 text-xs text-[#777] transition-colors hover:bg-[#f0f0ed] hover:text-black"
                aria-label="Close analytics preferences"
              >
                Close
              </button>
            ) : null}
          </div>
          <p className="mt-2 max-w-[470px] text-[12px] leading-[1.5] text-[#666] sm:text-[13px]">
            Allowing analytics helps us measure repeat visits, countries, performance,
            and anonymous click and scroll heatmaps using a first-party cookie. Limited
            analytics uses no analytics cookies and provides anonymous daily counts. We
            never use ads or session recordings.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={useLimitedAnalytics}
            aria-pressed={status === "denied"}
            className={`focus-ring inline-flex h-9 items-center rounded-full border px-3.5 text-xs transition-colors ${
              status === "denied"
                ? "border-black bg-black text-white"
                : "border-black/10 bg-white text-[#555] hover:bg-[#f1f1ee] hover:text-black"
            }`}
          >
            Use limited
          </button>
          <button
            type="button"
            onClick={allowAnalytics}
            aria-pressed={status === "granted"}
            className={`focus-ring inline-flex h-9 items-center rounded-full px-3.5 text-xs transition-colors ${
              status === "granted"
                ? "bg-black text-white"
                : "bg-[#262626] text-white hover:bg-black"
            }`}
          >
            Allow analytics
          </button>
        </div>
      </div>
    </section>
  );
}
