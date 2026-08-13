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
    // Authentication exists only in the private admin experience. Keeping
    // public pages outside Routing Middleware lets Vercel serve them directly
    // from cache without spending a Clerk/Fluid Compute invocation.
    "/admin/:path*",
    "/admin-access-denied",
    "/sign-in/:path*",
    // Preserve Clerk's frontend API and session-handshake route.
    "/__clerk/:path*",
  ],
};
