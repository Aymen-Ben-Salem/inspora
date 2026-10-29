import { publicAuthRedirect } from "./public-auth-redirect";

export function creatorAuthReturn(value: string) {
  const path = publicAuthRedirect(value);
  if (/^\/creators\/[a-z0-9_]+\/claim(?:\?|$)/.test(path)) return path;
  if (path.startsWith("/profile/claim-match")) return path;
  return "/profile/claim-match?returnTo=" + encodeURIComponent(path);
}

export function afterCreatorMatch(value: string | string[] | undefined) {
  const path = publicAuthRedirect(value);
  return /^\/(?:profile\/(?:claim-match|x-callback)|sign-(?:in|up))(?:[/?#]|$)/.test(path) ? "/" : path;
}
