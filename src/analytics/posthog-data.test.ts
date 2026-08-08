import { describe, expect, it } from "vitest";

import {
  fillDailyAnalytics,
  isAnalyticsRange,
  resolvePostHogApiHost,
  toAnalyticsNumber,
} from "./posthog-data";

describe("PostHog analytics data", () => {
  it("accepts only supported dashboard ranges", () => {
    expect(isAnalyticsRange(7)).toBe(true);
    expect(isAnalyticsRange(30)).toBe(true);
    expect(isAnalyticsRange(90)).toBe(true);
    expect(isAnalyticsRange(14)).toBe(false);
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
});
