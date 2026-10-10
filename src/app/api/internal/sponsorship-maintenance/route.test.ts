import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ run: vi.fn(), authorized: vi.fn() }));
vi.mock("@/features/sponsorship/jobs", () => ({
  runSponsorMaintenance: mocks.run,
  sponsorMaintenanceAuthorized: mocks.authorized,
}));
import { GET } from "./route";
beforeEach(() => vi.resetAllMocks());
it("denies missing credentials before any maintenance work", async () => {
  expect(
    (
      await GET(
        new Request("http://localhost/api/internal/sponsorship-maintenance"),
      )
    ).status,
  ).toBe(401);
  expect(mocks.run).not.toHaveBeenCalled();
});
it("drains durable work for an authenticated operator even with writes disabled", async () => {
  mocks.authorized.mockReturnValue(true);
  mocks.run.mockResolvedValue({ completed: 2, pending: 1 });
  const r = await GET(
    new Request("http://localhost/api/internal/sponsorship-maintenance", {
      headers: { authorization: "Bearer fixture" },
    }),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
});
