import { describe, expect, it } from "vitest";

import {
  ANALYTICS_RANGES,
  createPostHogTools,
  fillDailyAnalytics,
  fillHourlyAnalytics,
  getAnalyticsEndDateKey,
  getAnalyticsRangeDayCount,
  getAnalyticsTimeRange,
  isAnalyticsRange,
  mapAnalyticsBreakdownRows,
  resolvePostHogApiHost,
  toAnalyticsNumber,
} from "./posthog-data";

describe("PostHog analytics data", () => {
  it("places yesterday before today in the dashboard range controls", () => {
    expect(ANALYTICS_RANGES.slice(0, 2)).toEqual(["yesterday", "today"]);
  });

  it("accepts only supported dashboard ranges", () => {
    expect(isAnalyticsRange("today")).toBe(true);
    expect(isAnalyticsRange("yesterday")).toBe(true);
    expect(isAnalyticsRange(7)).toBe(true);
    expect(isAnalyticsRange(30)).toBe(true);
    expect(isAnalyticsRange(90)).toBe(true);
    expect(isAnalyticsRange(14)).toBe(false);
  });

  it("uses project-midnight boundaries for today and yesterday", () => {
    expect(getAnalyticsTimeRange("today")).toEqual({
      startExpression: "toStartOfDay(now())",
    });
    expect(getAnalyticsTimeRange("yesterday")).toEqual({
      startExpression: "toStartOfDay(now()) - INTERVAL 1 DAY",
      endExpression: "toStartOfDay(now())",
    });
    expect(getAnalyticsTimeRange(7)).toEqual({
      startExpression: "now() - INTERVAL 7 DAY",
    });
  });

  it("maps calendar ranges to one chart day and selects yesterday's date", () => {
    expect(getAnalyticsRangeDayCount("today")).toBe(1);
    expect(getAnalyticsRangeDayCount("yesterday")).toBe(1);
    expect(getAnalyticsRangeDayCount(30)).toBe(30);
    expect(getAnalyticsEndDateKey("2026-08-11", "yesterday")).toBe(
      "2026-08-10",
    );
    expect(getAnalyticsEndDateKey("2026-08-11", "today")).toBe("2026-08-11");
  });

  it("fills every project-timezone hour for the activity chart", () => {
    const hourly = fillHourlyAnalytics([
      [0, "3"],
      [12, 5],
      [23, "2"],
    ]);

    expect(hourly).toHaveLength(24);
    expect(hourly[0]).toEqual({ hour: 0, uniqueVisitors: 3 });
    expect(hourly[1]).toEqual({ hour: 1, uniqueVisitors: 0 });
    expect(hourly[12]).toEqual({ hour: 12, uniqueVisitors: 5 });
    expect(hourly[23]).toEqual({ hour: 23, uniqueVisitors: 2 });
  });

  it("maps ingestion regions to their private API host", () => {
    expect(
      resolvePostHogApiHost({ ingestionHost: "https://us.i.posthog.com" }),
    ).toBe("https://us.posthog.com");
    expect(
      resolvePostHogApiHost({ ingestionHost: "https://eu.i.posthog.com" }),
    ).toBe("https://eu.posthog.com");
    expect(
      resolvePostHogApiHost({
        apiHost: "https://posthog.example.com/",
        ingestionHost: "https://us.i.posthog.com",
      }),
    ).toBe("https://posthog.example.com");
  });

  it("normalizes query numbers and fills missing days", () => {
    expect(toAnalyticsNumber("12")).toBe(12);
    expect(toAnalyticsNumber(undefined)).toBe(0);

    const daily = fillDailyAnalytics(
      [["2026-08-07", "5", 3, "2"]],
      7,
      new Date("2026-08-08T12:00:00.000Z"),
    );

    expect(daily).toHaveLength(7);
    expect(daily[5]).toEqual({
      date: "2026-08-07",
      pageviews: 5,
      uniqueVisitors: 3,
      postOpens: 2,
    });
    expect(daily[6]?.date).toBe("2026-08-08");
  });

  it("uses the PostHog project date when filling the current day", () => {
    const daily = fillDailyAnalytics([], 1, "2026-08-11");

    expect(daily).toEqual([
      {
        date: "2026-08-11",
        pageviews: 0,
        uniqueVisitors: 0,
        postOpens: 0,
      },
    ]);
  });

  it("maps ranked breakdowns with a readable fallback", () => {
    expect(
      mapAnalyticsBreakdownRows(
        [
          ["Tunisia", "8", 12],
          ["", 2, "3"],
        ],
        "Direct or unknown",
      ),
    ).toEqual([
      { label: "Tunisia", visitors: 8, pageviews: 12 },
      { label: "Direct or unknown", visitors: 2, pageviews: 3 },
    ]);
  });

  it("replaces technical breakdown labels with readable aliases", () => {
    expect(
      mapAnalyticsBreakdownRows(
        [["$direct", 379, 1500]],
        "Direct / Unknown",
        { $direct: "Direct / Unknown" },
      ),
    ).toEqual([
      { label: "Direct / Unknown", visitors: 379, pageviews: 1500 },
    ]);
  });

  it("creates project-specific links to PostHog's deeper tools", () => {
    const tools = createPostHogTools({
      apiHost: "https://eu.posthog.com/",
      projectId: "123",
    });

    expect(tools.map((tool) => tool.href)).toEqual([
      "https://eu.posthog.com/project/123/web",
      "https://eu.posthog.com/project/123/heatmaps",
      "https://eu.posthog.com/project/123/web/web-vitals",
    ]);
  });
});
