import { expect, it, vi } from "vitest";
import { ensureDevRoutes } from "./dev-route-check.mjs";

it("repairs a missing boot route and verifies both API handlers before claiming recovery", async () => {
  let repaired = false;
  const touch = vi.fn(async () => { repaired = true; });
  const request = vi.fn(async url => ({ status: !repaired && url.endsWith("/analytics") ? 404 : 204 }));
  expect(await ensureDevRoutes({ port: 3000, request, touch, wait: async () => {} })).toEqual({ ready: true, recovered: true });
  expect(touch).toHaveBeenCalledOnce();
  expect(request.mock.calls.every(([url, options]) => url.startsWith("http://localhost:3000/") && options.method === "OPTIONS")).toBe(true);
});
it.each([204, 403, 503])("does not touch application files for a non-missing route response (%s)", async status => {
  const touch = vi.fn();
  const result = await ensureDevRoutes({ port: 3000, request: async () => ({ status }), touch, wait: async () => {} });
  expect(touch).not.toHaveBeenCalled();
  expect(result).toEqual({ ready: status === 204, recovered: false });
});
it("does not report recovery when the timestamp event fails to repair discovery", async () => {
  const touch = vi.fn();
  expect(await ensureDevRoutes({ port: 3000, request: async () => ({ status: 404 }), touch, wait: async () => {} })).toEqual({ ready: false, recovered: false });
  expect(touch).toHaveBeenCalledOnce();
});
it("stops readiness work when the development server exits", async () => {
  const controller = new AbortController(), request = vi.fn(), touch = vi.fn();
  expect(await ensureDevRoutes({ port: 3000, signal: controller.signal, request, touch,
    wait: async () => { controller.abort(); } })).toEqual({ ready: false, recovered: false });
  expect(request).not.toHaveBeenCalled();
  expect(touch).not.toHaveBeenCalled();
});
