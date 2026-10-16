"use client";

import { useEffect } from "react";

import { captureAnalyticsEvent } from "@/analytics/client";
import { ANALYTICS_EVENTS } from "@/analytics/events";
import { isPrivateAnalyticsPath } from "@/analytics/privacy";
import { getWorkSessionKey } from "@/analytics/work-session";

export type WorkAnalyticsKind = "design" | "logo" | "website";

// The aggregate deduplicates opens by work and session. Retrying capture after
// a privacy preference change must not suppress an otherwise eligible open.

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
    function capture() {
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
        work_session_key: getWorkSessionKey(),
      });
    }
    capture();
    window.addEventListener("analytics-preference-changed", capture);
    return () => window.removeEventListener("analytics-preference-changed", capture);
  }, [workId, workKind]);

  return null;
}
