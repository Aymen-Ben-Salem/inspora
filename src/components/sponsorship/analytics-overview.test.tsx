import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DeliveryChart, MetricCard } from "./analytics-overview";
import { EMPTY_COUNTS, metricsFromCounts } from "@/analytics/first-party/query";

it("plots sparse activity on its UTC dates and includes confirmed empty days", () => {
  const rows = [
    { label: "2026-07-01", ...metricsFromCounts({ ...EMPTY_COUNTS, impressions: 10 }) },
    { label: "2026-07-02", ...metricsFromCounts({ ...EMPTY_COUNTS, impressions: 20 }) },
    { label: "2026-07-30 00:00:00", ...metricsFromCounts({ ...EMPTY_COUNTS, impressions: 5 }) },
  ];
  const html = renderToStaticMarkup(<DeliveryChart rows={rows} start="2026-07-01T00:00:00Z" end="2026-07-31T00:00:00Z" />);
  const points = html.match(/points="([^"]+)"/)![1].split(" ").map(point => point.split(",").map(Number));
  expect(points).toHaveLength(30);
  expect(points[1][0]).toBeCloseTo(46.20689655);
  expect(points[2][1]).toBe(180);
  expect(points[29][0]).toBe(780);
  expect(html).toContain("2026-07-30");
  expect(html).toContain("5 impressions");
  expect(html).toContain('dateTime="2026-07-30"');
  expect(html).not.toContain("<table");
});
it.each([[121, 100, "+21%"], [75, 100, "-25%"], [100, 100, "0%"], [1, 0, "No activity in previous period"], [5, undefined, "Comparison unavailable"]])("renders honest change indicators (%s, %s)", (value, previous, expected) => {
  const html = renderToStaticMarkup(<MetricCard label="Impressions" icon="eye" value={value as number} previous={previous as number | undefined} comparisonLabel="vs. previous 7 days" />);
  expect(html).toContain(expected);
  expect(html).not.toContain("Infinity");
});
it.each([
  ["2026-07-01T12:00:00Z", "2026-07-02T12:00:00Z", 2, "2026-07-02"],
  ["2026-07-01T12:00:00Z", "2026-07-02T00:00:00Z", 1, "2026-07-01"],
])("retains partial UTC boundary days and excludes the range end (%s, %s)", (start, end, count, last) => {
  const html = renderToStaticMarkup(<DeliveryChart rows={[]} start={String(start)} end={String(end)} />);
  expect(html.match(/points="([^"]+)"/)![1].split(" ")).toHaveLength(Number(count));
  expect(html).toContain(last);
  expect(html).toContain("0 impressions");
  expect(html).toContain("0 clicks");
  expect(html).not.toContain("2026-07-03");
});
