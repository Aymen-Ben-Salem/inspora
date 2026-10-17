import type { Breakdown, Metrics, MetricsFilter, MetricsReport } from "./query";
import { dailyReportRows } from "./query";

const fields = ["impressions", "clicks", "ctr", "uniqueVisitors", "uniqueClickers", "frequency", "identityCoverage", "identifiedImpressions", "previewStarts", "previewViews", "progress25", "progress50", "progress75", "progress100"] as const satisfies readonly (keyof Metrics)[];
const headings = ["Impressions", "Clicks", "CTR (%)", "Unique visitors", "Unique clickers", "Frequency", "Identity coverage (%)", "Identified impressions", "Preview starts", "2-second playback", "Video 25%", "Video 50%", "Video 75%", "First-cycle completion"];
function cell(value: string | number | null | undefined) {
  let text = value == null ? "" : String(value);
  // Spreadsheet programs interpret formula-looking text even in quoted CSV.
  if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function sponsorReportCsv(report: MetricsReport, filter: MetricsFilter, labels: {
  campaigns?: Record<string, string>; versions?: Record<string, string>;
} = {}) {
  const context = [report.source, report.status, report.asOf, report.start, report.end, filter.range,
    filter.campaignId ?? "", filter.versionId ?? "", filter.placement ?? "", filter.country ?? "", filter.periodId ?? "", filter.endDate ?? ""];
  const rows: (string | number | null | undefined)[][] = [[
    "Source", "Status", "Last updated (UTC)", "Start (UTC, inclusive)", "End (UTC, exclusive)", "Range",
    "Campaign filter", "Version filter", "Placement filter", "Country filter", "Paid period filter", "End date filter",
    "Section", "Label", ...headings, "Base spend", "Spend currency", "Effective CPC", "Effective CPM",
  ]];
  function append(section: string, label: string, metrics: Metrics, summary = false) {
    rows.push([...context, section, label, ...fields.map(field => field === "identityCoverage" && metrics[field] !== null ? metrics[field]! * 100 : metrics[field]),
      summary ? report.spend?.amount : null, summary ? report.spend?.currency : null, summary ? report.cpc : null, summary ? report.cpm : null]);
  }
  append("Summary", "All matching activity", report.summary, true);
  const dimensions = ["daily", "placement", "country", "device", "referrer", "campaign", "version"] as const;
  for (const dimension of dimensions) {
    const names: Record<string, string> | undefined = dimension === "campaign" ? labels.campaigns : dimension === "version" ? labels.versions : dimension === "placement" ? { header: "Navbar", feed: "Feed", detail: "Detail sidebar" } : undefined;
    const items: Breakdown[] = dimension === "daily" ? dailyReportRows(report.daily, report.start, report.end) : report[dimension];
    for (const row of items) append(dimension, names?.[row.label] ?? row.label, row);
  }
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
