import {
  isAnalyticsDisabled,
  isPrivateAnalyticsPath,
  sanitizeAnalyticsReferrer,
} from "./privacy";

export type DataBullConfig = { endpoint: string; websiteId: string; domain: string };

const publicPages = new Set([
  "/", "/logos", "/websites", "/creators", "/about", "/info", "/contact",
  "/privacy", "/terms", "/editorial-policy", "/developers", "/sponsor",
]);

export function isDataBullPublicPath(pathname: string) {
  if (isPrivateAnalyticsPath(pathname)) return false;
  return publicPages.has(pathname) || /^\/(posts|logos|websites|creators)\/[^/]+\/?$/.test(pathname);
}

export function dataBullPageUrl(href: string) {
  const url = new URL(href);
  const clean = new URL(url.origin + url.pathname);
  // Marketing labels only: never pass arbitrary queries, search terms, or tokens.
  for (const name of ["utm_source", "utm_medium", "utm_campaign"]) {
    const value = url.searchParams.get(name);
    if (value && /^[a-zA-Z0-9_-]{1,100}$/.test(value)) clean.searchParams.set(name, value);
  }
  return clean.href;
}

const IDLE_LIMIT_MS = 30 * 60_000;
let lastPageView: { key: string; at: number } | undefined;

/** DataBull 1.7 cookieless collector contract. No third-party script or browser IDs. */
export function trackDataBullPage(config: DataBullConfig, pathname: string) {
  if (typeof window === "undefined" || !isDataBullPublicPath(pathname)) return;
  if (![config.domain, `www.${config.domain}`].includes(window.location.hostname)) return;

  const href = dataBullPageUrl(window.location.href);
  const key = `${config.websiteId}:${href}`;
  let stopped = false;
  let startedAt = 0;
  let activeSince: number | null = null;
  let engagedMs = 0;
  let sentPageView = false;
  const pending = new Set<AbortController>();
  type HeartbeatAttempt = {
    body: string;
    controller: AbortController;
    failed: boolean;
    coalesced: boolean;
  };
  let lastHeartbeat: HeartbeatAttempt | undefined;
  const allowed = () => !stopped && !isAnalyticsDisabled() &&
    window.location.pathname === pathname && isDataBullPublicPath(window.location.pathname);

  function updateTime() {
    const now = Date.now();
    if (activeSince !== null) engagedMs = Math.min(IDLE_LIMIT_MS, engagedMs + now - activeSince);
    activeSince = allowed() && document.visibilityState === "visible" ? now : null;
  }

  function detachPreferenceWhenFinished() {
    if (stopped && pending.size === 0) {
      window.removeEventListener("analytics-preference-changed", onPreference);
    }
  }

  function dispatch(body: string, heartbeat: boolean, fallback = false) {
    if (isAnalyticsDisabled()) return;
    const controller = new AbortController();
    pending.add(controller);
    const attempt = { body, controller, failed: false, coalesced: false };
    if (heartbeat) lastHeartbeat = attempt;
    function failed() {
      attempt.failed = true;
      // An exit event may have reused this in-flight request. Preserve its one
      // fallback opportunity if that request fails, even after React cleanup.
      if (attempt.coalesced && !fallback && !controller.signal.aborted && !isAnalyticsDisabled()) {
        dispatch(body, heartbeat, true);
      }
    }
    void fetch(config.endpoint, {
      method: "POST", body, headers: { "Content-Type": "text/plain" },
      credentials: "omit", referrerPolicy: "no-referrer", keepalive: true, signal: controller.signal,
    }).then(response => { if (!response.ok) failed(); }, failed).finally(() => {
      pending.delete(controller);
      detachPreferenceWhenFinished();
    });
  }

  function send(type: "pageview" | "heartbeat", finalPublicPageUpdate = false, coalesceExit = false) {
    if (finalPublicPageUpdate ? stopped || isAnalyticsDisabled() : !allowed()) return;
    // No visitorId/sessionId: DataBull must use its server-side cookieless mode.
    // Switching its site to cookie mode fails closed instead of setting cookies.
    const body = {
      type, websiteId: config.websiteId, domain: config.domain, href,
      referrer: sanitizeAnalyticsReferrer(document.referrer, window.location.origin) ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      consent: false,
      ...(type === "heartbeat" ? { engagement: { href, time: Math.round(engagedMs) } } : {}),
    };
    const serialized = JSON.stringify(body);
    if (coalesceExit && lastHeartbeat?.body === serialized &&
        !lastHeartbeat.failed && !lastHeartbeat.controller.signal.aborted) {
      lastHeartbeat.coalesced = true;
      return;
    }
    dispatch(serialized, type === "heartbeat");
  }

  function tick() {
    updateTime();
    if (!allowed() || document.visibilityState !== "visible") return;
    const now = Date.now();
    if (!sentPageView) {
      startedAt = now;
      sentPageView = true;
      if (lastPageView?.key !== key || now - lastPageView.at >= 1_000) {
        lastPageView = { key, at: now };
        send("pageview");
      }
    } else if (now - startedAt < IDLE_LIMIT_MS) send("heartbeat");
  }

  function onPreference() {
    if (isAnalyticsDisabled()) {
      pending.forEach((request) => request.abort());
      pending.clear();
      lastHeartbeat = undefined;
      activeSince = null;
      engagedMs = 0;
      sentPageView = false;
      detachPreferenceWhenFinished();
    } else if (!stopped) tick();
  }

  function onVisibility() {
    updateTime();
    if (document.visibilityState === "visible") {
      // Returning after a hidden interval is new session activity, even when
      // foreground engagement has not advanced. Never deduplicate that ping.
      lastHeartbeat = undefined;
      tick();
    } else if (sentPageView && Date.now() - startedAt < IDLE_LIMIT_MS) send("heartbeat", false, true);
  }

  // Deferring the first send lets React cancel a discarded effect before collection.
  const first = window.setTimeout(tick, 0);
  const heartbeat = window.setInterval(tick, 60_000);
  window.addEventListener("analytics-preference-changed", onPreference);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onVisibility);
  return () => {
    updateTime();
    // Keep already-sent public requests alive on navigation. Aborting the
    // request reused by an exit event would lose its final engagement update.
    // Finish the old public page on SPA navigation, using its captured safe URL.
    // The destination URL and its private state are never part of this payload.
    if (sentPageView && Date.now() - startedAt < IDLE_LIMIT_MS) send("heartbeat", true, true);
    stopped = true;
    window.clearTimeout(first);
    window.clearInterval(heartbeat);
    // Opt-out can still cancel delivery while a final keepalive is in flight.
    detachPreferenceWhenFinished();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onVisibility);
  };
}
