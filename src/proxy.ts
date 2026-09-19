import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getClerkAuthorizedParties, isClerkConfigured } from "@/auth/config";

const authorizedParties = getClerkAuthorizedParties();
const withClerk = clerkMiddleware(
  authorizedParties.length > 0 ? { authorizedParties } : undefined,
);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!isClerkConfigured()) return NextResponse.next();

  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Keep Clerk limited to authenticated product routes, public auth, and its integration subtree.
    // Other public pages stay outside Routing Middleware for cacheability.
    "/admin/:path*",
    "/admin-access-denied",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/saved/:path*",
    "/api/saved-posts/:path*",
    "/profile/:path*",
    "/api/profile/:path*",
    "/api/submissions/:path*",
    // Preserve Clerk's frontend API and session-handshake route.
    "/__clerk/:path*",
  ],
};
