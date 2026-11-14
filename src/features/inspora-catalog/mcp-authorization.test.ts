import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ identity: vi.fn(), admins: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.identity }));
vi.mock("@/auth/config", () => ({ getConfiguredAdminUserIds: mocks.admins }));
import { authorizationConfig, consentHtml, createAuthorizationRoute } from "./mcp-authorization";
import { publicAuthRedirect } from "@/auth/public-auth-redirect";
const origin = "https://www.inspora.design", ticket = "t".repeat(43);
const values = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATA_ENVIRONMENT: "production", INSPORA_MCP_AUTH_URL: "https://inspora-mcp-pilot.aymenbensalem-3lsi.workers.dev/internal/authorization", INSPORA_MCP_AUTH_TOKEN: "s".repeat(43) };
function configured() { for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value); mocks.identity.mockResolvedValue({ userId: "user_test1" }); mocks.admins.mockReturnValue(new Set(["user_test1"])); }
beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); vi.restoreAllMocks(); });
it("rejects Preview and unrelated origins and escapes unverified client data", () => {
  expect(authorizationConfig(values)).not.toBeNull(); expect(authorizationConfig({ ...values, VERCEL_ENV: "preview" })).toBeNull();
  for (const policy of ["authenticated", "public", "pro"]) expect(authorizationConfig({ ...values, INSPORA_MCP_ACCESS_POLICY: policy })).toBeNull();
  expect(authorizationConfig({ ...values, INSPORA_MCP_AUTH_URL: "https://evil.test/internal/authorization" })).toBeNull();
  const html = consentHtml({ clientName: '<script>alert("x")</script>', redirectHost: 'x"><img src=x>' }, ticket, "a");
  expect(html).not.toContain("<script>"); expect(html).not.toContain("<img"); expect(html).toContain("&#60;script&#62;");
});
it("binds signed expiring consent to the user and ticket without an extra browser cookie", async () => {
  configured(); const bridge = vi.fn(async () => Response.json({ description: { clientName: "Codex", redirectHost: "localhost", redirectIsLoopback: true } }));
  const handler = createAuthorizationRoute({ fetchBridge: bridge });
  const get = await handler(new Request(origin + "/api/inspora/mcp/authorize?ticket=" + ticket)); expect(get.status).toBe(200);
  // HTML navigation-mode POSTs need a policy that preserves same-origin Origin.
  expect(["same-origin", "strict-origin", "strict-origin-when-cross-origin"]).toContain(get.headers.get("referrer-policy"));
  const html = await get.text(), csrf = html.match(/name="csrf" value="([^"]+)"/)![1];
  expect(get.headers.get("set-cookie")).toBeNull();
  expect(bridge).toHaveBeenCalledTimes(1);
  const refreshed = await handler(new Request(origin + "/api/inspora/mcp/authorize?ticket=" + ticket));
  expect(await refreshed.text()).not.toContain('value="' + csrf + '"');
  const post = (extra: Record<string, string> = {}) => new Request(origin + "/api/inspora/mcp/authorize", { method: "POST", headers: { Origin: origin }, body: new URLSearchParams({ ticket, csrf, decision: "approve", ...extra }) });
  expect((await handler(post({ csrf: "a".repeat(64) }))).status).toBe(403);
  expect((await handler(post({ csrf: "" }))).status).toBe(403);
  expect((await handler(post({ ticket: "x".repeat(43) }))).status).toBe(403);
  const clock = vi.spyOn(Date, "now").mockReturnValue(Number(csrf.split(".")[1]) + 1);
  expect((await handler(post())).status).toBe(403); clock.mockRestore();
  const nullOrigin = post(); nullOrigin.headers.set("origin", "null"); expect((await handler(nullOrigin)).status).toBe(403);
  mocks.identity.mockResolvedValue({ userId: "user_test2" }); mocks.admins.mockReturnValue(new Set(["user_test2"])); expect((await handler(post())).status).toBe(403);
  mocks.identity.mockResolvedValue({ userId: "user_test1" }); mocks.admins.mockReturnValue(new Set(["user_test1"]));
  const approved = await handler(post()); expect(approved.status).toBe(303); expect(new URL(approved.headers.get("location")!).pathname).toBe("/authorize/complete");
  const call = bridge.mock.calls.at(-1) as unknown as [string, RequestInit]; expect(JSON.parse(call[1].body as string)).toEqual({ action: "approve", ticket, userId: "user_test1", decision: "approve" });
});
it("restricts trial access to the team and rejects cross-origin consent", async () => {
  configured(); mocks.admins.mockReturnValue(new Set());
  const handler = createAuthorizationRoute(); expect((await handler(new Request(origin + "/api/inspora/mcp/authorize?ticket=" + ticket))).status).toBe(403);
  const forged = new Request(origin + "/api/inspora/mcp/authorize", { method: "POST", headers: { Origin: "https://evil.test" }, body: "ticket=" + ticket }); expect((await handler(forged)).status).toBe(403);
});
it("returns signed-out users to the ticket through the site's relative-only sign-in redirect", async () => {
  configured(); mocks.identity.mockResolvedValue({ userId: null, redirectToSignIn: ({ returnBackUrl }: { returnBackUrl: string }) => new Response(null, { status: 303, headers: { Location: origin + "/sign-in?redirect_url=" + encodeURIComponent(returnBackUrl) } }) });
  const handler = createAuthorizationRoute();
  const response = await handler(new Request(origin + "/api/inspora/mcp/authorize?ticket=" + ticket));
  expect(response.status).toBe(303);
  const signIn = new URL(response.headers.get("location")!, origin);
  expect(signIn.origin).toBe(origin); expect(signIn.pathname).toBe("/sign-in");
  expect(signIn.searchParams.get("redirect_url")).toBe("/api/inspora/mcp/authorize?ticket=" + ticket);
  expect(publicAuthRedirect(signIn.searchParams.get("redirect_url")!)).toBe("/api/inspora/mcp/authorize?ticket=" + ticket);
});
it("records only operational codes when the private bridge rejects a connection", async () => {
  configured(); const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const bridge = vi.fn(async () => Response.json({ error: "AUTH_TICKET_EXPIRED", privateDetail: values.INSPORA_MCP_AUTH_TOKEN }, { status: 410 }));
    const response = await createAuthorizationRoute({ fetchBridge: bridge })(new Request(origin + "/api/inspora/mcp/authorize?ticket=" + ticket));
    expect(response.status).toBe(503);
    expect(warning).toHaveBeenCalledWith("MCP consent bridge unavailable", { action: "inspect", status: 410, code: "AUTH_TICKET_EXPIRED" });
    expect(JSON.stringify(warning.mock.calls)).not.toContain(values.INSPORA_MCP_AUTH_TOKEN);
    expect(JSON.stringify(warning.mock.calls)).not.toContain(ticket);
  } finally { warning.mockRestore(); }
});
