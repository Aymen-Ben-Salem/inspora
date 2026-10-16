import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/analytics/creator-views", () => ({ getCreatorViews: vi.fn() }));
vi.mock("@/features/creators/identity", () => ({ getCreatorSummary: vi.fn() }));
import { getCreatorViews } from "@/analytics/creator-views";
import { getCreatorSummary } from "@/features/creators/identity";
import { GET } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const request = new Request("https://inspora.test/api/creators/" + id + "/views");
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCreatorSummary).mockResolvedValue({ id, username: "creator" } as never);
});
it.each(["available", "stale"] as const)("returns the %s aggregate without extra HTTP caching", async (status) => {
  const result = { status, count: 3, asOf: "2026-10-16T12:00:00Z" };
  vi.mocked(getCreatorViews).mockResolvedValue(result);
  const response = await GET(request, { params: Promise.resolve({ id }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(await response.json()).toEqual(result);
  expect(getCreatorViews).toHaveBeenCalledWith(id);
});
it("rejects invalid IDs without querying the provider", async () => {
  const response = await GET(request, { params: Promise.resolve({ id: "invalid" }) });
  expect(response.status).toBe(400);
  expect(getCreatorViews).not.toHaveBeenCalled();
});
it("returns unavailable rather than inventing a zero on failure", async () => {
  vi.mocked(getCreatorViews).mockResolvedValue({ status: "unavailable" });
  const response = await GET(request, { params: Promise.resolve({ id }) });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable", checkedAt: expect.any(String) });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("does not aggregate or create snapshots for nonexistent creator IDs", async () => {
  vi.mocked(getCreatorSummary).mockResolvedValue(null);
  const response = await GET(request, { params: Promise.resolve({ id }) });
  expect(response.status).toBe(404);
  expect(getCreatorViews).not.toHaveBeenCalled();
});
it("reports database lookup failures as unavailable", async () => {
  vi.mocked(getCreatorSummary).mockRejectedValue(new Error("offline"));
  const response = await GET(request, { params: Promise.resolve({ id }) });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable", checkedAt: expect.any(String) });
  expect(getCreatorViews).not.toHaveBeenCalled();
});
