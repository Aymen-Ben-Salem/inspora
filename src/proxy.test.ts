import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/config", () => ({
  getClerkAuthorizedParties: () => [],
  isClerkConfigured: () => true,
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => vi.fn() }));

import { config } from "./proxy";

function matches(pathname: string) {
  return unstable_doesMiddlewareMatch({
    config,
    url: `https://www.inspora.design${pathname}`,
  });
}

describe("Clerk proxy routing", () => {
  it.each([
    "/admin",
    "/admin/posts",
    "/admin/posts/new",
    "/admin/analytics/live",
    "/admin/subscribers/export",
    "/admin-access-denied",
    "/sign-in",
    "/sign-in/factor-one",
    "/__clerk/v1/client",
  ])("runs Clerk for %s", (pathname) => {
    expect(matches(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/posts/example",
    "/api/posts",
    "/api/subscribe",
    "/icon.svg",
    "/_next/static/app.js",
  ])("bypasses Clerk for %s", (pathname) => {
    expect(matches(pathname)).toBe(false);
  });
});
