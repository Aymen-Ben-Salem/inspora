export const PRIVATE_ANALYTICS_PATH_PREFIXES = [
  "/admin",
  "/sign-in",
  "/sign-up",
  "/admin-access-denied",
  "/profile",
  "/sponsor/access",
  "/sponsor/start",
  "/sponsor/dashboard",
  "/sponsor/campaigns",
  "/sponsor/billing",
  "/sponsor/security",
  "/sponsor/verify",
  "/api",
  "/saved",
  "/submit",
] as const;

export function isPrivateAnalyticsPath(pathname: string) {
  return PRIVATE_ANALYTICS_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAnalyticsDisabled() {
  if (typeof window === "undefined") return true;
  return (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true ||
    /(?:^|;\s*)inspora_analytics_disabled=1(?:;|$)/.test(document.cookie)
  );
}
export function setAnalyticsDisabled(disabled: boolean) {
  document.cookie = `inspora_analytics_disabled=${disabled ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  window.dispatchEvent(new Event("analytics-preference-changed"));
}
export function cleanObsoleteAnalyticsCookies() {
  if (typeof document === "undefined") return;
  if (
    document.cookie
      .split(";")
      .some((cookie) => /^__ph_opt_in_out_[^=]+=0$/.test(cookie.trim()))
  )
    setAnalyticsDisabled(true);
  const names = document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter(
      (name) =>
        /^ph_[a-zA-Z0-9_-]+(?:_posthog|_opt_in_out)$/.test(name) ||
        /^__ph_opt_in_out_/.test(name),
    );
  for (const name of names) {
    document.cookie = `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    const labels = location.hostname.split(".");
    for (let i = 0; i < labels.length - 1; i++)
      document.cookie = `${name}=; Path=/; Domain=.${labels.slice(i).join(".")}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
}

function parsePublicWebUrl(value: unknown, baseUrl: string) {
  if (typeof value !== "string" || value.trim() === "") return undefined;

  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

export function sanitizeAnalyticsPageUrl(value: unknown, baseUrl: string) {
  const url = parsePublicWebUrl(value, baseUrl);
  return url ? `${url.origin}${url.pathname}` : undefined;
}

export function sanitizeAnalyticsReferrer(value: unknown, baseUrl: string) {
  return parsePublicWebUrl(value, baseUrl)?.origin;
}
