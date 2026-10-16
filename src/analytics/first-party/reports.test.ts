import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: vi.fn() }));
import { withWriteTransaction } from "@/db/write-client";
import { EMPTY_COUNTS, metricsFromCounts, type MetricsReport } from "./query";
import { readMetricsReport } from "./reports";

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
