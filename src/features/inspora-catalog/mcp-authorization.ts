import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { getConfiguredAdminUserIds } from "@/auth/config";

const site = "https://www.inspora.design";
// Keep cross-site referrers private while preserving Origin on same-site forms.
const common = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
const validTicket = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export function authorizationConfig(values: Record<string, string | undefined>) {
  // Customer access must use the future shared Pro entitlement/credit service.
  // A configuration flag must not accidentally open a free authenticated service.
  if ((values.INSPORA_MCP_ACCESS_POLICY ?? "team") !== "team") return null;
  if (values.VERCEL_ENV !== "production" || values.VERCEL_GIT_COMMIT_REF !== "main" || values.DATA_ENVIRONMENT !== "production" || !/^[A-Za-z0-9_-]{43,128}$/.test(values.INSPORA_MCP_AUTH_TOKEN ?? "")) return null;
  let url: URL;
  try { url = new URL(values.INSPORA_MCP_AUTH_URL ?? ""); } catch { return null; }
  if (url.protocol !== "https:" || !["mcp.inspora.design"].includes(url.hostname) || url.port || url.username || url.password || url.pathname !== "/internal/authorization" || url.search || url.hash) return null;
  return { url: url.href, origin: url.origin, token: values.INSPORA_MCP_AUTH_TOKEN! };
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
    let formFacts: Record<string, boolean | number | string> | undefined;
    if (request.method === "GET") ticket = url.searchParams.get("ticket") ?? "";
    else {
      const body = await request.text(); if (new TextEncoder().encode(body).length > 2048) return reject(413, "Request too large");
      const form = new URLSearchParams(body); ticket = form.get("ticket") ?? ""; csrf = form.get("csrf") ?? ""; decision = form.get("decision") ?? "";
      const contentType = request.headers.get("content-type")?.split(";")[0] ?? "missing";
      formFacts = { bodyBytes: new TextEncoder().encode(body).length, hasTicket: form.has("ticket"), hasCsrf: form.has("csrf"), hasDecision: form.has("decision"), ticketLength: ticket.length, csrfLength: csrf.length, contentType: ["application/x-www-form-urlencoded", "multipart/form-data", "missing"].includes(contentType) ? contentType : "other" };
    }
    if (!validTicket(ticket)) {
      console.warn("MCP consent request invalid", { method: request.method, queryTicketPresent: url.searchParams.has("ticket"), ...formFacts });
      return reject(400, "Start connecting again from your MCP client.");
    }
    // A signed synchronizer token avoids rotating a second browser cookie on GET.
    // The OAuth provider separately binds completion to its initiating browser.
    const signature = (nonce: string, expires: string) => createHmac("sha256", config.token).update(["inspora-consent-v1", session.userId, ticket, nonce, expires].join("\n")).digest("hex");
    let bridgeAction = "none", bridgeStatus: number | undefined, bridgeCode = "BRIDGE_UNAVAILABLE";
    try {
      const bridge = async (action: string, extra: Record<string, string> = {}) => {
        bridgeAction = action;
        const response = await fetchBridge(config.url, { method: "POST", headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" }, body: JSON.stringify({ action, ticket, ...extra }), redirect: "error", signal: AbortSignal.timeout(10000) });
        bridgeStatus = response.status;
        if (!response.ok) {
          try { const body = await response.json(); if (/^AUTH_[A-Z_]+$/.test(body.error ?? "")) bridgeCode = body.error; } catch { /* Never log raw provider responses. */ }
          throw Error("Connection unavailable");
        }
        return response.json();
      };
      if (request.method === "GET") {
        const { description } = await bridge("inspect"), nonce = randomBytes(24).toString("base64url"), expires = String(Date.now() + 600000);
        const token = nonce + "." + expires + "." + signature(nonce, expires);
        const details = { clientName: String(description.clientName ?? "your app").slice(0, 120), clientDomain: typeof description.clientDomain === "string" ? description.clientDomain.slice(0, 200) : undefined, redirectHost: String(description.redirectHost ?? "").slice(0, 200), redirectIsLoopback: description.redirectIsLoopback === true, scope: Array.isArray(description.scope) ? description.scope.filter((value: string) => ["inspiration:read", "offline_access"].includes(value)) : [] };
        return Response.json({ details, ticket, csrf: token }, { headers: common });
      }
      const parts = csrf.match(/^([A-Za-z0-9_-]{32})\.(\d{13})\.([a-f0-9]{64})$/), now = Date.now();
      if (!parts || Number(parts[2]) <= now || Number(parts[2]) > now + 630000 || !timingSafeEqual(Buffer.from(parts[3]), Buffer.from(signature(parts[1], parts[2]))) || !["approve", "deny"].includes(decision)) {
        console.warn("MCP consent rejected", { reason: parts && Number(parts[2]) <= now ? "FORM_EXPIRED" : "FORM_INVALID", signedTokenShape: Boolean(parts), decisionValid: ["approve", "deny"].includes(decision), ...formFacts });
        return reject(403, "Connection could not be verified. Start again from your MCP client.");
      }
      await bridge("approve", { userId: session.userId, decision });
      console.info("MCP consent handed off", { decision });
      const target = new URL("/authorize/complete", config.origin); target.searchParams.set("ticket", ticket);
      return new Response(null, { status: 303, headers: { ...common, Location: target.href } });
    } catch {
      // Operational codes only: no identity, ticket, cookie, request URL or secret.
      console.warn("MCP consent bridge unavailable", { action: bridgeAction, status: bridgeStatus, code: bridgeCode });
      return reject(503, "The connection expired or is temporarily unavailable. Start again from your MCP client.");
    }
  };
}
