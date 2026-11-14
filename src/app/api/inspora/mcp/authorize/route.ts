import { createAuthorizationRoute } from "@/features/inspora-catalog/mcp-authorization";
export const maxDuration = 30;
const authorize = createAuthorizationRoute();
export const GET = authorize;
export const POST = authorize;
