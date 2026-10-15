import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/features/admin/creator-work-repository", () => ({
  getAdminCreatorWorkPage: mocks.read,
  InvalidAdminCreatorWorkQueryError: class extends Error {},
}));
import { InvalidAdminCreatorWorkQueryError } from "@/features/admin/creator-work-repository";
import { GET } from "./route";
const creatorId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: creatorId }) };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ userId: "admin" }); mocks.read.mockResolvedValue({ items: [], nextCursor: null }); });
it("rejects unauthorized access without reading work", async () => {
  mocks.auth.mockRejectedValue(new Error("denied"));
  const response = await GET(new Request("https://example.com/admin/creators/id/works"), context);
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toContain("private, no-store");
  expect(mocks.read).not.toHaveBeenCalled();
});
it("passes the creator, search and cursor to the private work reader", async () => {
  const response = await GET(new Request("https://example.com/admin/creators/id/works?q=Blue&cursor=next"), context);
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ creatorId, query: "Blue", cursor: "next" });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
});
it("rejects malformed queries without caching the error", async () => {
  mocks.read.mockRejectedValue(new InvalidAdminCreatorWorkQueryError());
  const response = await GET(new Request("https://example.com/admin/creators/id/works?cursor=bad"), context);
  expect(response.status).toBe(400);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
