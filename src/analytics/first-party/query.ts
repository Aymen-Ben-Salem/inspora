import type { SponsorRange, Placement } from "./types";
export type MetricCounts = {
  impressions: number;
  clicks: number;
  uniqueVisitors: number;
  uniqueClickers: number;
  identifiedImpressions: number;
  pageviews: number;
  siteVisitors: number;
  previewStarts: number;
  previewViews: number;
  progress25: number;
  progress50: number;
  progress75: number;
  progress100: number;
};
export type Metrics = MetricCounts & {
  ctr: number | null;
  frequency: number | null;
  identityCoverage: number | null;
};
export type MetricsFilter = {
  range: SponsorRange;
  campaignId?: string;
  versionId?: string;
  placement?: Placement;
  country?: string;
  periodId?: string;
};
export type Breakdown = Metrics & { label: string };
export type MetricsReport = {
  source: "Inspora accepted events";
  status: "available" | "stale";
  asOf: string;
  start: string;
  end: string;
  range: SponsorRange;
  summary: Metrics;
  placement: Breakdown[];
  campaign: Breakdown[];
  version: Breakdown[];
  country: Breakdown[];
  device: Breakdown[];
  referrer: Breakdown[];
  daily: Breakdown[];
  spend: { amount: number; currency: string } | null;
  cpc: number | null;
  cpm: number | null;
};
export type ReportResult =
  MetricsReport | { status: "unavailable"; source: "Inspora accepted events" };
export const EMPTY_COUNTS: MetricCounts = {
  impressions: 0,
  clicks: 0,
  uniqueVisitors: 0,
  uniqueClickers: 0,
  identifiedImpressions: 0,
  pageviews: 0,
  siteVisitors: 0,
  previewStarts: 0,
  previewViews: 0,
  progress25: 0,
  progress50: 0,
  progress75: 0,
  progress100: 0,
};
export function metricsFromCounts(c: MetricCounts): Metrics {
  return {
    ...c,
    ctr: c.impressions ? (c.clicks / c.impressions) * 100 : null,
    frequency:
      c.impressions &&
      c.identifiedImpressions === c.impressions &&
      c.uniqueVisitors
        ? c.impressions / c.uniqueVisitors
        : null,
    identityCoverage: c.impressions
      ? c.identifiedImpressions / c.impressions
      : null,
  };
}
export function rollingWindow(range: SponsorRange, now: Date) {
  const days = range === "1d" ? 1 : range === "7d" ? 7 : 30;
  return {
    start: new Date(now.getTime() - days * 86400000).toISOString(),
    end: now.toISOString(),
  };
}
type SpendPeriod = {
  startAt: string;
  endAt: string;
  baseAmount: number | null;
  currency: string;
};
type ActiveInterval = {
  startAt: string;
  endAt: string | null;
  campaignId: string;
  versionId: string;
};
export function allocateSpend(
  periods: SpendPeriod[],
  intervals: ActiveInterval[],
  window: { start: string; end: string },
  filter: Pick<
    MetricsFilter,
    "campaignId" | "versionId" | "placement" | "country"
  >,
) {
  // Seat cost cannot be apportioned honestly to country or placement.
  if (
    filter.country ||
    filter.placement ||
    !periods.length ||
    !intervals.length
  )
    return null;
  const currencies = new Set(periods.map((p) => p.currency));
  if (currencies.size !== 1) return null;
  let amount = 0;
  for (const p of periods)
    for (const i of intervals) {
      if (
        (filter.campaignId && filter.campaignId !== i.campaignId) ||
        (filter.versionId && filter.versionId !== i.versionId)
      )
        continue;
      const duration = Math.max(
        0,
        Math.min(
          Date.parse(window.end),
          Date.parse(p.endAt),
          i.endAt ? Date.parse(i.endAt) : Infinity,
        ) -
          Math.max(
            Date.parse(window.start),
            Date.parse(p.startAt),
            Date.parse(i.startAt),
          ),
      );
      if (duration === 0) continue;
      if (p.baseAmount === null) return null;
      amount +=
        ((p.baseAmount / 100) * duration) /
        (Date.parse(p.endAt) - Date.parse(p.startAt));
    }
  return { amount, currency: periods[0].currency };
}
