import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/auth/require-admin";
import {
  adminAuditLogs,
  sponsorAccounts,
  sponsorCheckouts,
  sponsorIdentities,
  sponsorJobs,
  sponsorSeats,
} from "@/db/schema";
import { SPONSOR_CACHE_TAG } from "@/data/sponsor-repository";
import { withSponsorWrite } from "./repository";
import { queueSponsorJob } from "./jobs-store";
import { sponsorBillingProvider, type BillingProvider } from "./stripe-client";
export async function readSponsorBillingAdministration() {
  await requireAdmin();
  return withSponsorWrite(async (tx) => ({
    seats: await tx.select().from(sponsorSeats).orderBy(sponsorSeats.slot),
    accounts: await tx.select().from(sponsorAccounts),
    exceptions: await tx
      .select()
      .from(sponsorCheckouts)
      .where(sql`${sponsorCheckouts.exceptionCode} is not null`),
    jobs: await tx
      .select()
      .from(sponsorJobs)
      .where(sql`${sponsorJobs.state} <> 'complete'`)
      .limit(100),
  }));
}
export async function administerSponsorBilling(
  action: "retry" | "revoke" | "resolve_exception",
  checkoutId: string,
  provider?: BillingProvider,
) {
  const admin = await requireAdmin();
  await withSponsorWrite(async (tx) => {
    const [p] = await tx
      .select()
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.id, checkoutId));
    if (!p) throw new Error("Sponsor checkout not found.");
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"sponsorship:" + p.ownerUserId},0))`,
    );
    if (action === "revoke") {
      await tx
        .update(sponsorIdentities)
        .set({ state: "revoked" })
        .where(eq(sponsorIdentities.userId, p.ownerUserId));
      await tx
        .update(sponsorAccounts)
        .set({ state: "revoked" })
        .where(eq(sponsorAccounts.ownerUserId, p.ownerUserId));
      // Every checkout for this owner is terminated; never leave a second open
      // session capable of creating a recurring subscription after revocation.
      const owned = await tx
        .select()
        .from(sponsorCheckouts)
        .where(eq(sponsorCheckouts.ownerUserId, p.ownerUserId));
      for (const checkout of owned)
        await queueSponsorJob(
          tx,
          "reconcile",
          checkout.id,
          `revoke:${checkout.id}:${randomUUID()}`,
        );
    } else if (action === "resolve_exception") {
      // This is an audited acknowledgement of an external refund/resolution,
      // never an automatic Stripe refund or restoration of access.
      if (
        p.exceptionCode !== "late_payment_refund_review" ||
        !p.stripeSubscriptionId
      )
        throw new Error("No late-payment exception is available to resolve.");
      const current = await (provider ?? sponsorBillingProvider()).observe(
        p.stripeSubscriptionId,
      );
      if (
        current.checkoutId !== p.id ||
        current.subscriptionId !== p.stripeSubscriptionId ||
        current.livemode
      )
        throw new Error("Payment resolution binding mismatch.");
      const latest = current.invoices
        .filter((i) => i.paid)
        .sort((a, b) => b.periodEnd - a.periodEnd)[0];
      if (!latest) throw new Error("Payment exception invoice unavailable.");
      await tx
        .update(sponsorCheckouts)
        .set({ exceptionCode: null, paidInvoiceId: latest.id })
        .where(
          and(
            eq(sponsorCheckouts.id, p.id),
            sql`${sponsorCheckouts.exceptionCode} = 'late_payment_refund_review'`,
          ),
        );
    } else
      await queueSponsorJob(
        tx,
        "reconcile",
        p.id,
        `admin-retry:${p.id}:${randomUUID()}`,
      );
    await tx.insert(adminAuditLogs).values({
      actorId: admin.userId,
      action: `sponsor_${action}`,
      resourceType: "sponsor",
      resourceId: p.campaignId ?? p.id,
    });
  });
  revalidateTag(SPONSOR_CACHE_TAG, { expire: 0 });
}
