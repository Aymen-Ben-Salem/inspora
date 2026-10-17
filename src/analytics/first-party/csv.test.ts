import { expect, it } from "vitest";
import { sponsorReportCsv } from "./csv";
import { EMPTY_COUNTS, metricsFromCounts, type MetricsReport } from "./query";

const metrics = metricsFromCounts({ ...EMPTY_COUNTS, impressions: 10, clicks: 2, uniqueVisitors: 5, identifiedImpressions: 10 });
const report: MetricsReport = {
  source: "Inspora accepted events", status: "stale", asOf: "2026-10-16T12:00:00Z",
  start: "2026-10-10T00:00:00Z", end: "2026-10-13T00:00:00Z", range: "7d", summary: metrics,
  daily: [{ label: "2026-10-10", ...metrics }], placement: [{ label: "feed", ...metrics }],
  country: [], device: [], referrer: [], version: [], campaign: [{ label: "campaign-a", ...metrics }],
  spend: { currency: "eur", amount: 45 }, cpc: 22.5, cpm: 4500,
};
it("exports displayed totals, known empty days, breakdown labels and exact report context", () => {
  const csv = sponsorReportCsv(report, { range: "7d", campaignId: "campaign-a", endDate: "2026-10-12" }, { campaigns: { "campaign-a": 'Brand, "quoted"\nsecond line' } });
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain('"stale","2026-10-16T12:00:00Z"');
  expect(csv).toContain('"7d","campaign-a","","","","","2026-10-12"');
  expect(csv).toContain('"Summary","All matching activity","10","2","20","5","0","2","100"');
  expect(csv).toContain('"45","eur","22.5","4500"');
  expect(csv).toContain('"daily","2026-10-11","0","0",""');
  expect(csv).toContain('"daily","2026-10-12","0","0",""');
  expect(csv).toContain('"placement","Feed"');
  expect(csv).toContain('"campaign","Brand, ""quoted""\nsecond line"');
});
it.each(["=HYPERLINK(1)", "+SUM(1)", "-1+1", "@SUM(1)", " \t=SUM(1)", "\n=SUM(1)"])("neutralizes spreadsheet formulas in exported labels (%j)", title => {
  const csv = sponsorReportCsv(report, { range: "7d" }, { campaigns: { "campaign-a": title } });
  expect(csv).toContain(`"campaign","'${title}"`);
});
it("keeps unavailable spend and rates empty rather than changing them to zero", () => {
  const csv = sponsorReportCsv({ ...report, summary: metricsFromCounts(EMPTY_COUNTS), spend: null, cpc: null, cpm: null }, { range: "7d" });
  const summary = csv.split("\r\n")[1];
  expect(summary).toContain('"Summary","All matching activity","0","0",""');
  expect(summary.endsWith(',"","","",""')).toBe(true);
});
