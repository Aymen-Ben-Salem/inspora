import "server-only";
import { after } from "next/server";

export function syncNotificationConfig(values: Record<string, string | undefined>) {
  if (values.VERCEL_ENV !== "production" || values.VERCEL_GIT_COMMIT_REF !== "main" || values.DATA_ENVIRONMENT !== "production") return null;
  const token = values.INSPORA_MCP_SYNC_TOKEN;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token ?? "")) return null;
  let url: URL;
  try { url = new URL(values.INSPORA_MCP_SYNC_URL ?? ""); } catch { return null; }
  if (url.protocol !== "https:" || !["mcp.inspora.design"].includes(url.hostname) || url.port || url.username || url.password || url.pathname !== "/internal/catalog" || url.search || url.hash) return null;
  return { url: url.href, token: token! };
}

// This is an invalidation signal, never an admin payload or an AI call. Saving a
// work does not wait for search indexing. A shared 12-hour repair covers lost signals.
export function notifyCatalogChanged() {
  const config = syncNotificationConfig(process.env);
  if (!config) return;
  try {
    after(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(config.url, { method: "POST", headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" }, body: "{}", redirect: "error", signal: AbortSignal.timeout(3000) });
          if (response.ok) return;
        } catch { /* Retry transient delivery failures without logging secrets. */ }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      }
      console.warn("MCP catalog notification failed; shared repair will retry.");
    });
  } catch {
    console.warn("MCP catalog notification could not be scheduled; shared repair will retry.");
  }
}
