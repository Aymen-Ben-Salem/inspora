"use client";

import { useEffect } from "react";

import { captureAnalyticsEvent } from "@/analytics/client";
import { ANALYTICS_EVENTS } from "@/analytics/events";
import { isPrivateAnalyticsPath } from "@/analytics/privacy";

export type WorkAnalyticsKind = "design" | "logo" | "website";

// PostHog supplies real session metadata. The aggregate deduplicates opens;
// client suppression must never outlive an SDK session or a privacy choice.

export function shouldCaptureWorkOpen({
  pathname,
  workId,
  workKind,
}: {
  pathname: string;
  workId: string;
  workKind: WorkAnalyticsKind;
}) {
  if (!["design", "logo", "website"].includes(workKind)) return false;
  if (!workId.trim() || isPrivateAnalyticsPath(pathname)) return false;
  return true;
}

export function WorkAnalytics({
  workId,
  workKind,
}: {
  workId: string;
  workKind: WorkAnalyticsKind;
}) {
  useEffect(() => {
    if (
      !shouldCaptureWorkOpen({
        pathname: window.location.pathname,
        workId,
        workKind,
      })
    ) {
      return;
    }

    captureAnalyticsEvent(ANALYTICS_EVENTS.workOpened, {
      work_id: workId,
      work_kind: workKind,
    });
  }, [workId, workKind]);

  return null;
}
