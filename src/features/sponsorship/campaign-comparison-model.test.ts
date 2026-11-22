import { expect, it } from "vitest";
import { bestCampaign, compareCampaigns } from "./campaign-comparison-model";

const now = new Date("2026-11-22T12:00:00Z");
const at = (value: string) => new Date(value);
const counts = (impressions: number, clicks: number, previewStarts = 0, completions = 0) => ({ impressions, clicks, uniqueVisitors: Math.round(impressions / 2), previewStarts, completions });

it("measures each campaign only while it was live and compares by rate", () => {
  const rows = compareCampaigns({
    now,
    campaigns: [{ id: "autumn", title: "Autumn", live: false }, { id: "dark", title: "Dark", live: false }, { id: "current", title: "Current", live: true }, { id: "draft", title: "Never public", live: false }],
    intervals: [
      { campaignId: "autumn", startAt: at("2026-10-01T00:00:00Z"), endAt: at("2026-10-11T00:00:00Z") },
      { campaignId: "dark", startAt: at("2026-10-11T00:00:00.004Z"), endAt: at("2026-11-20T12:00:00Z") },
      { campaignId: "current", startAt: at("2026-11-20T12:00:00.003Z"), endAt: at("2026-11-21T12:00:00Z") },
      { campaignId: "current", startAt: at("2026-11-21T12:00:00.004Z"), endAt: null },
    ],
    counts: { autumn: counts(10000, 100, 3000, 900), dark: counts(40000, 800, 12000, 4800), current: counts(3000, 75) },
  });
  expect(rows.map(row => row.campaignId)).toEqual(["current", "dark", "autumn"]);
  const [current, dark, autumn] = rows;
  expect(current).toMatchObject({ live: true, runs: [{ start: "2026-11-20T12:00:00.003Z", end: null }], ctr: 2.5, earlyData: false });
  expect(current.activeDays).toBeCloseTo(2);
  expect(current.impressionsPerDay).toBeCloseTo(1500);
  expect(autumn).toMatchObject({ activeDays: 10, impressionsPerDay: 1000, ctr: 1, completionRate: 30 });
  expect(dark.completionRate).toBe(40);
  expect(bestCampaign(rows, "impressionsPerDay")).toBe("current");
  expect(bestCampaign(rows, "ctr")).toBe("current");
  expect(bestCampaign(rows, "completionRate")).toBe("dark");
});

it("clips runs to the 90-day window, flags early data and skips best with one comparable campaign", () => {
  const rows = compareCampaigns({
    now,
    campaigns: [{ id: "old", title: "Old", live: false }, { id: "new", title: "New", live: true }],
    intervals: [
      { campaignId: "old", startAt: at("2026-08-01T00:00:00Z"), endAt: at("2026-08-30T00:00:00Z") },
      { campaignId: "new", startAt: at("2026-11-22T11:30:00Z"), endAt: null },
    ],
    counts: { old: counts(5000, 50), new: counts(40, 1) },
  });
  expect(rows.map(row => row.campaignId)).toEqual(["new", "old"]);
  expect(rows[1].runs[0].start).toBe("2026-08-24T12:00:00.000Z");
  expect(rows[0]).toMatchObject({ earlyData: true, impressionsPerDay: null });
  expect(bestCampaign(rows, "ctr")).toBeNull();
});

it("does not crown a winner when the leaders are effectively tied", () => {
  const rows = compareCampaigns({
    now,
    campaigns: [{ id: "a", title: "A", live: false }, { id: "b", title: "B", live: true }],
    intervals: [
      { campaignId: "a", startAt: at("2026-10-01T00:00:00Z"), endAt: at("2026-10-11T00:00:00Z") },
      { campaignId: "b", startAt: at("2026-11-12T12:00:00Z"), endAt: null },
    ],
    counts: { a: counts(10000, 150, 4000, 1200), b: counts(10000, 151, 4000, 1202) },
  });
  expect(bestCampaign(rows, "ctr")).toBeNull();
  expect(bestCampaign(rows, "completionRate")).toBeNull();
});
