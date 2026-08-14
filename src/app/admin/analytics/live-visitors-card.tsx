"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LiveVisitorAnalytics } from "@/analytics/posthog-data";

const REFRESH_INTERVAL_MS = 15_000;

function isLiveVisitorAnalytics(value: unknown): value is LiveVisitorAnalytics {
  if (!value || typeof value !== "object") return false;

  const analytics = value as Partial<LiveVisitorAnalytics>;
  return (
    typeof analytics.count === "number" &&
    Number.isFinite(analytics.count) &&
    typeof analytics.generatedAt === "string" &&
    typeof analytics.windowMinutes === "number"
  );
}

export function LiveVisitorsCard({
  initialAnalytics,
}: {
  initialAnalytics: LiveVisitorAnalytics | null;
}) {
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [unavailable, setUnavailable] = useState(initialAnalytics === null);
  const requestInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (document.hidden || requestInFlight.current) return;

    requestInFlight.current = true;

    try {
      const response = await fetch("/admin/analytics/live", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) throw new Error("Live analytics request failed.");

      const nextAnalytics: unknown = await response.json();
      if (!isLiveVisitorAnalytics(nextAnalytics)) {
        throw new Error("Live analytics response was invalid.");
      }

      setAnalytics(nextAnalytics);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      requestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) void refresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return (
    <section className="flex min-h-36 flex-wrap items-center justify-between gap-6 bg-[#171717] px-5 py-6 text-white sm:px-7 sm:py-7">
      <div className="flex items-center gap-3">
        <span className="relative flex size-3" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-35" />
          <span className="relative inline-flex size-3 rounded-full bg-emerald-600" />
        </span>
        <div>
          <p className="text-[11px] font-medium text-white/55">Live audience</p>
          <p className="mt-1 text-sm text-white/45">
            Active in the last {analytics?.windowMinutes ?? 2} minutes
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className="text-5xl font-medium tracking-[-0.065em] tabular-nums"
          aria-live="polite"
          title={analytics ? `${analytics.count} active visitors` : undefined}
        >
          {analytics?.count ?? "—"}
        </p>
        <p className="mt-1 text-[11px] text-white/45">
          {unavailable ? "Refresh temporarily unavailable" : "Updates every 15 seconds"}
        </p>
      </div>
    </section>
  );
}
