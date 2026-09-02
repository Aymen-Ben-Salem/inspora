import posthog from "posthog-js";

import {
  isPrivateAnalyticsPath,
  sanitizeAnalyticsPageUrl,
  sanitizeAnalyticsReferrer,
} from "@/analytics/privacy";

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
    capture_heatmaps: false,
    capture_performance: {
      web_vitals: true,
    },
    capture_pageview: "history_change",
    capture_pageleave: true,
    cookie_expiration: 90,
    cross_subdomain_cookie: false,
    disable_session_recording: true,
    opt_out_capturing_persistence_type: "cookie",
    persistence: "cookie",
    person_profiles: "never",
    respect_dnt: true,
    before_send(event) {
      if (!event) return null;
      if (isPrivateApplicationUrl(event.properties?.$current_url)) return null;

      const properties = { ...event.properties };
      const currentUrl = sanitizeAnalyticsPageUrl(
        properties.$current_url,
        window.location.origin,
      );
      const referrer = sanitizeAnalyticsReferrer(
        properties.$referrer,
        window.location.origin,
      );

      if (currentUrl) properties.$current_url = currentUrl;
      else delete properties.$current_url;

      if (referrer) properties.$referrer = referrer;
      else delete properties.$referrer;

      return { ...event, properties };
    },
  });
}
