"use client";

import posthog from "posthog-js";
import { isAnalyticsDisabled, isPrivateAnalyticsPath } from "./privacy";

import type { AnalyticsEventName, AnalyticsEventProperties } from "./events";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

export function captureAnalyticsEvent<EventName extends AnalyticsEventName>(
  event: EventName,
  properties: AnalyticsEventProperties[EventName],
) {
  if (
    !projectToken ||
    isAnalyticsDisabled() ||
    isPrivateAnalyticsPath(window.location.pathname) ||
    process.env.NEXT_PUBLIC_POSTHOG_COOKIELESS_ENABLED !== "true"
  )
    return;

  posthog.capture(event, properties);
}
