import posthog from "posthog-js";

import { isPrivateAnalyticsPath } from "@/analytics/privacy";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function isPrivateApplicationUrl(value: unknown) {
  if (typeof value !== "string") return false;

  try {
    const path = new URL(value, window.location.origin).pathname;
    return isPrivateAnalyticsPath(path);
  } catch {
    return false;
  }
}

if (projectToken && apiHost) {
  posthog.init(projectToken, {
    api_host: apiHost,
    defaults: "2026-05-30",
    autocapture: false,
    capture_heatmaps: true,
    capture_performance: {
      web_vitals: true,
    },
    capture_pageview: "history_change",
    capture_pageleave: true,
    cookieless_mode: "always",
    disable_session_recording: true,
    person_profiles: "never",
    before_send(event) {
      if (!event) return null;
      return isPrivateApplicationUrl(event.properties?.$current_url)
        ? null
        : event;
    },
  });
}
