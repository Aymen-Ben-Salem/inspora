import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: vi.fn() }));
vi.mock("./report-query", () => ({ queryMetrics: vi.fn(), refreshReportMoney: vi.fn() }));
import { queryMetrics } from "./report-query";
import { withWriteTransaction } from "@/db/write-client";
import { EMPTY_COUNTS, metricsFromCounts, type MetricsReport } from "./query";
import { readMetricsReport, reportKey } from "./reports";
import { createHash } from "node:crypto";

const now = new Date("2026-10-16T12:00:00Z");
const data: MetricsReport = {
  source: "Inspora accepted events",
  status: "available",
  asOf: "2024-10-15T12:00:00Z",
  start: "2024-10-08T12:00:00Z",
  end: "2024-10-15T12:00:00Z",
  range: "7d",
  summary: metricsFromCounts({ ...EMPTY_COUNTS, impressions: 4 }),
  placement: [],
  campaign: [],
  version: [],
  country: [],
  device: [],
  referrer: [],
  daily: [],
  spend: null,
  cpc: null,
  cpm: null,
};

beforeEach(() => vi.resetAllMocks());
it("keeps historical paid-period cache keys stable and separates chosen-date reports", () => {
  const old = createHash("sha256").update(JSON.stringify(["accepted-v1", "owner", "7d", null, null, null, null, "period"])).digest("hex");
  expect(reportKey("owner", { range: "7d", periodId: "period" })).toBe(old);
  expect(reportKey("owner", { range: "7d", endDate: "2026-10-10" })).not.toBe(reportKey("owner", { range: "7d", endDate: "2026-10-11" }));
  expect(reportKey("owner", { range: "7d", endDate: "2026-10-10" })).not.toBe(reportKey("another-owner", { range: "7d", endDate: "2026-10-10" }));
  expect(reportKey("owner", { range: "7d", startDate: "2026-10-01", endDate: "2026-10-10" })).not.toBe(reportKey("owner", { range: "7d", startDate: "2026-10-02", endDate: "2026-10-10" }));
});

it("loads the comparison summary with identical ownership and dimensions", async () => {
  const tx = { execute: vi.fn(), select: () => ({ from: () => ({ where: async () => [] }) }), insert: () => ({ values: () => ({ onConflictDoUpdate: vi.fn() }) }) };
  vi.mocked(withWriteTransaction).mockImplementation(async work => work(tx as never));
  vi.mocked(queryMetrics).mockResolvedValueOnce({ ...data }).mockResolvedValueOnce({ ...data, summary: metricsFromCounts({ ...EMPTY_COUNTS, impressions: 2 }) });
  const filter = { range: "7d" as const, campaignId: "campaign", placement: "feed" as const, country: "TN" };
  const result = await readMetricsReport("owner", filter, false, now);
  expect(queryMetrics).toHaveBeenNthCalledWith(2, tx, "owner", filter, { start: "2026-10-02T12:00:00.000Z", end: "2026-10-09T12:00:00.000Z" }, now, true);
  expect(result.status !== "unavailable" && result.comparison?.summary.impressions).toBe(2);
});
it("does not query a truncated comparison outside retention", async () => {
  vi.mocked(withWriteTransaction).mockImplementation(async work => work({ execute: vi.fn(), select: () => ({ from: () => ({ where: async () => [] }) }), insert: () => ({ values: () => ({ onConflictDoUpdate: vi.fn() }) }) } as never));
  vi.mocked(queryMetrics).mockResolvedValueOnce({ ...data });
  const result = await readMetricsReport("owner", { range: "30d", startDate: "2026-07-21", endDate: "2026-08-21" }, false, now);
  expect(queryMetrics).toHaveBeenCalledTimes(1);
  expect(result.status !== "unavailable" && result.comparison).toBeNull();
});

it.each([
  ["2026-10-15T12:00:00Z", "unavailable"],
  ["2026-10-16T12:00:00Z", "unavailable"],
  ["2026-10-17T12:00:00Z", "stale"],
])(
  "respects retained report expiry during a query failure (%s)",
  async (expiresAt, status) => {
    const cached = {
      data,
      asOf: new Date(data.asOf),
      expiresAt: new Date(expiresAt),
    };
    vi.mocked(withWriteTransaction)
      .mockRejectedValueOnce(new Error("Temporary database failure"))
      .mockImplementationOnce(async (work) => work({
        select: () => ({ from: () => ({ where: async () => [cached] }) }),
      } as never));
    const result = await readMetricsReport("owner", { range: "7d" }, false, now);
    expect(result.status).toBe(status);
    if (result.status === "stale") expect(result.summary.impressions).toBe(4);
  },
);
