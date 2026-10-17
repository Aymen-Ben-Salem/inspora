import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import {
  analyticsEvents,
  sponsorDeliveryIntervals,
  sponsorDeliveryPeriods,
  sponsors,
} from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import {
  allocateSpend,
  EMPTY_COUNTS,
  metricsFromCounts,
  type MetricCounts,
  type MetricsFilter,
  type MetricsReport,
} from "./query";
const columns =
  sql.raw(`count(*) filter(where e.kind='sponsor_impression') as impressions,
count(*) filter(where e.kind='sponsor_click') as clicks,
count(distinct e.visitor_key) filter(where e.kind='sponsor_impression') as "uniqueVisitors",
count(distinct e.visitor_key) filter(where e.kind='sponsor_click') as "uniqueClickers",
count(*) filter(where e.kind='sponsor_impression' and e.visitor_key is not null) as "identifiedImpressions",
count(*) filter(where e.kind='site_page_view') as pageviews,
count(distinct e.visitor_key) filter(where e.kind='site_page_view') as "siteVisitors",
count(*) filter(where e.kind='sponsor_preview_started') as "previewStarts",
count(*) filter(where e.kind='sponsor_preview_view') as "previewViews",
count(*) filter(where e.kind='sponsor_preview_progress' and e.milestone=25) as "progress25",
count(*) filter(where e.kind='sponsor_preview_progress' and e.milestone=50) as "progress50",
count(*) filter(where e.kind='sponsor_preview_progress' and e.milestone=75) as "progress75",
count(*) filter(where e.kind='sponsor_preview_progress' and e.milestone=100) as "progress100"`);
export async function queryMetrics(
  tx: WriteTx,
  accountId: string | null,
  filter: MetricsFilter,
  window: { start: string; end: string },
  now: Date,
  summaryOnly = false,
): Promise<MetricsReport> {
  const conditions = [
    sql`e.occurred_at >= ${window.start}::timestamptz and e.occurred_at < ${window.end}::timestamptz`,
  ];
  if (accountId) conditions.push(sql`s.account_id=${accountId}::uuid`);
  else conditions.push(sql`e.kind='site_page_view'`);
  if (filter.campaignId)
    conditions.push(sql`e.campaign_id=${filter.campaignId}::uuid`);
  if (filter.versionId)
    conditions.push(sql`e.version_id=${filter.versionId}::uuid`);
  if (filter.placement) conditions.push(sql`e.placement=${filter.placement}`);
  if (filter.country)
    conditions.push(
      filter.country === "Unknown"
        ? sql`e.country_code is null`
        : sql`e.country_code=${filter.country}`,
    );
  const dimension = sql.raw(
    `e.placement,e.campaign_id,e.version_id,e.country_code,e.device,e.referrer_domain,date_trunc('day',e.occurred_at at time zone 'UTC')`,
  );
  const rows = await tx.execute(
    summaryOnly
      ? sql`select 127 as grouping, ${columns} from ${analyticsEvents} e left join ${sponsors} s on s.id=e.campaign_id where ${sql.join(conditions, sql` and `)}`
      : sql`select ${dimension}, grouping(${dimension}) as grouping, ${columns} from ${analyticsEvents} e left join ${sponsors} s on s.id=e.campaign_id where ${sql.join(conditions, sql` and `)} group by grouping sets ((),(e.placement),(e.campaign_id),(e.version_id),(e.country_code),(e.device),(e.referrer_domain),(date_trunc('day',e.occurred_at at time zone 'UTC')))`,
  );
  const result: MetricsReport = {
    source: "Inspora accepted events",
    status: "available",
    asOf: now.toISOString(),
    ...window,
    range: filter.range,
    summary: metricsFromCounts(EMPTY_COUNTS),
    placement: [],
    campaign: [],
    version: [],
    country: [],
    device: [],
    referrer: [],
    daily: [],
    spend: null,
    cpc: null,
    cpm: null,
  };
  const fields = [
    "placement",
    "campaign",
    "version",
    "country",
    "device",
    "referrer",
    "daily",
  ] as const;
  for (const row of rows.rows) {
    const counts = {} as MetricCounts;
    for (const field of Object.keys(EMPTY_COUNTS) as (keyof MetricCounts)[]) {
      const value = Number(row[field]);
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("Invalid analytics aggregate.");
      counts[field] = value;
    }
    const metrics = metricsFromCounts(counts),
      grouping = Number(row.grouping);
    if (grouping === 127) {
      result.summary = metrics;
      continue;
    }
    const index = fields.findIndex(
      (_, i) => grouping === (127 ^ (1 << (6 - i))),
    );
    if (index < 0) throw new Error("Invalid analytics grouping.");
    const keys = [
      "placement",
      "campaign_id",
      "version_id",
      "country_code",
      "device",
      "referrer_domain",
      "date_trunc",
    ];
    const raw = row[keys[index]],
      label =
        raw === null
          ? fields[index] === "referrer"
            ? "Direct / Unknown"
            : "Unknown"
          : raw instanceof Date
            ? raw.toISOString().slice(0, 10)
            : String(raw).slice(0, 253);
    result[fields[index]].push({ ...metrics, label });
  }
  for (const field of fields)
    result[field].sort((a, b) =>
      field === "daily"
        ? a.label.localeCompare(b.label)
        : b.impressions + b.pageviews - (a.impressions + a.pageviews),
    );
  return accountId && !summaryOnly ? refreshReportMoney(tx, accountId, filter, result) : result;
}

/** Billing adjustments remain live even after finalized delivery rows are pruned. */
export async function refreshReportMoney(
  tx: WriteTx,
  accountId: string,
  filter: MetricsFilter,
  report: MetricsReport,
): Promise<MetricsReport> {
  const result = {
    ...report,
    spend: null,
    cpc: null,
    cpm: null,
  } as MetricsReport;
  const window = { start: result.start, end: result.end };
  const periods = await tx
    .select()
    .from(sponsorDeliveryPeriods)
    .where(
      and(
        eq(sponsorDeliveryPeriods.accountId, accountId),
        lt(sponsorDeliveryPeriods.startAt, new Date(window.end)),
        gt(sponsorDeliveryPeriods.endAt, new Date(window.start)),
      ),
    );
  const intervals = await tx
    .select()
    .from(sponsorDeliveryIntervals)
    .where(
      and(
        eq(sponsorDeliveryIntervals.accountId, accountId),
        lt(sponsorDeliveryIntervals.startAt, new Date(window.end)),
        sql`(${sponsorDeliveryIntervals.endAt} is null or ${sponsorDeliveryIntervals.endAt} > ${window.start}::timestamptz)`,
      ),
    );
  result.spend = allocateSpend(
    periods.map((p) => ({
      ...p,
      startAt: p.startAt.toISOString(),
      endAt: p.endAt.toISOString(),
    })),
    intervals.map((i) => ({
      ...i,
      startAt: i.startAt.toISOString(),
      endAt: i.endAt?.toISOString() ?? null,
    })),
    window,
    filter,
  );
  if (result.spend) {
    result.cpc = result.summary.clicks
      ? result.spend.amount / result.summary.clicks
      : null;
    result.cpm = result.summary.impressions
      ? (result.spend.amount / result.summary.impressions) * 1000
      : null;
  }
  return result;
}
