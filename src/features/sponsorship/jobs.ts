import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import {
  sponsorBillingEvents,
  sponsorCheckouts,
  sponsorJobs,
} from "@/db/schema";
import { withSponsorWrite } from "./repository";
import { queueSponsorJob } from "./jobs-store";
import { reconcileSponsorCheckout } from "./billing-repository";
import { sponsorBillingProvider, type BillingProvider } from "./stripe-client";
import { cleanupExpiredSponsorPreparations } from "./cleanup";
import { cleanupDeletedSponsorOwner } from "./deletion";
export function sponsorMaintenanceAuthorized(
  header: string | null,
  secret = process.env.CRON_SECRET,
) {
  if (!secret || secret.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`),
    supplied = Buffer.from(header);
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}
export async function drainSponsorJobs(
  provider: BillingProvider = sponsorBillingProvider(),
  limit = 10,
  now = new Date(),
) {
  let completed = 0,
    pending = 0;
  for (let i = 0; i < limit; i++) {
    const job = await withSponsorWrite(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(sponsorJobs)
        .where(
          and(
            lte(sponsorJobs.nextAttemptAt, now),
            or(
              eq(sponsorJobs.state, "pending"),
              and(
                eq(sponsorJobs.state, "running"),
                lte(sponsorJobs.leaseUntil, now),
              ),
            ),
          ),
        )
        .orderBy(sponsorJobs.nextAttemptAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return null;
      const [claimed] = await tx
        .update(sponsorJobs)
        .set({
          state: "running",
          attempts: candidate.attempts + 1,
          leaseToken: randomUUID(),
          leaseUntil: new Date(now.getTime() + 10 * 60000),
          updatedAt: now,
        })
        .where(eq(sponsorJobs.id, candidate.id))
        .returning();
      return claimed;
    });
    if (!job) break;
    let done = false;
    try {
      if (job.kind === "event") {
        const receipt = await withSponsorWrite(
          async (tx) =>
            (
              await tx
                .select()
                .from(sponsorBillingEvents)
                .where(eq(sponsorBillingEvents.eventId, job.targetId))
            )[0],
        );
        if (!receipt) throw new Error("Billing receipt unavailable.");
        const target = await provider.eventTarget(
          receipt.eventType,
          receipt.objectId,
        );
        done = target
          ? await reconcileSponsorCheckout(target, provider, undefined, now)
          : true;
      } else if (job.kind === "reconcile")
        done = await reconcileSponsorCheckout(
          job.targetId,
          provider,
          undefined,
          now,
        );
      else if (job.kind === "delete_owner")
        done = await cleanupDeletedSponsorOwner(job.targetId, provider, now);
    } catch {
      /* Minimal error codes; never persist raw provider/customer data. */
    }
    await withSponsorWrite(async (tx) => {
      await tx
        .update(sponsorJobs)
        .set({
          state: done ? "complete" : "pending",
          leaseUntil: null,
          leaseToken: null,
          errorCode: done ? null : "reconciliation_pending",
          nextAttemptAt: new Date(
            now.getTime() +
              Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
          ),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sponsorJobs.id, job.id),
            eq(sponsorJobs.leaseToken, job.leaseToken!),
          ),
        );
    });
    if (done) completed++;
    else pending++;
  }
  return { completed, pending };
}
export async function runSponsorMaintenance(now = new Date()) {
  await withSponsorWrite(async (tx) => {
    const current = await tx
      .select({ id: sponsorCheckouts.id })
      .from(sponsorCheckouts)
      .where(
        and(
          isNull(sponsorCheckouts.releasedAt),
          or(
            eq(sponsorCheckouts.state, "reserved"),
            eq(sponsorCheckouts.state, "completed"),
          ),
        ),
      )
      .limit(100);
    for (const p of current)
      await queueSponsorJob(
        tx,
        "reconcile",
        p.id,
        `maintenance:${p.id}:${Math.floor(now.getTime() / 3600000)}`,
        now,
      );
  });
  const jobs = await drainSponsorJobs();
  const preparations = await cleanupExpiredSponsorPreparations(now);
  return { ...jobs, preparations };
}
