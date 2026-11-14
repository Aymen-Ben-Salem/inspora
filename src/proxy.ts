import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getClerkAuthorizedParties, isClerkConfigured } from "@/auth/config";

const authorizedParties = getClerkAuthorizedParties();
const withClerk = clerkMiddleware(
  authorizedParties.length > 0 ? { authorizedParties } : undefined,
);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // This dedicated Preview alias serves only the authenticated catalog feed.
  // Its deployment-protection exception must never open other website routes.
  if (request.nextUrl.hostname === "inspora-catalog-preview.vercel.app") {
    if (request.nextUrl.pathname !== "/api/inspora/catalog" || request.method !== "GET" || request.nextUrl.search) {
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    }
    return NextResponse.next();
  }
  if (!isClerkConfigured()) return NextResponse.next();

  return withClerk(request, event);
}

export const config = {
  matcher: [
    { source: "/:path*", has: [{ type: "host", value: "inspora-catalog-preview.vercel.app" }] },
    // Server Actions post back to the page that opened them. Run Clerk only for
    // those action requests so submission actions work from cacheable public pages.
    {
      source: "/:path*",
      has: [{ type: "header", key: "next-action" }],
    },
    // Creator pages read the session for their claim/manage action, including
    // signed-out visits. Other public archives stay outside Clerk for cacheability.
    "/creators/:path*",
    "/admin/:path*",
    "/admin-access-denied",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/saved/:path*",
    "/api/saved-posts/:path*",
    "/profile/:path*",
    "/api/profile/:path*",
    "/api/submissions/:path*",
    "/sponsor/start/:path*",
    "/sponsor/checkout/:path*",
    "/sponsor/access/:path*",
    "/sponsor/verify/:path*",
    "/sponsor/security/:path*",
    "/sponsor/dashboard/:path*",
    "/sponsor/campaigns/:path*",
    "/api/admin/sponsorship/:path*",
    "/api/admin/media",
    "/api/admin/editorial",
    "/api/inspora/mcp/:path*",
    "/api/sponsorship/:path*",
    "/api/analytics/:path*",
    "/api/account/capabilities",
    // Preserve Clerk's frontend API and session-handshake route.
    "/__clerk/:path*",
  ],
};
