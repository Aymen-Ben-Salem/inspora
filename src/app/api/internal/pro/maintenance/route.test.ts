import { beforeEach, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ enabled: true, configured: true, authorized: true, installed: true, maintenance: vi.fn(), withTx: vi.fn() }));
vi.mock("@/features/sponsorship/jobs", () => ({ sponsorMaintenanceAuthorized: () => deps.authorized }));
vi.mock("@/features/pro/config", () => ({ proFeatureEnabled: () => deps.enabled, proStripeConfig: () => deps.configured ? {} : null }));
vi.mock("@/features/pro/repository", () => ({ proRecoverySchemaInstalled: () => deps.installed }));
vi.mock("@/features/pro/server", () => ({ proService: () => ({ maintenance: deps.maintenance }), withProTransaction: (work: () => unknown) => { deps.withTx(); return work(); } }));
import { GET } from "./route";

const request = () => new Request("https://preview.example/api/internal/pro/maintenance", { headers: { Authorization: "Bearer test-cron" } });
beforeEach(() => { vi.clearAllMocks(); deps.enabled = true; deps.configured = true; deps.authorized = true; deps.installed = true; deps.maintenance.mockResolvedValue(undefined); });

it("authenticates before recovery/configuration/database work", async () => {
  deps.authorized = false;
  expect((await GET(request())).status).toBe(401);
  expect(deps.withTx).not.toHaveBeenCalled();
  expect(deps.maintenance).not.toHaveBeenCalled();
});

it("requires dedicated Pro configuration even for authenticated recovery", async () => {
  deps.configured = false;
  expect((await GET(request())).status).toBe(404);
  expect(deps.withTx).not.toHaveBeenCalled();
});

it("recovers pending closures whether or not the Pro UI is enabled", async () => {
  deps.enabled = false;
  expect((await GET(request())).status).toBe(200);
  deps.enabled = true;
  expect((await GET(request())).status).toBe(200);
  expect(deps.maintenance).toHaveBeenCalledTimes(2);
});

it("is a migration-safe recovery no-op before Pro tables exist", async () => {
  deps.enabled = false; deps.installed = false;
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, skipped: true });
  expect(deps.maintenance).not.toHaveBeenCalled();
});

it("fails closed when an enabled deployment lacks its Pro schema", async () => {
  deps.installed = false;
  expect((await GET(request())).status).toBe(503);
  expect(deps.maintenance).not.toHaveBeenCalled();
});

it("reports recovery failures for retry", async () => {
  deps.maintenance.mockRejectedValue(new Error("Provider unavailable"));
  expect((await GET(request())).status).toBe(503);
});
