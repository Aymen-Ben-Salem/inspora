"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LiveVisitorAnalytics } from "@/analytics/posthog-data";

const REFRESH_INTERVAL_MS = 30_000;

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
    <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-black/10 bg-white px-5 py-5 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="relative flex size-3" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-35" />
          <span className="relative inline-flex size-3 rounded-full bg-emerald-600" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-[#777]">Live now</p>
          <p className="mt-1 text-sm text-[#777]">
            Active in the last {analytics?.windowMinutes ?? 5} minutes
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className="text-4xl font-medium tracking-[-0.05em] tabular-nums"
          aria-live="polite"
          title={analytics ? `${analytics.count} active visitors` : undefined}
        >
          {analytics?.count ?? "—"}
        </p>
        <p className="mt-1 text-[11px] text-[#999]">
          {unavailable ? "Refresh temporarily unavailable" : "Updates every 30 seconds"}
        </p>
      </div>
    </section>
  );
}
