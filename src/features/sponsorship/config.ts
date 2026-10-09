import "server-only";
export function sponsorshipEnabled() {
  return process.env.SPONSORSHIP_ENABLED === "true";
}
export function sponsorshipWritesEnabled() {
  return (
    sponsorshipEnabled() && process.env.SPONSORSHIP_WRITES_ENABLED === "true"
  );
}
export const sponsorPrivateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
} as const;
