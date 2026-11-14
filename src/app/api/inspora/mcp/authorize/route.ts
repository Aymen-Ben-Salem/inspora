import { createAuthorizationRoute } from "@/features/inspora-catalog/mcp-authorization";
export const maxDuration = 30;
const authorize = createAuthorizationRoute();
export function GET(request: Request) {
  const target = new URL("https://www.inspora.design/connect/mcp");
  target.searchParams.set("ticket", new URL(request.url).searchParams.get("ticket") ?? "");
  return new Response(null, { status: 303, headers: { Location: target.href, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
export const POST = authorize;
