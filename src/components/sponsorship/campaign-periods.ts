import type { CampaignRun } from "@/features/sponsorship/campaign-runs";

const DAY = 86400000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

/** A campaign run with its display title, as sent with the report catalog. */
export type ReportCampaignRun = CampaignRun & { title: string };
/** The UTC days a campaign was public, from its first run to its last. */
export type CampaignPeriod = { campaignId: string; title: string; start: string; end: string; live: boolean };

/** One period per campaign that was public within retention, newest first. */
export function campaignPeriods(runs: ReportCampaignRun[], today: string, oldest: string): CampaignPeriod[] {
  const periods = new Map<string, CampaignPeriod>();
  for (const run of runs) {
    const start = iso(Date.parse(run.start));
    // A run ending exactly at midnight does not cover the following day.
    const end = run.end ? iso(Math.max(Date.parse(run.end) - 1, Date.parse(run.start))) : today;
    const current = periods.get(run.campaignId);
    periods.set(run.campaignId, {
      campaignId: run.campaignId,
      title: run.title,
      start: current && current.start < start ? current.start : start,
      end: current && current.end > end ? current.end : end > today ? today : end,
      live: Boolean(current?.live) || run.end === null,
    });
  }
  return [...periods.values()]
    .filter(period => period.end >= oldest)
    .sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.end.localeCompare(a.end));
}

export function periodDays(period: { start: string; end: string }) {
  return Math.round((Date.parse(period.end) - Date.parse(period.start)) / DAY) + 1;
}

/** Milliseconds a campaign was public inside a report window. */
export function liveTimeWithin(runs: CampaignRun[], campaignId: string, window: { start: string; end: string }, now = Date.now()) {
  const from = Date.parse(window.start), to = Date.parse(window.end);
  return runs
    .filter(run => run.campaignId === campaignId)
    .reduce((sum, run) => sum + Math.max(0, Math.min(run.end ? Date.parse(run.end) : now, to) - Math.max(Date.parse(run.start), from)), 0);
}
