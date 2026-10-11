import "server-only";
import { createHash } from "node:crypto";
import { inArray, lte, sql } from "drizzle-orm";
import { withWriteTransaction } from "@/db/write-client";
import {
  analyticsEvents,
  analyticsOccurrences,
  analyticsRateBuckets,
} from "@/db/schema";
import { AnalyticsInputError } from "./collector";
import type { AcceptedBatch, AcceptedEvent } from "./types";
export class AnalyticsRateError extends Error {}
export async function storeAnalyticsEvents(
  events: AcceptedEvent[],
  now = new Date(),
): Promise<AcceptedBatch> {
  return withWriteTransaction(async (tx) => {
    const minute = new Date(Math.floor(now.getTime() / 60000) * 60000);
    const budgetKey = (event: AcceptedEvent) =>
      createHash("sha256")
        .update(
          JSON.stringify([
            event.abuseKey ?? event.visitorKey ?? `page:${event.pageId}`,
            minute.toISOString(),
          ]),
        )
        .digest("hex");
    const fingerprint = (event: AcceptedEvent) =>
      createHash("sha256")
        .update(
          JSON.stringify([
            event.kind,
            event.pageId,
            event.path,
            event.campaignId ?? null,
            event.versionId ?? null,
            event.placement ?? null,
            event.milestone ?? null,
            event.occurredAt,
          ]),
        )
        .digest("hex");
    const key = (event: AcceptedEvent) =>
      event.kind === "sponsor_click"
        ? null
        : [
            event.kind,
            event.pageId,
            event.campaignId ?? "site",
            event.placement ?? "page",
            event.milestone ?? "",
          ].join(":");
    const locks = [
      ...new Set(
        events.flatMap((event) => [
          `analytics:${budgetKey(event)}`,
          `occurrence:${event.occurrenceId}`,
          ...(key(event) ? [`delivery:${key(event)}`] : []),
        ]),
      ),
    ].sort();
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(lock_key,0)) from (select unnest(array[${sql.join(
        locks.map((lock) => sql`${lock}`),
        sql`, `,
      )}]::text[]) as lock_key order by lock_key) ordered_locks`,
    );
    const receipts = await tx
      .select()
      .from(analyticsOccurrences)
      .where(
        inArray(
          analyticsOccurrences.occurrenceId,
          events.map((event) => event.occurrenceId),
        ),
      );
    const seen = new Map(
      receipts.map((receipt) => [receipt.occurrenceId, receipt.fingerprint]),
    );
    const dedupKeys = events
      .map(key)
      .filter((value): value is string => value !== null);
    const existing = dedupKeys.length
      ? await tx
          .select({ key: analyticsEvents.dedupKey })
          .from(analyticsEvents)
          .where(inArray(analyticsEvents.dedupKey, dedupKeys))
      : [];
    const delivery = new Set(existing.map((event) => event.key));
    const result: AcceptedBatch = { accepted: [], duplicate: [], excluded: [] };
    const newEvents: AcceptedEvent[] = [],
      newReceipts: {
        occurrenceId: string;
        fingerprint: string;
        acceptedAt: Date;
      }[] = [];
    const increments = new Map<string, { events: number; receipts: number }>();
    for (const event of events) {
      const binding = fingerprint(event),
        dedupKey = key(event);
      if (seen.has(event.occurrenceId)) {
        if (seen.get(event.occurrenceId) !== binding)
          throw new AnalyticsInputError("Occurrence conflict.");
        result.duplicate.push(event.occurrenceId);
        continue;
      }
      seen.set(event.occurrenceId, binding);
      newReceipts.push({
        occurrenceId: event.occurrenceId,
        fingerprint: binding,
        acceptedAt: now,
      });
      const rateKey = budgetKey(event),
        increment = increments.get(rateKey) ?? { events: 0, receipts: 0 };
      increment.receipts++;
      increments.set(rateKey, increment);
      if (dedupKey && delivery.has(dedupKey)) {
        result.duplicate.push(event.occurrenceId);
        continue;
      }
      if (dedupKey) delivery.add(dedupKey);
      newEvents.push(event);
      increment.events++;
      result.accepted.push(event.occurrenceId);
    }
    if (increments.size) {
      const used = await tx
        .select()
        .from(analyticsRateBuckets)
        .where(inArray(analyticsRateBuckets.key, [...increments.keys()]));
      for (const [key, increment] of increments) {
        const old = used.find((row) => row.key === key);
        const value = {
          key,
          events: (old?.events ?? 0) + increment.events,
          receipts: (old?.receipts ?? 0) + increment.receipts,
          expiresAt: new Date(minute.getTime() + 3600000),
        };
        if (value.events > 240 || value.receipts > 240)
          throw new AnalyticsRateError("Analytics rate limit.");
        await tx
          .insert(analyticsRateBuckets)
          .values(value)
          .onConflictDoUpdate({ target: analyticsRateBuckets.key, set: value });
      }
      await tx
        .delete(analyticsRateBuckets)
        .where(lte(analyticsRateBuckets.expiresAt, now));
    }
    if (newEvents.length)
      await tx.insert(analyticsEvents).values(
        newEvents.map((event) => ({
          occurrenceId: event.occurrenceId,
          dedupKey: key(event),
          kind: event.kind,
          pageId: event.pageId,
          campaignId: event.campaignId ?? null,
          versionId: event.versionId ?? null,
          placement: event.placement ?? null,
          milestone: event.milestone ?? null,
          occurredAt: new Date(event.occurredAt),
          acceptedAt: now,
          visitorKey: event.visitorKey,
          countryCode: event.countryCode,
          device: event.device,
          referrerDomain: event.referrerDomain,
        })),
      );
    if (newReceipts.length)
      await tx.insert(analyticsOccurrences).values(newReceipts);
    return result;
  });
}
