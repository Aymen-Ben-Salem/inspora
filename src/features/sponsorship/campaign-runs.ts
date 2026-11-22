/** A continuous period during which one campaign was the account's public campaign. */
export type CampaignRun = { campaignId: string; start: string; end: string | null };

// Saving a public campaign closes one version's interval and opens the next in
// the same transaction, so the boundary differs only by statement time.
const SAME_RUN_GAP_MS = 5 * 60 * 1000;

/** Merges back-to-back delivery intervals of the same campaign into runs, newest first. */
export function campaignRuns(
  intervals: { campaignId: string; startAt: Date; endAt: Date | null }[],
): CampaignRun[] {
  const runs: { campaignId: string; start: number; end: number | null }[] = [];
  for (const interval of [...intervals].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())) {
    const start = interval.startAt.getTime(), end = interval.endAt?.getTime() ?? null;
    const previous = runs.at(-1);
    if (previous && previous.campaignId === interval.campaignId && previous.end !== null &&
        start - previous.end <= SAME_RUN_GAP_MS) {
      previous.end = end === null ? null : Math.max(previous.end, end);
      continue;
    }
    runs.push({ campaignId: interval.campaignId, start, end });
  }
  return runs.reverse().map((run) => ({
    campaignId: run.campaignId,
    start: new Date(run.start).toISOString(),
    end: run.end === null ? null : new Date(run.end).toISOString(),
  }));
}
