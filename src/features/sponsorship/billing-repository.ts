import { sponsorPublicCreative } from "./public-creative";
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import {
  sponsorAccounts,
  sponsorAssets,
  sponsorCheckouts,
  sponsorIdentities,
  sponsorSeats,
  sponsors,
} from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { SPONSOR_CACHE_TAG } from "@/data/sponsor-repository";
import { withSponsorWrite } from "./repository";
import { billingDecision, validateSponsorPrice } from "./billing";
import { promoteSponsorMedia, type SponsorPromoter } from "./public-media";
import type { BillingProvider, CheckoutSession } from "./stripe-client";
import type { SponsorUpload } from "./types";
type Checkout = typeof sponsorCheckouts.$inferSelect;
async function checkoutOwnerLock(tx: WriteTx, owner: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${"sponsorship:" + owner},0))`,
  );
}
async function releaseReservation(tx: WriteTx, p: Checkout, now: Date) {
  await tx
    .update(sponsorCheckouts)
    .set({ state: "expired", releasedAt: now })
    .where(eq(sponsorCheckouts.id, p.id));
  await tx
    .update(sponsorSeats)
    .set({
      state: "free",
      checkoutId: null,
      accountId: null,
      reservedUntil: null,
    })
    .where(
      and(
        eq(sponsorSeats.checkoutId, p.id),
        eq(sponsorSeats.state, "reserved"),
      ),
    );
}
async function storedSession(
  tx: WriteTx,
  p: Checkout,
  provider: BillingProvider,
  reservedUntil: Date | null,
): Promise<CheckoutSession | null> {
  if (p.stripeSessionId) return provider.session(p.stripeSessionId);
  if (!reservedUntil || !p.priceId) return null;
  // A missing stored ID can mean an unknown provider outcome. Once the original
  // expiry is too close for creation, look up current sessions exhaustively;
  // never recreate with an invalid expiry or after idempotency retention.
  if (Date.now() + 1800000 >= reservedUntil.getTime()) {
    const found = await provider.findCheckout(p.id, reservedUntil);
    if (found)
      await tx
        .update(sponsorCheckouts)
        .set({ stripeSessionId: found.id })
        .where(eq(sponsorCheckouts.id, p.id));
    return found;
  }
  const session = await provider.createCheckout({
    checkoutId: p.id,
    priceId: p.priceId,
    key: `sponsor-checkout:${p.id}`,
    expiresAt: reservedUntil.getTime(),
  });
  if (session.checkoutId !== p.id)
    throw new Error("Checkout binding mismatch.");
  await tx
    .update(sponsorCheckouts)
    .set({ stripeSessionId: session.id })
    .where(eq(sponsorCheckouts.id, p.id));
  return session;
}
export async function ensureSponsorCheckoutSession(
  checkoutId: string,
  provider: BillingProvider,
) {
  return withSponsorWrite(async (tx) => {
    const [initial] = await tx
      .select()
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.id, checkoutId));
    if (!initial) throw new Error("Checkout unavailable.");
    await checkoutOwnerLock(tx, initial.ownerUserId);
    const [p] = await tx
      .select()
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.id, checkoutId))
      .for("update");
    const [identity] = await tx
      .select()
      .from(sponsorIdentities)
      .where(eq(sponsorIdentities.userId, p.ownerUserId));
    const [seat] = await tx
      .select()
      .from(sponsorSeats)
      .where(eq(sponsorSeats.checkoutId, p.id))
      .for("update");
    if (
      identity?.state !== "allowed" ||
      p.releasedAt ||
      p.state !== "reserved" ||
      seat?.state !== "reserved" ||
      !seat.reservedUntil ||
      seat.reservedUntil <= new Date()
    )
      throw new Error("Checkout reservation unavailable.");
    const session = await storedSession(tx, p, provider, seat.reservedUntil);
    if (
      !session ||
      session.status !== "open" ||
      !session.url ||
      session.checkoutId !== p.id
    )
      throw new Error("Checkout is no longer open. Check your dashboard.");
    return session.url;
  });
}
export async function reconcileSponsorCheckout(
  checkoutId: string,
  provider: BillingProvider,
  promote: SponsorPromoter = promoteSponsorMedia,
  now = new Date(),
): Promise<boolean> {
  let invalidated = false;
  const done = await withSponsorWrite(async (tx) => {
    const [initial] = await tx
      .select()
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.id, checkoutId));
    if (!initial) return true;
    await checkoutOwnerLock(tx, initial.ownerUserId);
    const [p] = await tx
      .select()
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.id, checkoutId))
      .for("update");
    const [identity] = await tx
      .select()
      .from(sponsorIdentities)
      .where(eq(sponsorIdentities.userId, p.ownerUserId));
    let [account] = await tx
      .select()
      .from(sponsorAccounts)
      .where(eq(sponsorAccounts.ownerUserId, p.ownerUserId))
      .for("update");
    const [seat] = await tx
      .select()
      .from(sponsorSeats)
      .where(eq(sponsorSeats.checkoutId, p.id))
      .for("update");
    if (!p.priceId || !p.snapshot) return true;
    const session = await storedSession(
      tx,
      p,
      provider,
      seat?.reservedUntil ?? null,
    );
    if (!session) {
      if (seat?.state === "reserved" && !p.stripeSessionId)
        await releaseReservation(tx, p, now);
      return true;
    }
    if (session.checkoutId !== p.id)
      throw new Error("Checkout owner binding mismatch.");
    let current = session;
    const denied =
      identity?.state !== "allowed" ||
      ["revoked", "deleting"].includes(account?.state ?? "");
    if (
      session.status === "open" &&
      (denied || !seat?.reservedUntil || seat.reservedUntil <= now)
    )
      current = await provider.expireSession(session.id);
    if (current.status === "expired" && !current.subscriptionId) {
      if (!p.releasedAt) await releaseReservation(tx, p, now);
      return true;
    }
    if (!current.subscriptionId) return false;
    if (
      p.stripeSubscriptionId &&
      p.stripeSubscriptionId !== current.subscriptionId
    )
      throw new Error("Subscription binding mismatch.");
    await tx
      .update(sponsorCheckouts)
      .set({ stripeSubscriptionId: current.subscriptionId })
      .where(eq(sponsorCheckouts.id, p.id));
    const observation = await provider.observe(current.subscriptionId);
    if (
      observation.checkoutId !== p.id ||
      observation.subscriptionId !== current.subscriptionId
    )
      throw new Error("Subscription ownership mismatch.");
    validateSponsorPrice(observation.price, p.priceId, false);
    const ownedAccount =
      account?.stripeSubscriptionId === current.subscriptionId ? account : null;
    const previous = {
      paidThrough: ownedAccount?.paidThrough?.getTime() ?? null,
      periodStart: ownedAccount?.periodStart?.getTime() ?? null,
    };
    const decision = billingDecision(
      observation,
      previous,
      now.getTime(),
      p.priceId,
    );
    if (
      denied ||
      p.releasedAt ||
      !seat ||
      (account && !ownedAccount && account.state !== "inactive")
    ) {
      const latest = observation.invoices
        .filter((i) => i.paid)
        .sort((a, b) => b.periodEnd - a.periodEnd)[0];
      if (latest && latest.id !== p.paidInvoiceId)
        await tx
          .update(sponsorCheckouts)
          .set({ exceptionCode: "late_payment_refund_review" })
          .where(eq(sponsorCheckouts.id, p.id));
      const safe = await provider.terminate(current.subscriptionId);
      if (!safe) return false;
      if (seat) {
        await tx
          .update(sponsorSeats)
          .set({
            state: "free",
            checkoutId: null,
            accountId: null,
            reservedUntil: null,
          })
          .where(eq(sponsorSeats.slot, seat.slot));
        await tx
          .update(sponsorCheckouts)
          .set({ releasedAt: now })
          .where(eq(sponsorCheckouts.id, p.id));
      }
      return true;
    }
    if (decision.state === "pending") {
      if (
        seat.reservedUntil &&
        seat.reservedUntil > now &&
        !["canceled", "incomplete_expired"].includes(observation.status)
      )
        return false;
      if (!(await provider.terminate(current.subscriptionId))) return false;
      await releaseReservation(tx, p, now);
      return true;
    }
    if (!decision.paidThrough || !decision.periodStart)
      throw new Error("Paid period unavailable.");
    const values = {
      state: decision.state,
      stripeCustomerId: observation.customerId,
      stripeSubscriptionId: observation.subscriptionId,
      paidThrough: new Date(decision.paidThrough),
      periodStart: new Date(decision.periodStart),
      recoveryDeadline: decision.recoveryDeadline
        ? new Date(decision.recoveryDeadline)
        : null,
      cancelAtPeriodEnd: observation.cancelAtPeriodEnd,
      billingCurrency: observation.price.currency,
      billingInterval: observation.price.interval!,
      billingIntervalCount: observation.price.intervalCount!,
      updatedAt: now,
    };
    if (!ownedAccount) {
      if (seat.state !== "reserved" || !seat.reservedUntil)
        throw new Error("Paid seat reservation unavailable.");
      if (account)
        [account] = await tx
          .update(sponsorAccounts)
          .set(values)
          .where(eq(sponsorAccounts.id, account.id))
          .returning();
      else
        [account] = await tx
          .insert(sponsorAccounts)
          .values({ ownerUserId: p.ownerUserId, ...values })
          .returning();
    } else
      [account] = await tx
        .update(sponsorAccounts)
        .set(values)
        .where(eq(sponsorAccounts.id, ownedAccount.id))
        .returning();
    await tx
      .update(sponsorSeats)
      .set({
        state: decision.terminate ? "releasing" : "occupied",
        accountId: account.id,
        reservedUntil: null,
      })
      .where(eq(sponsorSeats.slot, seat.slot));
    await tx
      .update(sponsorCheckouts)
      .set({
        state: "completed",
        paymentReceivedAt: p.paymentReceivedAt ?? now,
        paidInvoiceId: decision.invoiceId ?? p.paidInvoiceId,
      })
      .where(eq(sponsorCheckouts.id, p.id));
    invalidated = true;
    if (decision.terminate) {
      if (!(await provider.terminate(current.subscriptionId))) return false;
      // Re-read after stopping collection so an in-flight success becomes an
      // explicit exception, never entitlement after the seat is reused.
      const final = await provider.observe(current.subscriptionId);
      if (
        final.invoices.some(
          (i) => i.paid && i.periodEnd > decision.paidThrough!,
        )
      )
        await tx
          .update(sponsorCheckouts)
          .set({ exceptionCode: "late_payment_refund_review" })
          .where(eq(sponsorCheckouts.id, p.id));
      await tx
        .update(sponsorCheckouts)
        .set({ releasedAt: now })
        .where(eq(sponsorCheckouts.id, p.id));
      await tx
        .update(sponsorSeats)
        .set({
          state: "free",
          accountId: null,
          checkoutId: null,
          reservedUntil: null,
        })
        .where(eq(sponsorSeats.slot, seat.slot));
      return true;
    }
    const [campaign] = await tx
      .select()
      .from(sponsors)
      .where(
        and(
          eq(sponsors.id, p.snapshot.id),
          eq(sponsors.ownerUserId, p.ownerUserId),
        ),
      );
    if (!campaign) throw new Error("Pinned campaign unavailable.");
    // Once activation has bound this campaign to the paid account, creative
    // selection belongs to the campaign service. Renewal must never undo a switch.
    if (campaign.accountId === account.id) return true;
    const creative = p.snapshot.creative;
    const uploads = await tx
      .select()
      .from(sponsorAssets)
      .where(
        and(
          eq(sponsorAssets.ownerUserId, p.ownerUserId),
          eq(sponsorAssets.checkoutId, p.id),
          inArray(
            sponsorAssets.id,
            creative.assets.map((a) => a.id),
          ),
        ),
      );
    if (
      uploads.length !== creative.assets.length ||
      uploads.some((u) => u.state !== "verified")
    )
      throw new Error("Pinned sponsor assets unavailable.");
    try {
      const promoted = await promote({
        accountId: account.id,
        campaignId: campaign.id,
        versionId: p.snapshot.versionId,
        creative,
        uploads: uploads as SponsorUpload[],
      });
      const fields = sponsorPublicCreative(creative, promoted);
      await tx
        .update(sponsors)
        .set({ campaignState: "archived" })
        .where(
          and(
            eq(sponsors.accountId, account.id),
            eq(sponsors.campaignState, "published"),
          ),
        );
      await tx
        .update(sponsors)
        .set({
          accountId: account.id,
          campaignState: "published",
          ...fields,
          updatedAt: now,
        })
        .where(eq(sponsors.id, campaign.id));
      await tx
        .update(sponsorCheckouts)
        .set({ exceptionCode: null })
        .where(eq(sponsorCheckouts.id, p.id));
      return true;
    } catch {
      await tx
        .update(sponsorCheckouts)
        .set({ exceptionCode: "activation_pending" })
        .where(eq(sponsorCheckouts.id, p.id));
      return false;
    }
  });
  if (invalidated) revalidateTag(SPONSOR_CACHE_TAG, { expire: 0 });
  return done;
}
