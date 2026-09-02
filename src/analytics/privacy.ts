export const PRIVATE_ANALYTICS_PATH_PREFIXES = [
  "/admin",
  "/sign-in",
  "/admin-access-denied",
] as const;

export function isPrivateAnalyticsPath(pathname: string) {
  return PRIVATE_ANALYTICS_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function parsePublicWebUrl(value: unknown, baseUrl: string) {
  if (typeof value !== "string" || value.trim() === "") return undefined;

  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
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
