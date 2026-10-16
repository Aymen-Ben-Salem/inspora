import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

import { getAdminAnalytics, getLiveVisitorAnalytics } from "./posthog-repository";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T23:59:59.123Z"));
  vi.stubEnv("DATA_ENVIRONMENT", "development");
  vi.stubEnv("POSTHOG_API_HOST", "https://analytics.test");
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "test-read-key");
  vi.stubEnv("POSTHOG_PROJECT_ID", "test-project");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("keeps summary and daily activity on the same seven UTC calendar dates", async () => {
  fetchMock.mockImplementation(async (_url, options) => {
    // Eight concurrent requests can straddle midnight or receive new events.
    vi.advanceTimersByTime(1000);
    const { query } = JSON.parse(options.body);
    const rows = query.name === "Inspora admin summary"
      ? [[5, 3, 2, 1, 0, "2026-10-16"]]
      : query.name === "Inspora admin daily activity"
        ? [["2026-10-10", 4, 2, 2], ["2026-10-16", 1, 1, 0]]
        : query.name === "Inspora average visit duration" ? [[null]] : [];
    return { ok: true, json: async () => ({ results: rows }) };
  });
  const result = await getAdminAnalytics(7);
  expect(result.generatedAt).toBe("2026-10-16T23:59:59.123Z");
  expect(result.daily[0].date).toBe("2026-10-10");
  expect(result.daily.reduce((sum, day) => sum + day.pageviews, 0)).toBe(result.summary.pageviews);
  expect(result.summary.averageDailyVisitors).toBe(3 / 7);
  const requests = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body));
  for (const request of requests) {
    expect(request.query.values).toEqual({ report_time: result.generatedAt });
    expect(request.query.query).toContain("timestamp >= toStartOfDay(toTimeZone(parseDateTimeBestEffort({report_time}), 'UTC')) - INTERVAL 6 DAY");
    expect(request.query.query).toContain("timestamp < parseDateTimeBestEffort({report_time})");
    expect(request.query.query).not.toContain("now()");
    expect(request.refresh).toBe("force_blocking");
  }
  expect(requests.find(request => request.query.name === "Inspora admin summary").query.query)
    .toContain("toDate(toTimeZone(parseDateTimeBestEffort({report_time}), 'UTC'))");
  expect(requests.find(request => request.query.name === "Inspora admin daily activity").query.query)
    .toContain("toDate(toTimeZone(timestamp, 'UTC'))");
  expect(requests.find(request => request.query.name === "Inspora admin hourly activity").query.query)
    .toContain("toHour(toTimeZone(timestamp, 'UTC'))");
});

it("recomputes the live window instead of relabeling a provider-cached count as fresh", async () => {
  fetchMock.mockImplementation(async () => {
    vi.advanceTimersByTime(3000);
    return { ok: true, json: async () => ({ results: [[4]] }) };
  });
  const result = await getLiveVisitorAnalytics();
  expect(result).toMatchObject({ count: 4, windowMinutes: 2, generatedAt: "2026-10-16T23:59:59.123Z" });
  const request = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(request.refresh).toBe("force_blocking");
  expect(request.query.values).toEqual({ report_time: result.generatedAt });
  expect(request.query.query).toContain("timestamp >= parseDateTimeBestEffort({report_time}) - INTERVAL 2 MINUTE");
  expect(request.query.query).toContain("timestamp < parseDateTimeBestEffort({report_time})");
});

it("propagates provider failure instead of reporting a measured zero", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 503 });
  await expect(getLiveVisitorAnalytics()).rejects.toThrow("status 503");
});

function mockAdminRows(overrides: Record<string, unknown[][]> = {}) {
  fetchMock.mockImplementation(async (_url, options) => {
    const { query } = JSON.parse(options.body);
    const results = overrides[query.name] ?? (
      query.name === "Inspora admin summary" ? [[0, "0", 0, "0", 0]]
        : query.name === "Inspora average visit duration" ? [[null]] : []
    );
    return { ok: true, json: async () => ({ results }) };
  });
}

it.each([
  { label: "missing aggregate", rows: [] },
  { label: "missing counts", rows: [[]] },
  { label: "incomplete counts", rows: [[0, 0, 0, 0]] },
  { label: "invalid count", rows: [[0, "unknown", 0, 0, 0]] },
  { label: "negative count", rows: [[0, 0, -1, 0, 0]] },
  { label: "fractional count", rows: [[0, 0, 0, 1.5, 0]] },
  { label: "unsafe count", rows: [[0, 0, 0, 0, Number.MAX_SAFE_INTEGER + 1]] },
])("rejects a summary with $label instead of confirming zero", async ({ rows }) => {
  mockAdminRows({ "Inspora admin summary": rows });
  await expect(getAdminAnalytics(7)).rejects.toThrow("unexpected");
});

it.each([
  { label: "missing aggregate", rows: [] },
  { label: "missing count", rows: [[]] },
  { label: "null count", rows: [[null]] },
  { label: "empty count", rows: [[""]] },
  { label: "nonnumeric count", rows: [["unknown"]] },
  { label: "negative count", rows: [[-1]] },
  { label: "fractional count", rows: [[1.5]] },
  { label: "unsafe count", rows: [["9007199254740992"]] },
])("rejects live visitors with $label instead of confirming zero", async ({ rows }) => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: rows }) });
  await expect(getLiveVisitorAnalytics()).rejects.toThrow("unexpected");
});

it.each([
  { query: "Inspora admin daily activity", rows: [["2026-10-16", 0, null, 0]] },
  { query: "Inspora admin hourly activity", rows: [[12, "unknown"]] },
  { query: "Inspora admin top posts", rows: [["id", "Title", "slug", -1]] },
  { query: "Inspora admin top referrers", rows: [["$direct", 1]] },
  { query: "Inspora admin top devices", rows: [["Desktop", "", 0]] },
  { query: "Inspora admin top browsers", rows: [["Chrome", 0.5, 1]] },
])("rejects malformed counts in $query", async ({ query, rows }) => {
  mockAdminRows({ [query]: rows });
  await expect(getAdminAnalytics(7)).rejects.toThrow("unexpected");
});

it.each([
  { rows: [] }, { rows: [[]] }, { rows: [[-1]] }, { rows: [["unknown"]] },
])("rejects a missing or invalid duration aggregate ($rows)", async ({ rows }) => {
  mockAdminRows({ "Inspora average visit duration": rows });
  await expect(getAdminAnalytics(7)).rejects.toThrow("unexpected");
});

it("preserves measured zeros, absent chart dates, and a legitimate NULL average duration", async () => {
  mockAdminRows();
  const report = await getAdminAnalytics(7);
  expect(report.summary).toEqual({
    pageviews: 0, uniqueVisitors: 0, averageDailyVisitors: 0,
    averageVisitDurationSeconds: 0, postOpens: 0, sourceClicks: 0, subscriptions: 0,
  });
  expect(report.daily).toHaveLength(7);
  expect(report.daily.every(day => day.pageviews === 0 && day.uniqueVisitors === 0)).toBe(true);
  expect(report.hourlyActivity).toHaveLength(24);
  expect(report.hourlyActivity.every(hour => hour.uniqueVisitors === 0)).toBe(true);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [["0"]] }) });
  expect(await getLiveVisitorAnalytics()).toMatchObject({ count: 0 });
});
