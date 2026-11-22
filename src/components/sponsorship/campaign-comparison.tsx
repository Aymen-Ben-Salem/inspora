"use client";
import { useId } from "react";
import {
  bestCampaign,
  EARLY_DATA_IMPRESSIONS,
  type CampaignComparisonRow,
  type ComparableMetric,
} from "@/features/sponsorship/campaign-comparison-model";
import styles from "./dashboard.module.css";

const number = new Intl.NumberFormat("en");
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const days = (value: number) => value < 1 ? "under a day" : `${Math.round(value)} ${Math.round(value) === 1 ? "day" : "days"}`;

function livePeriod(row: CampaignComparisonRow) {
  const first = row.runs.at(-1)!, last = row.runs[0];
  return `${shortDate(first.start)} – ${last.end ? shortDate(last.end) : "now"}`;
}

function Best() {
  return <span className={styles.bestTag}>Best</span>;
}

/** Side-by-side campaign results, each measured only while it was live. */
export function CampaignComparison({ rows, onView }: { rows: CampaignComparisonRow[]; onView(row: CampaignComparisonRow): void }) {
  const titleId = useId();
  const best = Object.fromEntries((["impressionsPerDay", "ctr", "completionRate"] as ComparableMetric[]).map(metric => [metric, bestCampaign(rows, metric)]));
  const metric = (row: CampaignComparisonRow, key: ComparableMetric, text: string) =>
    <td className="py-3 pr-4 tabular-nums">
      <span className={best[key] === row.campaignId ? "font-medium text-[#262626]" : undefined}>{text}</span>
      {best[key] === row.campaignId ? <Best /> : null}
    </td>;
  return (
    <section id="report-campaigns" aria-labelledby={titleId} className="scroll-mt-28">
      <h2 id={titleId} className={`${styles.sectionHeading} text-lg font-medium`}>Compare campaigns</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#767676]">
        Each campaign is measured only while it was live, over the last 90 days. Use impressions per day and CTR to compare campaigns that ran for different lengths.
      </p>
      <div className={`${styles.surface} mt-4`}>
        <div className="overflow-x-auto" role="region" aria-labelledby={titleId} tabIndex={0}>
          <table className={`${styles.table} w-full min-w-[720px] text-left text-sm`}>
            <thead>
              <tr className="text-xs text-[#767676]">
                <th className="pb-3 pr-4 font-normal">Campaign</th>
                <th className="pb-3 pr-4 font-normal">Live</th>
                <th className="pb-3 pr-4 font-normal">Impressions / day</th>
                <th className="pb-3 pr-4 font-normal">Clicks</th>
                <th className="pb-3 pr-4 font-normal">CTR</th>
                <th className="pb-3 pr-4 font-normal" title="Video previews watched to the end of their first loop">Video completion</th>
                <th className="pb-3 font-normal"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.campaignId} className="border-t border-[#f0f0f0]">
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-words">{row.title}</span>
                      <span className={row.live ? styles.liveTag : styles.endedTag}>{row.live ? "Live" : "Ended"}</span>
                      {row.earlyData ? <span className={styles.earlyTag} title={`Fewer than ${number.format(EARLY_DATA_IMPRESSIONS)} impressions, so its rates can still change a lot.`}>Early data</span> : null}
                    </span>
                  </th>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {livePeriod(row)}
                    <span className="block text-xs text-[#767676]">{days(row.activeDays)}{row.runs.length > 1 ? ` · ${row.runs.length} runs` : ""}</span>
                  </td>
                  {metric(row, "impressionsPerDay", row.impressionsPerDay === null ? "—" : number.format(Math.round(row.impressionsPerDay)))}
                  <td className="py-3 pr-4 tabular-nums">{number.format(row.clicks)}</td>
                  {metric(row, "ctr", row.ctr === null ? "—" : `${row.ctr.toFixed(2)}%`)}
                  {metric(row, "completionRate", row.completionRate === null ? "—" : `${Math.round(row.completionRate)}%`)}
                  <td className="py-3 text-right">
                    <button type="button" className={styles.viewReport} onClick={() => onView(row)} aria-label={`View ${row.title} report`}>View report</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
