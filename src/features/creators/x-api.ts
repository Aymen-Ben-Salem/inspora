import "server-only";
import { normalizeXProfileUrl, normalizeXUsername } from "./validation";

export class XLookupError extends Error {
  constructor(readonly code: "unavailable" | "not_found", message: string) {
    super(message);
    this.name = "XLookupError";
  }
}

export type XAccount = { id: string; username: string; profileImageUrl?: string };

// Only the official fixed host receives the token. Never follow a supplied URL.
export async function lookupXProfile(profileUrl: string, options: { includeAvatar?: boolean } = {}): Promise<XAccount> {
  let username: string;
  try { username = new URL(normalizeXProfileUrl(profileUrl)).pathname.slice(1); }
  catch { throw new XLookupError("not_found", "This creator has an invalid X link. Please report the attribution problem."); }
  return lookupXAccount(`by/username/${encodeURIComponent(username)}`, { username }, options.includeAvatar);
}

export async function lookupXAccountById(id: string): Promise<XAccount> {
  if (!/^[1-9]\d{0,24}$/.test(id)) throw new XLookupError("not_found", "This X account is invalid.");
  return lookupXAccount(id, { id }, true);
}

async function lookupXAccount(path: string, expected: { id?: string; username?: string }, includeAvatar = false): Promise<XAccount> {
  const token = process.env.X_API_BEARER_TOKEN?.trim();
  if (!token) throw new XLookupError("unavailable", "X verification is temporarily unavailable. Please try again later.");
  try {
    const response = await fetch(`https://api.x.com/2/users/${path}${includeAvatar ? "?user.fields=profile_image_url" : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) throw new XLookupError("not_found", "That X profile could not be found. Check its URL or report an incorrect attribution.");
    if (!response.ok) throw new XLookupError("unavailable", "X verification is temporarily unavailable. Please try again later.");
    const body: unknown = await response.json();
    const data = body && typeof body === "object" && "data" in body ? body.data : null;
    // X can return HTTP 200 with an errors array for a nonexistent username.
    if (!data && body && typeof body === "object" && "errors" in body && Array.isArray(body.errors) &&
      body.errors.some(error => error && typeof error === "object" && "type" in error &&
        ["https://api.x.com/2/problems/resource-not-found", "https://api.twitter.com/2/problems/resource-not-found"].includes(error.type))) {
      throw new XLookupError("not_found", "That X profile could not be found. Check its URL or report an incorrect attribution.");
    }
    if (!data || typeof data !== "object" || !("id" in data) || !("username" in data) ||
      typeof data.id !== "string" || !/^[1-9]\d{0,24}$/.test(data.id) || typeof data.username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(data.username) ||
      (expected.username && normalizeXUsername(data.username) !== expected.username.toLowerCase()) ||
      (expected.id && data.id !== expected.id)) {
      throw new XLookupError("unavailable", "X could not confirm this profile. Please try again later.");
    }
    let profileImageUrl: string | undefined;
    if (includeAvatar && "profile_image_url" in data && typeof data.profile_image_url === "string") {
      try {
        const image = new URL(data.profile_image_url);
        if (image.protocol === "https:" && image.hostname === "pbs.twimg.com" && !image.username && !image.password && image.pathname.startsWith("/profile_images/")) profileImageUrl = image.href;
      } catch { /* Photo metadata must not invalidate otherwise valid identity evidence. */ }
    }
    return { id: data.id, username: data.username, ...(profileImageUrl ? { profileImageUrl } : {}) };
  } catch (error) {
    if (error instanceof XLookupError) throw error;
    // Do not log provider responses, request headers, or transport errors containing credentials.
    throw new XLookupError("unavailable", "X verification is temporarily unavailable. Please try again later.");
  }
}
