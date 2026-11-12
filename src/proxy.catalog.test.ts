import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
const clerk = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => clerk }));
vi.mock("@/auth/config", () => ({ getClerkAuthorizedParties: () => [], isClerkConfigured: () => true }));
import proxy, { config } from "./proxy";

it("restricts the catalog alias across page, admin, API, static and action requests", async () => {
  const event = {} as NextFetchEvent;
  for (const path of ["/", "/admin", "/api/profile", "/_next/static/example.js", "/_next/image?url=x", "/api/inspora/catalog?path=admin", "/%61dmin"]) {
    expect((await proxy(new NextRequest("https://inspora-catalog-preview.vercel.app" + path), event))?.status).toBe(404);
  }
  expect((await proxy(new NextRequest("https://inspora-catalog-preview.vercel.app/api/inspora/catalog", { method: "POST", headers: { "next-action": "example" } }), event))?.status).toBe(404);
  expect((await proxy(new NextRequest("https://inspora-catalog-preview.vercel.app/api/inspora/catalog"), event))?.status).toBe(200);
  expect(clerk).not.toHaveBeenCalled();
  expect(config.matcher).toContainEqual({ source: "/:path*", has: [{ type: "host", value: "inspora-catalog-preview.vercel.app" }] });
  proxy(new NextRequest("https://inspora-git-preview-archive-updates-inspora.vercel.app/admin"), event);
  expect(clerk).toHaveBeenCalledOnce();
});
