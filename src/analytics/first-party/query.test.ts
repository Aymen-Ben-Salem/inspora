import { expect, it } from "vitest";
import { allocateSpend, metricsFromCounts, rollingWindow, reportWindow, comparisonWindow, metricChange } from "./query";
it("includes both selected UTC dates and caps today at the current time", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  expect(reportWindow({ range: "30d", startDate: "2026-10-03", endDate: "2026-10-05" }, now)).toEqual({ start: "2026-10-03T00:00:00.000Z", end: "2026-10-06T00:00:00.000Z" });
  expect(reportWindow({ range: "30d", startDate: "2026-10-17", endDate: "2026-10-17" }, now)).toEqual({ start: "2026-10-17T00:00:00.000Z", end: now.toISOString() });
  for (const [startDate, endDate] of [["2026-10-10", "2026-10-09"], ["2026-10-17", "2026-10-18"], ["2026-01-01", "2026-10-10"], ["2026-09-31", "2026-10-10"], ["2026-10-01", undefined]]) {
    expect(() => reportWindow({ range: "30d", startDate, endDate }, now)).toThrow();
  }
});
it("compares equal non-overlapping periods and refuses pruned history", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  expect(comparisonWindow(rollingWindow("7d", now), now)).toEqual({ start: "2026-10-03T12:00:00.000Z", end: "2026-10-10T12:00:00.000Z" });
  expect(comparisonWindow({ start: "2026-07-20T00:00:00Z", end: "2026-08-20T00:00:00Z" }, now)).toBeNull();
  expect(metricChange(121, 100)).toBe(21);
  expect(metricChange(75, 100)).toBe(-25);
  expect(metricChange(100, 100)).toBe(0);
  expect(metricChange(10, 0)).toBeNull();
  expect(metricChange(0, 0)).toBeNull();
  expect(metricChange(null, 10)).toBeNull();
  expect(metricChange(10, undefined)).toBeNull();
});
it("loads a UTC window ending on a selected date and clips to retained detail", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  expect(reportWindow({ range: "7d", endDate: "2026-10-10" }, now)).toEqual({ start: "2026-10-04T00:00:00.000Z", end: "2026-10-11T00:00:00.000Z" });
  expect(reportWindow({ range: "1d", endDate: "2026-10-17" }, now).end).toBe(now.toISOString());
  const oldest = new Date(now.getTime() - 89 * 86400000).toISOString().slice(0, 10);
  expect(Date.parse(reportWindow({ range: "30d", endDate: oldest }, now).start)).toBe(now.getTime() - 90 * 86400000);
  for (const endDate of ["2026-02-30", "2026-10-18", "2020-01-01", "invalid"]) {
    expect(() => reportWindow({ range: "7d", endDate }, now)).toThrow();
  }
  expect(() => reportWindow({ range: "7d", endDate: "2026-10-10", periodId: "period" }, now)).toThrow();
});
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
it("does not turn an unknown refund tax split into zero spend", () => {
  const window = { start: "2026-10-01T00:00:00Z", end: "2026-10-31T00:00:00Z" };
  expect(allocateSpend([{ startAt: window.start, endAt: window.end, baseAmount: null, currency: "usd" }],
    [{ campaignId: "A", versionId: "v1", startAt: window.start, endAt: window.end }], window, {})).toBeNull();
});
