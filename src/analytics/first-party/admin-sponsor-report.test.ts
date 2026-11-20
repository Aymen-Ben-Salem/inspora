import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/sponsorship/[accountId]/analytics/route";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), account: vi.fn(), owns: vi.fn(), catalog: vi.fn(), metrics: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: mocks.account }));
vi.mock("@/features/sponsorship/analytics", () => ({
  accountOwnsReportFilters: mocks.owns, readAccountAnalyticsCatalog: mocks.catalog,
}));
vi.mock("./reports", () => ({ readMetricsReport: mocks.metrics }));

const accountId = "ca987dbb-c42a-489a-a0e1-4e85e19bdf55";
const request = (query = "") => GET(new Request(`https://example.test/api/admin/sponsorship/${accountId}/analytics?${query}`), { params: Promise.resolve({ accountId }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ id: accountId });
  mocks.owns.mockResolvedValue(true);
  mocks.metrics.mockResolvedValue({ status: "available" });
  mocks.catalog.mockResolvedValue({ campaigns: [] });
});
it("checks admin access before looking up accounts", async () => {
  mocks.admin.mockRejectedValue(new Error("Not an admin"));
  expect((await request()).status).toBe(403);
  expect(mocks.account).not.toHaveBeenCalled();
  expect(mocks.metrics).not.toHaveBeenCalled();
});
it("uses the selected account for report filters, metrics and catalog", async () => {
  const response = await request("range=7d&placement=feed&catalog=1&refresh=1");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.owns).toHaveBeenCalledWith(accountId, { range: "7d", placement: "feed" });
  expect(mocks.metrics).toHaveBeenCalledWith(accountId, { range: "7d", placement: "feed" }, true);
  expect(mocks.catalog).toHaveBeenCalledWith(accountId);
});
it.each(["foreign filter", "unknown account", "invalid filter"])("rejects %s before fetching a report", async reason => {
  if (reason === "unknown account") mocks.account.mockResolvedValue(undefined);
  if (reason === "foreign filter") mocks.owns.mockResolvedValue(false);
  expect((await request(reason === "invalid filter" ? "range=all" : "catalog=1")).status).toBe(403);
  expect(mocks.metrics).not.toHaveBeenCalled();
  expect(mocks.catalog).not.toHaveBeenCalled();
});
