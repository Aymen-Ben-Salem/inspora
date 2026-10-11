import { expect, it } from "vitest";
import { allocateSpend, metricsFromCounts, rollingWindow } from "./query";
it("uses rolling UTC windows and reports same-ledger uncapped CTR with unavailable zero denominators", () => {
  expect(rollingWindow("7d", new Date("2026-11-01T02:00:00Z"))).toEqual({
    start: "2026-10-25T02:00:00.000Z",
    end: "2026-11-01T02:00:00.000Z",
  });
  const metrics = metricsFromCounts({
    impressions: 2,
    clicks: 3,
    uniqueVisitors: 1,
    uniqueClickers: 1,
    identifiedImpressions: 2,
    pageviews: 0,
    siteVisitors: 0,
    previewStarts: 0,
    previewViews: 0,
    progress25: 0,
    progress50: 0,
    progress75: 0,
    progress100: 0,
  });
  expect(metrics.ctr).toBe(150);
  expect(metrics.frequency).toBe(2);
  expect(
    metricsFromCounts({ ...metrics, impressions: 0, identifiedImpressions: 0 })
      .ctr,
  ).toBeNull();
  expect(
    metricsFromCounts({ ...metrics, identifiedImpressions: 1 }).frequency,
  ).toBeNull();
});
it("allocates one paid base fee across active campaigns without multiplying it", () => {
  const periods = [
    {
      startAt: "2026-10-01T00:00:00Z",
      endAt: "2026-10-31T00:00:00Z",
      baseAmount: 50000,
      currency: "usd",
    },
  ];
  const intervals = [
    {
      campaignId: "A",
      versionId: "v1",
      startAt: "2026-10-01T00:00:00Z",
      endAt: "2026-10-16T00:00:00Z",
    },
    {
      campaignId: "B",
      versionId: "v2",
      startAt: "2026-10-16T00:00:00Z",
      endAt: "2026-10-31T00:00:00Z",
    },
  ];
  const range = { start: periods[0].startAt, end: periods[0].endAt };
  expect(allocateSpend(periods, intervals, range, {})).toEqual({
    amount: 500,
    currency: "usd",
  });
  expect(allocateSpend(periods, intervals, range, { campaignId: "A" })).toEqual(
    { amount: 250, currency: "usd" },
  );
  expect(allocateSpend(periods, intervals, range, { campaignId: "B" })).toEqual(
    { amount: 250, currency: "usd" },
  );
});
