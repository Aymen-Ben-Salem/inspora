import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), generate: vi.fn(), decision: vi.fn() }));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("./editorial-service", () => ({ generateEditorial: mocks.generate }));
vi.mock("./editorial-review", () => ({ recordEditorialDecision: mocks.decision }));
import { POST } from "@/app/api/admin/editorial/route";
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ userId: "admin" }); mocks.generate.mockResolvedValue({ id: "proposal" }); });
const request = (origin = "https://www.inspora.design", body = "{}") => new Request("https://www.inspora.design/api/admin/editorial", { method: "POST", headers: { origin }, body });
it("authenticates before parsing or calling the paid service", async () => {
  mocks.auth.mockRejectedValue(new Error("private auth detail"));
  expect((await POST(request())).status).toBe(403);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("rejects cross-origin and oversized requests and hides provider details", async () => {
  expect((await POST(request("https://other.example"))).status).toBe(403);
  expect(mocks.auth).not.toHaveBeenCalled();
  expect((await POST(request(undefined, "x".repeat(3_800_001)))).status).toBe(413);
  expect(mocks.generate).not.toHaveBeenCalled();
  mocks.generate.mockRejectedValue(new Error("postgresql://secret"));
  const result = await POST(request()); expect(await result.text()).not.toContain("secret");
  expect(result.headers.get("cache-control")).toBe("private, no-store");
});
