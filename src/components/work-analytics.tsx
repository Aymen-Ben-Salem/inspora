"use client";

import { useEffect } from "react";

import { captureAnalyticsEvent } from "@/analytics/client";
import { ANALYTICS_EVENTS } from "@/analytics/events";
import { isPrivateAnalyticsPath } from "@/analytics/privacy";

export type WorkAnalyticsKind = "design" | "logo" | "website";

const capturedWorkOpens = new Set<string>();

export function shouldCaptureWorkOpen({
  pathname,
  workId,
  workKind,
}: {
  pathname: string;
  workId: string;
  workKind: WorkAnalyticsKind;
}) {
  if (!workId.trim() || isPrivateAnalyticsPath(pathname)) return false;
  const key = `${workKind}:${workId}`;
  if (capturedWorkOpens.has(key)) return false;
  capturedWorkOpens.add(key);
  return true;
}

export function resetCapturedWorkOpensForTests() {
  capturedWorkOpens.clear();
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
