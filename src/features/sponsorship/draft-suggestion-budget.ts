import "server-only";
import { createHash } from "node:crypto";

// Best-effort per-instance resource bounds, not a distributed rate limit.
// No database traffic and no raw IP addresses retained.
export function createDraftSuggestionBudget(now = Date.now) {
  let windowStart = now(), total = 0, active = 0;
  const clients = new Map<string, number>();
  return (request: Request): (() => void) | null => {
    const time = now();
    if (time - windowStart >= 60_000) {
      windowStart = time;
      total = 0;
      clients.clear();
    }
    const ip = (request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown").slice(0, 128);
    const key = createHash("sha256").update(ip).digest("hex");
    const count = clients.get(key) ?? 0;
    if (active >= 2 || total >= 30 || count >= 5) return null;
    clients.set(key, count + 1);
    total++;
    active++;
    let released = false;
    return () => { if (!released) { released = true; active--; } };
  };
}
export const reserveDraftSuggestion = createDraftSuggestionBudget();
