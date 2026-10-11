import "server-only";
import { and, eq, gt, lt, lte, sql } from "drizzle-orm";
import { withWriteTransaction } from "@/db/write-client";
import {
  analyticsEvents,
  analyticsIdentityEpochs,
  analyticsOccurrences,
  analyticsReports,
  analyticsRateBuckets,
  sponsorDeliveryPeriods,
} from "@/db/schema";
import {
  finalizePaidPeriodReport,
  pruneExpiredReports,
  reportKey,
} from "./reports";
import { queryMetrics } from "./report-query";
export async function runAnalyticsMaintenance(now = new Date()) {
  await withWriteTransaction((tx) =>
    tx
      .delete(analyticsRateBuckets)
      .where(lte(analyticsRateBuckets.expiresAt, now)),
  );
  await withWriteTransaction((tx) =>
    tx
      .delete(analyticsIdentityEpochs)
      .where(lte(analyticsIdentityEpochs.destroyAt, now)),
  );
  const cutoff = new Date(now.getTime() - 90 * 86400000);
  const historyCutoff = new Date(now);
  historyCutoff.setUTCMonth(historyCutoff.getUTCMonth() - 24);
  const periods = await withWriteTransaction((tx) =>
    tx
      .select()
      .from(sponsorDeliveryPeriods)
      .where(
        and(
          gt(sponsorDeliveryPeriods.endAt, historyCutoff),
          lt(sponsorDeliveryPeriods.endAt, new Date(now.getTime() - 900000)),
        ),
      ),
  );
  for (const period of periods)
    await finalizePaidPeriodReport(period.accountId, period.id, now);
  // No raw pruning while an observed sponsor has no verified paid-period history,
  // or while an older event is outside all known periods. This is intentionally
  // fail-closed rather than losing identities needed for a whole-range summary.
  const unfinalized = await withWriteTransaction((tx) =>
    tx.execute(
      sql`select 1 from analytics_events e join sponsors s on s.id=e.campaign_id where e.occurred_at<${cutoff} and not exists(select 1 from sponsor_delivery_periods p where p.account_id=s.account_id and e.occurred_at>=p.start_at and e.occurred_at<p.end_at and p.end_at<${new Date(now.getTime() - 900000)}) limit 1`,
    ),
  );
  if (unfinalized.rows.length)
    return { pruned: false, reason: "unfinalized_period" };
  const days = await withWriteTransaction((tx) =>
    tx.execute(
      sql`select distinct date_trunc('day',occurred_at at time zone 'UTC') as day from analytics_events where occurred_at<${cutoff} order by day limit 32`,
    ),
  );
  // Bounded daily work. Each selected day gets exact whole-day union summaries
  // (site and each account), before its raw events/receipts are removed.
  for (const value of days.rows) {
    const start =
        value.day instanceof Date
          ? value.day
          : new Date(
              String(value.day).replace(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/, "") +
                "Z",
            ),
      end = new Date(start.getTime() + 86400000);
    if (end > cutoff) continue;
    await withWriteTransaction(async (tx) => {
      const accounts = await tx.execute(
        sql`select distinct s.account_id as id from analytics_events e join sponsors s on s.id=e.campaign_id where e.occurred_at>=${start} and e.occurred_at<${end}`,
      );
      for (const accountId of [
        null,
        ...accounts.rows.map((row) => String(row.id)),
      ]) {
        const scope = accountId ?? "site",
          filter = { range: "1d" as const },
          key = `daily:${start.toISOString().slice(0, 10)}:${scope}`;
        const [existing] = await tx
          .select({ key: analyticsReports.key })
          .from(analyticsReports)
          .where(eq(analyticsReports.key, key));
        if (!existing) {
          const data = await queryMetrics(
              tx,
              accountId,
              filter,
              { start: start.toISOString(), end: end.toISOString() },
              now,
            ),
            expires = new Date(end);
          expires.setUTCMonth(expires.getUTCMonth() + 24);
          await tx
            .insert(analyticsReports)
            .values({
              key,
              scope,
              filter: { ...filter, day: start.toISOString() },
              data,
              asOf: now,
              expiresAt: expires,
            })
            .onConflictDoNothing();
        }
      }
      // Summary checkpoints must exist for every closed period covering this day.
      for (const period of periods.filter(
        (p) => p.startAt < end && p.endAt > start,
      )) {
        const [saved] = await tx
          .select({ key: analyticsReports.key })
          .from(analyticsReports)
          .where(
            eq(
              analyticsReports.key,
              reportKey(period.accountId, {
                range: "30d",
                periodId: period.id,
              }),
            ),
          );
        if (!saved)
          throw new Error("Missing finalized period; raw analytics preserved.");
      }
      await tx
        .delete(analyticsEvents)
        .where(
          and(
            sql`${analyticsEvents.occurredAt}>=${start}`,
            lt(analyticsEvents.occurredAt, end),
          ),
        );
    });
  }
  await withWriteTransaction((tx) =>
    tx
      .delete(analyticsOccurrences)
      .where(lt(analyticsOccurrences.acceptedAt, cutoff)),
  );
  await pruneExpiredReports(now);
  return { pruned: true, days: days.rows.length };
}
