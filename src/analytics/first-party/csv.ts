import type { Breakdown, Metrics, MetricsFilter, MetricsReport } from "./query";
import { dailyReportRows } from "./query";

const fields = ["impressions", "clicks", "ctr", "uniqueVisitors", "uniqueClickers"] as const satisfies readonly (keyof Metrics)[];
const headings = ["Impressions", "Clicks", "CTR (%)", "Unique visitors", "Unique clickers"];
const placements: Record<string, string> = { header: "Navbar", feed: "Feed", detail: "Detail sidebar" };
function cell(value: string | number | null | undefined) {
  let text = value == null ? "" : String(value);
  // Spreadsheet programs interpret formula-looking text even in quoted CSV.
  if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function sponsorReportCsv(report: MetricsReport, filter: MetricsFilter, labels: {
  campaigns?: Record<string, string>;
} = {}) {
  const context = [report.asOf, report.start, report.end,
    filter.campaignId ? labels.campaigns?.[filter.campaignId] ?? "Selected campaign" : "All campaigns",
    filter.placement ? placements[filter.placement] : "All placements", filter.country ?? "All countries"];
  const rows: (string | number | null | undefined)[][] = [[
    "Data as of (UTC)", "Report start (UTC)", "Report end (UTC, exclusive)",
    "Campaign filter", "Placement filter", "Country filter",
    "Breakdown", "Name or date", ...headings, "Base spend", "Currency", "Cost per click", "Cost per 1,000 impressions",
  ]];
  function append(section: string, label: string, metrics: Metrics, summary = false) {
    rows.push([...context, section, label, ...fields.map(field => metrics[field]),
      summary ? report.spend?.amount : null, summary ? report.spend?.currency : null, summary ? report.cpc : null, summary ? report.cpm : null]);
  }
  append("Summary", "All matching activity", report.summary, true);
  const dimensions = ["daily", "placement", "country", "device", "campaign"] as const;
  const breakdownNames = { daily: "Daily", placement: "Placement", country: "Country", device: "Device", campaign: "Campaign" };
  for (const dimension of dimensions) {
    const names = dimension === "campaign" ? labels.campaigns : dimension === "placement" ? placements : undefined;
    const items: Breakdown[] = dimension === "daily" ? dailyReportRows(report.daily, report.start, report.end) : report[dimension];
    for (const row of items) append(breakdownNames[dimension], names?.[row.label] ?? (dimension === "campaign" ? "Campaign" : row.label), row);
  }
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
