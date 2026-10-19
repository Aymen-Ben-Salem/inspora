import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/auth/require-admin";
import { requireDatabase } from "@/db/client";
import { ADMIN_LIBRARY_PAGE_SIZE, adminPageBounds } from "@/features/admin/library-pagination";
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
import { assertStripeObjectMode } from "./payment-environment";
export async function readSponsorBillingAdministration({ page = 1, exceptionsPage = 1, jobsPage = 1 }: { page?: number; exceptionsPage?: number; jobsPage?: number } = {}) {
  await requireAdmin();
  const db = requireDatabase();
  const totalsResult = await db.execute<{ accounts: number; exceptions: number; jobs: number }>(sql`
    select (select count(*)::int from ${sponsorAccounts}) as accounts,
      (select count(*)::int from ${sponsorCheckouts} where ${sponsorCheckouts.exceptionCode} is not null) as exceptions,
      (select count(*)::int from ${sponsorJobs} where ${sponsorJobs.state} <> 'complete') as jobs
  `);
  const totals = totalsResult.rows[0];
  const accountPagination = adminPageBounds(totals?.accounts ?? 0, page);
  const exceptionPagination = adminPageBounds(totals?.exceptions ?? 0, exceptionsPage);
  const jobPagination = adminPageBounds(totals?.jobs ?? 0, jobsPage);
  const [seats, accounts, exceptions, jobs] = await db.batch([
    db.select().from(sponsorSeats).orderBy(sponsorSeats.slot),
    db.select({ id: sponsorAccounts.id, state: sponsorAccounts.state, paidThrough: sponsorAccounts.paidThrough, cancelAtPeriodEnd: sponsorAccounts.cancelAtPeriodEnd })
      .from(sponsorAccounts).orderBy(sponsorAccounts.createdAt, sponsorAccounts.id)
      .limit(ADMIN_LIBRARY_PAGE_SIZE).offset((accountPagination.page - 1) * ADMIN_LIBRARY_PAGE_SIZE),
    db.select({ id: sponsorCheckouts.id, exceptionCode: sponsorCheckouts.exceptionCode })
      .from(sponsorCheckouts)
      .where(sql`${sponsorCheckouts.exceptionCode} is not null`)
      .orderBy(sponsorCheckouts.createdAt, sponsorCheckouts.id)
      .limit(ADMIN_LIBRARY_PAGE_SIZE).offset((exceptionPagination.page - 1) * ADMIN_LIBRARY_PAGE_SIZE),
    db.select({ id: sponsorJobs.id, kind: sponsorJobs.kind, state: sponsorJobs.state, attempts: sponsorJobs.attempts, errorCode: sponsorJobs.errorCode })
      .from(sponsorJobs)
      .where(sql`${sponsorJobs.state} <> 'complete'`)
      .orderBy(sponsorJobs.createdAt, sponsorJobs.id)
      .limit(ADMIN_LIBRARY_PAGE_SIZE).offset((jobPagination.page - 1) * ADMIN_LIBRARY_PAGE_SIZE),
  ]);
  return { seats, accounts, exceptions, jobs, accountPagination, exceptionPagination, jobPagination };
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
        !(p.billingMode === "one_time" ? p.stripeSessionId : p.stripeSubscriptionId)
      )
        throw new Error("No late-payment exception is available to resolve.");
      const billing = provider ?? sponsorBillingProvider();
      const current = p.billingMode === "one_time" ? await billing.observePayment(p.stripeSessionId!) : await billing.observe(p.stripeSubscriptionId!);
      assertStripeObjectMode(current);
      assertStripeObjectMode(current.price);
      if (
        current.checkoutId !== p.id ||
        current.subscriptionId !== p.stripeSubscriptionId ||
        (current.billingMode ?? "subscription") !== p.billingMode
      )
        throw new Error("Payment resolution binding mismatch.");
      const latest = current.invoices
        .filter((i) => i.paid || i.refunded)
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
