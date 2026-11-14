import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { getConfiguredAdminUserIds } from "@/auth/config";

const site = "https://www.inspora.design";
// Keep cross-site referrers private while preserving Origin on same-site forms.
const common = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => "&#" + char.charCodeAt(0) + ";");
const validTicket = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export function authorizationConfig(values: Record<string, string | undefined>) {
  // Customer access must use the future shared Pro entitlement/credit service.
  // A configuration flag must not accidentally open a free authenticated service.
  if ((values.INSPORA_MCP_ACCESS_POLICY ?? "team") !== "team") return null;
  if (values.VERCEL_ENV !== "production" || values.VERCEL_GIT_COMMIT_REF !== "main" || values.DATA_ENVIRONMENT !== "production" || !/^[A-Za-z0-9_-]{43,128}$/.test(values.INSPORA_MCP_AUTH_TOKEN ?? "")) return null;
  let url: URL;
  try { url = new URL(values.INSPORA_MCP_AUTH_URL ?? ""); } catch { return null; }
  if (url.protocol !== "https:" || !["inspora-mcp-pilot.aymenbensalem-3lsi.workers.dev", "mcp.inspora.design"].includes(url.hostname) || url.port || url.username || url.password || url.pathname !== "/internal/authorization" || url.search || url.hash) return null;
  return { url: url.href, origin: url.origin, token: values.INSPORA_MCP_AUTH_TOKEN! };
}

export function consentHtml(details: { clientName?: string; clientDomain?: string; redirectHost?: string; redirectIsLoopback?: boolean; scope?: string[] }, ticket: string, csrf: string) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect to Inspora</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f7f6;color:#171717;font:16px/1.55 system-ui,sans-serif}main{max-width:480px;margin:10vh auto;padding:32px}header{font-size:25px;font-weight:700;letter-spacing:-1px;margin-bottom:48px}section{background:white;padding:28px;border:1px solid #dededb;border-radius:12px}h1{font-size:25px;line-height:1.2;margin:0 0 18px}p{color:#555}strong{color:#171717}small{display:block;color:#666;margin-top:18px}form{display:flex;gap:12px;margin-top:28px}button{font:inherit;cursor:pointer;border:1px solid #d5d5d1;border-radius:8px;padding:11px 18px;background:white}button[value=approve]{background:#171717;color:white;border-color:#171717;flex:1}button:focus-visible{outline:3px solid #dd55a5;outline-offset:3px}</style><main><header>Inspora</header><section><h1>Connect ${escape(details.clientName || "your app")}</h1><p>This app will be able to search published inspiration and retrieve descriptions, classifications and selected previews.</p><p>It cannot edit content or access your saved collections, account details or payments.</p>${details.scope?.includes("offline_access") ? "<p>This connection can stay signed in for up to 30 days, or until revoked.</p>" : ""}<p>Access returns to <strong>${escape(details.redirectHost)}</strong>.</p>${details.clientDomain ? `<small>Client domain: ${escape(details.clientDomain)}</small>` : "<small>The app supplied its own name; Inspora has not verified it.</small>"}${details.redirectIsLoopback ? "<p><strong>This connects an app on your computer.</strong> Continue only if you started connecting from that app.</p>" : ""}<form method="post" action="/api/inspora/mcp/authorize"><input type="hidden" name="ticket" value="${escape(ticket)}"><input type="hidden" name="csrf" value="${escape(csrf)}"><button name="decision" value="deny">Cancel</button><button name="decision" value="approve">Allow connection</button></form></section></main></html>`;
}

export function createAuthorizationRoute({ identity = auth, administrators = getConfiguredAdminUserIds, fetchBridge = fetch } = {}) {
  return async (request: Request) => {
    const config = authorizationConfig(process.env), url = new URL(request.url);
    const reject = (status: number, message: string) => new Response(message, { status, headers: common });
    if (!config || url.origin !== site || !["GET", "POST"].includes(request.method)) return reject(404, "Not found");
    if (request.method === "POST" && (request.headers.get("origin") !== site || Number(request.headers.get("content-length")) > 2048)) return reject(403, "Connection could not be verified.");
    const session = await identity();
    if (!session.userId) {
      // The existing public sign-in flow accepts only relative return paths.
      const signIn = new URL("/sign-in", site);
      signIn.searchParams.set("redirect_url", url.pathname + url.search);
      return new Response(null, { status: 303, headers: { ...common, Location: signIn.href } });
    }
    // Team-only until the separate launch decision. No new account/admin scope is granted.
    if (!administrators().has(session.userId)) return reject(403, "This MCP trial is currently available to the Inspora team.");
    let ticket: string, csrf = "", decision = "";
    if (request.method === "GET") ticket = url.searchParams.get("ticket") ?? "";
    else {
      const body = await request.text(); if (new TextEncoder().encode(body).length > 2048) return reject(413, "Request too large");
      const form = new URLSearchParams(body); ticket = form.get("ticket") ?? ""; csrf = form.get("csrf") ?? ""; decision = form.get("decision") ?? "";
    }
    if (!validTicket(ticket)) return reject(400, "Start connecting again from your MCP client.");
    const cookieName = "__Host-inspora-mcp-" + createHmac("sha256", config.token).update(ticket).digest("hex").slice(0, 16);
    const signature = (nonce: string) => createHmac("sha256", config.token).update(session.userId + "\n" + ticket + "\n" + nonce).digest("hex");
    try {
      const bridge = async (action: string, extra: Record<string, string> = {}) => {
        const response = await fetchBridge(config.url, { method: "POST", headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" }, body: JSON.stringify({ action, ticket, ...extra }), redirect: "error", signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw Error("Connection unavailable"); return response.json();
      };
      if (request.method === "GET") {
        const { description } = await bridge("inspect"), nonce = randomBytes(24).toString("base64url");
        return new Response(consentHtml(description, ticket, signature(nonce)), { headers: { ...common, "Content-Type": "text/html; charset=utf-8", "Set-Cookie": `${cookieName}=${nonce}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600` } });
      }
      const nonce = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(cookieName + "="))?.slice(cookieName.length + 1) ?? "";
      if (!/^[A-Za-z0-9_-]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(signature(nonce))) || !["approve", "deny"].includes(decision)) return reject(403, "Connection could not be verified. Start again from your MCP client.");
      await bridge("approve", { userId: session.userId, decision });
      const target = new URL("/authorize/complete", config.origin); target.searchParams.set("ticket", ticket);
      return new Response(null, { status: 303, headers: { ...common, Location: target.href, "Set-Cookie": `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0` } });
    } catch { return reject(503, "The connection expired or is temporarily unavailable. Start again from your MCP client."); }
  };
}
