"use client";

import { useEffect, useState } from "react";
import type { CreatorViewsResult } from "@/analytics/creator-views";

function parseViews(value: unknown): CreatorViewsResult {
  if (!value || typeof value !== "object") throw new Error("Invalid views response.");
  const result = value as Partial<{ status: string; count: number; asOf: string; eligibilityKey: string; checkedAt: string }>;
  if (result.checkedAt !== undefined && (typeof result.checkedAt !== "string" || !Number.isFinite(Date.parse(result.checkedAt)))) {
    throw new Error("Invalid views response.");
  }
  if (result.status === "unavailable") return { status: "unavailable", checkedAt: result.checkedAt };
  if (
    (result.status !== "available" && result.status !== "stale") ||
    typeof result.count !== "number" || !Number.isSafeInteger(result.count) || result.count < 0 ||
    typeof result.asOf !== "string" || !Number.isFinite(Date.parse(result.asOf)) ||
    (result.eligibilityKey !== undefined && typeof result.eligibilityKey !== "string")
  ) throw new Error("Invalid views response.");
  return { status: result.status, count: result.count, asOf: result.asOf,
    eligibilityKey: result.eligibilityKey, checkedAt: result.checkedAt };
}

function reconcileViews(current: CreatorViewsResult, next: CreatorViewsResult): CreatorViewsResult {
  // Timestamp-less RSC failures cannot invalidate a newer live sample or erase
  // the watermark from a definitive API failure.
  if (next.status === "unavailable" && !next.checkedAt) {
    return current.status === "unavailable" ? current : { ...current, status: "stale" };
  }
  const previousCheck = current.checkedAt ?? (current.status === "unavailable" ? undefined : current.asOf);
  const nextCheck = next.checkedAt ?? (next.status === "unavailable" ? undefined : next.asOf);
  if (previousCheck && nextCheck && Date.parse(nextCheck) < Date.parse(previousCheck)) return current;
  if (next.status === "unavailable" || current.status === "unavailable") return next;
  // A changed, freshly checked work scope can legitimately reduce the total,
  // even if that scope's cached provider sample was measured earlier.
  if (next.eligibilityKey === current.eligibilityKey && Date.parse(next.asOf) < Date.parse(current.asOf)) {
    return { ...current, checkedAt: next.checkedAt,
      status: next.status === "stale" ? "stale" : current.status };
  }
  return next;
}

export function ProfileViews({ creatorId, initialViews }: {
  creatorId: string;
  initialViews: CreatorViewsResult;
}) {
  const [state, setState] = useState({ initialViews, views: initialViews });
  let views = state.views;
  if (state.initialViews !== initialViews) {
    views = reconcileViews(state.views, initialViews);
    setState({ initialViews, views });
  }

  useEffect(() => {
    const controller = new AbortController();
    let refreshing = false;
    async function refresh() {
      if (refreshing || controller.signal.aborted || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const response = await fetch(`/api/creators/${creatorId}/views`, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        const next = parseViews(await response.json());
        if (!response.ok && !([404, 503].includes(response.status) && next.status === "unavailable")) {
          throw new Error("Views refresh failed.");
        }
        if (!controller.signal.aborted) setState((current) => ({
          ...current, views: reconcileViews(current.views, next),
        }));
      } catch {
        if (!controller.signal.aborted) setState((current) => ({ ...current,
          views: current.views.status === "unavailable" ? current.views : { ...current.views, status: "stale" },
        }));
      } finally {
        refreshing = false;
      }
    }
    const resume = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(resume, 60000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [creatorId]);

  const definition = "Published work opens are counted once per analytics session, not per person. Privacy choices and historical coverage can reduce this total.";
  const title = views.status === "unavailable"
    ? "Views are temporarily unavailable. Counts refresh automatically."
    : `${definition} ${views.status === "stale" ? "Last confirmed" : "Updated"}: ${new Date(views.asOf).toUTCString()}. Counts refresh automatically; recent opens can take a few minutes to appear.`;
  return <>
    <dd aria-label={views.status === "unavailable" ? "Views unavailable" : `${views.count} published-work views`}
      title={title} className="text-[#262626]">
      {views.status === "unavailable" ? "—" : views.count.toLocaleString("en")}
    </dd>
    <dt className="text-[#767676]">Views</dt>
    {views.status === "stale" ? <span className="text-xs text-[#767676]" title={title}>Delayed</span> : null}
  </>;
}
