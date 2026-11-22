import { campaignRuns, type CampaignRun } from "./campaign-runs";

const DAY = 86400000;
/** Detailed events are kept for 90 days, so comparisons cover that window. */
export const COMPARISON_RETENTION_DAYS = 90;
/** Below this, CTR and per-day rates swing too much to compare fairly. */
export const EARLY_DATA_IMPRESSIONS = 1000;

export type CampaignCounts = {
  impressions: number;
  clicks: number;
  uniqueVisitors: number;
  previewStarts: number;
  completions: number;
};
export type CampaignComparisonRow = CampaignCounts & {
  campaignId: string;
  title: string;
  live: boolean;
  /** Live periods within the retained window, newest first. */
  runs: { start: string; end: string | null }[];
  activeDays: number;
  impressionsPerDay: number | null;
  ctr: number | null;
  completionRate: number | null;
  earlyData: boolean;
};

const EMPTY: CampaignCounts = { impressions: 0, clicks: 0, uniqueVisitors: 0, previewStarts: 0, completions: 0 };

/**
 * One row per campaign, measured only while that campaign was public, so
 * campaigns of different lengths compare by rate rather than by date range.
 */
export function compareCampaigns(input: {
  campaigns: { id: string; title: string; live: boolean }[];
  intervals: { campaignId: string; startAt: Date; endAt: Date | null }[];
  counts: Record<string, CampaignCounts>;
  now: Date;
}): CampaignComparisonRow[] {
  const windowStart = input.now.getTime() - COMPARISON_RETENTION_DAYS * DAY;
  const runs = campaignRuns(input.intervals);
  const rows: CampaignComparisonRow[] = [];
  for (const campaign of input.campaigns) {
    const own: CampaignRun[] = runs.filter(run =>
      run.campaignId === campaign.id && (run.end === null || Date.parse(run.end) > windowStart));
    if (!own.length) continue;
    const clipped = own.map(run => ({
      start: new Date(Math.max(Date.parse(run.start), windowStart)).toISOString(),
      end: run.end,
    }));
    const activeMs = clipped.reduce((sum, run) =>
      sum + Math.max(0, Math.min(run.end ? Date.parse(run.end) : input.now.getTime(), input.now.getTime()) - Date.parse(run.start)), 0);
    const activeDays = activeMs / DAY;
    const counts = input.counts[campaign.id] ?? EMPTY;
    rows.push({
      campaignId: campaign.id,
      title: campaign.title,
      live: campaign.live && clipped.some(run => run.end === null),
      runs: clipped,
      activeDays,
      ...counts,
      // Rates over under an hour of delivery would be noise.
      impressionsPerDay: activeMs >= 3600000 ? counts.impressions / activeDays : null,
      ctr: counts.impressions ? (counts.clicks / counts.impressions) * 100 : null,
      completionRate: counts.previewStarts ? (counts.completions / counts.previewStarts) * 100 : null,
      earlyData: counts.impressions < EARLY_DATA_IMPRESSIONS,
    });
  }
  const latest = (row: CampaignComparisonRow) => row.runs[0].end === null ? Infinity : Date.parse(row.runs[0].end);
  return rows.sort((a, b) => latest(b) - latest(a));
}

export type ComparableMetric = "impressionsPerDay" | "ctr" | "completionRate";
/**
 * The campaign with the highest value, only when at least two have enough
 * data and the leader is clearly ahead (more than 1% above the runner-up).
 */
export function bestCampaign(rows: CampaignComparisonRow[], metric: ComparableMetric) {
  const ranked = rows
    .filter(row => !row.earlyData && row[metric] !== null && row[metric]! > 0)
    .sort((a, b) => b[metric]! - a[metric]!);
  if (ranked.length < 2 || ranked[0][metric]! <= ranked[1][metric]! * 1.01) return null;
  return ranked[0].campaignId;
}
