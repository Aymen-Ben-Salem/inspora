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
