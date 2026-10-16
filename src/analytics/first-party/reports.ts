import "server-only";
import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { analyticsReports, sponsorDeliveryPeriods } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import {
  EMPTY_COUNTS,
  metricsFromCounts,
  rollingWindow,
  type MetricsFilter,
  type ReportResult,
} from "./query";
import { queryMetrics, refreshReportMoney } from "./report-query";
export function reportKey(scope: string, filter: MetricsFilter) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "accepted-v1",
        scope,
        filter.range,
        filter.campaignId ?? null,
        filter.versionId ?? null,
        filter.placement ?? null,
        filter.country ?? null,
        filter.periodId ?? null,
      ]),
    )
    .digest("hex");
}
export async function readMetricsReport(
  accountId: string | null,
  filter: MetricsFilter,
  refresh = false,
  now = new Date(),
): Promise<ReportResult> {
  const scope = accountId ?? "site",
    key = reportKey(scope, filter);
  try {
    return await withWriteTransaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`report:${scope}`},0))`,
      );
      const [cached] = await tx
        .select()
        .from(analyticsReports)
        .where(eq(analyticsReports.key, key));
      if (filter.periodId) {
        if (cached && cached.expiresAt > now && accountId)
          return refreshReportMoney(tx, accountId, filter, cached.data);
        // The whole-period checkpoint is committed with all observed filter
        // combinations. An absent intersection under that checkpoint is empty.
        const [complete] = await tx
          .select()
          .from(analyticsReports)
          .where(
            and(
              eq(analyticsReports.key, `closed-whole:${filter.periodId}`),
              eq(analyticsReports.scope, scope),
            ),
          );
        if (complete && complete.expiresAt > now && accountId) {
          const rolling = rollingWindow(
            filter.range,
            new Date(complete.data.end),
          );
          const empty = {
            ...complete.data,
            range: filter.range,
            start: new Date(
              Math.max(
                Date.parse(rolling.start),
                Date.parse(complete.data.start),
              ),
            ).toISOString(),
            summary: metricsFromCounts(EMPTY_COUNTS),
            placement: [],
            campaign: [],
            version: [],
            country: [],
            device: [],
            referrer: [],
            daily: [],
          };
          return refreshReportMoney(tx, accountId, filter, empty);
        }
        return { status: "unavailable", source: "Inspora accepted events" };
      }
      if (cached && now.getTime() - cached.asOf.getTime() < 300000 && !refresh)
        return cached.data;
      if (refresh) {
        const last = await tx
          .select({ at: analyticsReports.refreshAt })
          .from(analyticsReports)
          .where(eq(analyticsReports.scope, scope))
          .orderBy(sql`${analyticsReports.refreshAt} desc nulls last`)
          .limit(1);
        if (last[0]?.at && now.getTime() - last[0].at.getTime() < 60000) {
          if (cached)
            return {
              ...cached.data,
              status:
                now.getTime() - cached.asOf.getTime() >= 300000
                  ? "stale"
                  : "available",
            };
          throw new Error("Refresh rate limit.");
        }
      }
      const window = rollingWindow(filter.range, now),
        data = await queryMetrics(tx, accountId, filter, window, now);
      const values = {
        scope,
        filter,
        data,
        asOf: now,
        refreshAt: refresh ? now : (cached?.refreshAt ?? null),
        expiresAt: new Date(now.getTime() + 24 * 30 * 86400000),
      };
      await tx
        .insert(analyticsReports)
        .values({ key, ...values })
        .onConflictDoUpdate({ target: analyticsReports.key, set: values });
      return data;
    });
  } catch {
    try {
      return await withWriteTransaction(async (tx) => {
        const [old] = await tx
          .select()
          .from(analyticsReports)
          .where(eq(analyticsReports.key, key));
        return old && old.expiresAt > now
          ? { ...old.data, status: "stale" }
          : { status: "unavailable", source: "Inspora accepted events" };
      });
    } catch {
      return { status: "unavailable", source: "Inspora accepted events" };
    }
  }
}
export async function finalizePaidPeriodReport(
  accountId: string,
  periodId: string,
  now = new Date(),
) {
  await withWriteTransaction(async (tx) => {
    const [period] = await tx
      .select()
      .from(sponsorDeliveryPeriods)
      .where(
        and(
          eq(sponsorDeliveryPeriods.id, periodId),
          eq(sponsorDeliveryPeriods.accountId, accountId),
        ),
      );
    if (!period || period.endAt.getTime() + 900000 > now.getTime())
      throw new Error("Period is not closed.");
    const wholeKey = `closed-whole:${periodId}`;
    const [whole] = await tx
      .select({ key: analyticsReports.key })
      .from(analyticsReports)
      .where(eq(analyticsReports.key, wholeKey));
    if (whole) return;
    if (!whole) {
      const data = await queryMetrics(
          tx,
          accountId,
          { range: "30d", periodId },
          {
            start: period.startAt.toISOString(),
            end: period.endAt.toISOString(),
          },
          now,
        ),
        expiresAt = new Date(period.endAt);
      expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 24);
      await tx
        .insert(analyticsReports)
        .values({
          key: wholeKey,
          scope: accountId,
          filter: { periodId, wholePeriod: true },
          data,
          asOf: now,
          expiresAt,
        })
        .onConflictDoNothing();
    }
    // Enumerate observed filter intersections, including rollups. Distinct identities
    // are queried as unions while raw events still exist, never added from days.
    const filters = await tx.execute(
      sql`select distinct campaign_id,version_id,placement,country_code,grouping(campaign_id,version_id,placement,country_code) as g from analytics_events e join sponsors s on s.id=e.campaign_id where s.account_id=${accountId}::uuid and e.occurred_at>=${period.startAt} and e.occurred_at<${period.endAt} group by cube(campaign_id,version_id,placement,country_code)`,
    );
    const combinations = [
      {},
      ...filters.rows.map((row) => {
        const g = Number(row.g);
        return {
          ...(!(g & 8) && row.campaign_id
            ? { campaignId: String(row.campaign_id) }
            : {}),
          ...(!(g & 4) && row.version_id
            ? { versionId: String(row.version_id) }
            : {}),
          ...(!(g & 2) && row.placement
            ? { placement: row.placement as MetricsFilter["placement"] }
            : {}),
          ...(!(g & 1)
            ? {
                country: row.country_code
                  ? String(row.country_code)
                  : "Unknown",
              }
            : {}),
        };
      }),
    ];
    if (combinations.length > 10000)
      throw new Error(
        "Period summary requires operator review; raw data preserved.",
      );
    for (const range of ["1d", "7d", "30d"] as const)
      for (const combination of combinations) {
        const filter: MetricsFilter = { range, periodId, ...combination },
          key = reportKey(accountId, filter);
        const [existing] = await tx
          .select({ key: analyticsReports.key })
          .from(analyticsReports)
          .where(eq(analyticsReports.key, key));
        if (existing) continue;
        const rolling = rollingWindow(range, period.endAt),
          window = {
            start: new Date(
              Math.max(Date.parse(rolling.start), period.startAt.getTime()),
            ).toISOString(),
            end: period.endAt.toISOString(),
          };
        const data = await queryMetrics(tx, accountId, filter, window, now),
          expires = new Date(period.endAt);
        expires.setUTCMonth(expires.getUTCMonth() + 24);
        await tx
          .insert(analyticsReports)
          .values({
            key,
            scope: accountId,
            filter,
            data,
            asOf: now,
            expiresAt: expires,
          })
          .onConflictDoNothing();
      }
  });
}
export async function pruneExpiredReports(now = new Date()) {
  await withWriteTransaction((tx) =>
    tx.delete(analyticsReports).where(lt(analyticsReports.expiresAt, now)),
  );
}
