"use client";

import posthog from "posthog-js";

import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from "./events";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

export function captureAnalyticsEvent<EventName extends AnalyticsEventName>(
  event: EventName,
  properties: AnalyticsEventProperties[EventName],
) {
  if (!projectToken) return;

  posthog.capture(event, properties);
}
