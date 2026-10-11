import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const read = vi.hoisted(() => vi.fn());
vi.mock("@/features/sponsorship/security", () => ({
  readSponsorSecurity: read,
}));
import { GET } from "./route";
beforeEach(() => vi.resetAllMocks());
it("returns only the private security state, without user IDs or authentication secrets", async () => {
  read.mockResolvedValue({ state: "setup_required", userId: "private-owner" });
  const response = await GET();
  expect(await response.json()).toEqual({ state: "setup_required" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("fails closed if the authentication provider cannot be checked", async () => {
  read.mockRejectedValue(new Error("provider unavailable"));
  expect((await GET()).status).toBe(503);
});
