import { sponsorPublicCreative } from "./public-creative";
import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import {
  sponsorAccounts,
  sponsorAssets,
  sponsorCheckouts,
  sponsorIdentities,
  sponsorSeats,
  sponsorDeliveryPeriods,
  sponsors,
} from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { SPONSOR_CACHE_TAG } from "@/data/sponsor-repository";
import { withSponsorWrite } from "./repository";
import { billingDecision, validateSponsorPrice } from "./billing";
import { assertStripeObjectMode } from "./payment-environment";
import { promoteSponsorMedia, type SponsorPromoter } from "./public-media";
import type { BillingProvider, CheckoutSession } from "./stripe-client";
import type { SponsorUpload } from "./types";
import { readRenewalSource } from "./monthly-renewal";
import { queueSponsorJob } from "./jobs-store";
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
  allowCreate = true,
): Promise<CheckoutSession | null> {
  if (p.stripeSessionId) return provider.session(p.stripeSessionId);
  if (!reservedUntil || !p.priceId) return null;
  // A missing stored ID can mean an unknown provider outcome. Once the original
  // expiry is too close for creation, look up current sessions exhaustively;
  // never recreate with an invalid expiry or after idempotency retention.
  if (!allowCreate || Date.now() + 1800000 >= reservedUntil.getTime()) {
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
    billingMode: p.billingMode,
    pinned: true,
    ...(p.snapshot?.checkoutCurrency ? { currency: p.snapshot.checkoutCurrency } : {}),
    ...(p.snapshot?.renewal ? { renewal: p.snapshot.renewal } : {}),
  });
  if (session.checkoutId !== p.id || session.billingMode !== p.billingMode)
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
      .where(eq(sponsorSeats.checkoutId, p.snapshot?.renewal?.sourceCheckoutId ?? p.id))
      .for("update");
    const renewal = p.snapshot?.renewal;
    const [account] = renewal ? await tx.select().from(sponsorAccounts).where(eq(sponsorAccounts.id, renewal.accountId)) : [];
    const renewalAvailable = renewal && account?.ownerUserId === p.ownerUserId && account.state === "active" &&
      account.billingMode === "one_time" && account.stripeCustomerId === renewal.customerId &&
      account.paidThrough?.toISOString() === renewal.startsAt && account.periodStart?.toISOString() === renewal.periodStart &&
      seat?.accountId === account.id && seat.state === "occupied";
    const deadline = renewal ? p.expiresAt : seat?.reservedUntil;
    if (
      identity?.state !== "allowed" ||
      p.releasedAt ||
      p.state !== "reserved" ||
      (renewal ? !renewalAvailable : seat?.state !== "reserved") ||
      !deadline || deadline <= new Date()
    )
      throw new Error("Checkout reservation unavailable.");
    if (renewal) {
      const original = await readRenewalSource(tx, p.ownerUserId, renewal, provider, new Date());
      if (!original.paid || original.source.releasedAt) throw new Error("Your current payment needs billing resolution.");
    }
    const session = await storedSession(tx, p, provider, deadline);
    if (
      !session ||
      session.status !== "open" ||
      !session.url ||
      session.checkoutId !== p.id ||
      session.billingMode !== p.billingMode
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
      .where(p.snapshot?.renewal
        ? or(eq(sponsorSeats.checkoutId, p.id), eq(sponsorSeats.checkoutId, p.snapshot.renewal.sourceCheckoutId))
        : eq(sponsorSeats.checkoutId, p.id))
      .for("update");
    if (!p.priceId || !p.snapshot) return true;
    const renewal = p.snapshot.renewal;
    const denied = identity?.state !== "allowed" || ["revoked", "deleting"].includes(account?.state ?? "");
    const carriesPaidMonth = Boolean(renewal && account && account.id === renewal.accountId &&
      account.ownerUserId === p.ownerUserId && account.state === "active" && account.billingMode === "one_time" &&
      account.stripeCustomerId === renewal.customerId && account.periodStart?.toISOString() === renewal.periodStart &&
      account.paidThrough?.toISOString() === renewal.startsAt && seat?.accountId === account.id &&
      seat.state === "occupied" && seat.checkoutId === renewal.sourceCheckoutId);
    const session = await storedSession(
      tx,
      p,
      provider,
      renewal ? p.expiresAt : seat?.reservedUntil ?? null,
      !renewal,
    );
    if (!session) {
      if (renewal) {
        if (p.expiresAt > now && !denied && !p.releasedAt) return false;
        await releaseReservation(tx, p, now);
        return true;
      }
      if (seat?.state === "reserved" && !p.stripeSessionId)
        await releaseReservation(tx, p, now);
      return true;
    }
    if (session.checkoutId !== p.id || session.billingMode !== p.billingMode)
      throw new Error("Checkout owner binding mismatch.");
    let current = session;
    const once = p.billingMode === "one_time";
    const deadline = renewal ? p.expiresAt : seat?.reservedUntil;
    if (
      session.status === "open" &&
      (denied || p.releasedAt || !deadline || deadline <= now || renewal && !carriesPaidMonth)
    )
      current = await provider.expireSession(session.id);
    if (!once && current.status === "expired" && !current.subscriptionId) {
      if (!p.releasedAt) await releaseReservation(tx, p, now);
      return true;
    }
    if (once && current.status === "open") return false;
    if (renewal && current.status === "open") return false;
    if (!once && !current.subscriptionId) return false;
    if (once && !denied && account?.billingMode === "one_time" && account.paidThrough && account.paidThrough <= now && !p.releasedAt) {
      const [pending] = await tx.select().from(sponsorCheckouts).where(and(eq(sponsorCheckouts.ownerUserId, p.ownerUserId),
        eq(sponsorCheckouts.state, "reserved"), sql`${sponsorCheckouts.snapshot}->'renewal'->>'sourceCheckoutId' = ${p.id}`));
      if (pending) {
        await queueSponsorJob(tx, "reconcile", pending.id, `renewal-resolution:${pending.id}`, now);
        return false;
      }
    }
    if (
      p.stripeSubscriptionId &&
      p.stripeSubscriptionId !== current.subscriptionId
    )
      throw new Error("Subscription binding mismatch.");
    await tx
      .update(sponsorCheckouts)
      .set({ stripeSubscriptionId: current.subscriptionId })
      .where(eq(sponsorCheckouts.id, p.id));
    const readBilling = () =>
      once
        ? provider.observePayment(current.id)
        : provider.observe(current.subscriptionId!);
    let accessWithdrawn = false;
    const stopCollection = async () => {
      try {
        return await (once ? provider.settlePayment(current.id) : provider.terminate(current.subscriptionId!));
      } catch (error) {
        // Persist a verified refund/dispute pause even if Stripe settlement is
        // temporarily unavailable; the queued reconciliation retries collection.
        if (accessWithdrawn) return false;
        throw error;
      }
    };
    const observation = await readBilling();
    assertStripeObjectMode(observation);
    if (renewal && (once || observation.customerId !== renewal.customerId || observation.billingAnchor !== Date.parse(renewal.startsAt)))
      throw new Error("Monthly renewal customer or billing date mismatch.");
    if (
      observation.checkoutId !== p.id ||
      observation.subscriptionId !== current.subscriptionId ||
      (observation.billingMode ?? "subscription") !== p.billingMode
    )
      throw new Error("Subscription ownership mismatch.");
    if (p.snapshot.checkoutCurrency && observation.price.currency !== p.snapshot.checkoutCurrency)
      throw new Error("Checkout currency mismatch.");
    validateSponsorPrice(observation.price, p.priceId, false, p.billingMode);
    // A rejected renewal must never release the original account's paid seat.
    // Only an eligible source period or this checkout's own seat can be used.
    if (renewal && seat?.checkoutId !== p.id && (!carriesPaidMonth || denied || p.releasedAt || current.status !== "complete" || !["active", "past_due"].includes(observation.status))) {
      if (observation.invoices.some(invoice => invoice.paid && invoice.amountPaid > 0 && invoice.id !== p.paidInvoiceId))
        await tx.update(sponsorCheckouts).set({ exceptionCode: "late_payment_refund_review" }).where(eq(sponsorCheckouts.id, p.id));
      if (!(await stopCollection())) return false;
      await releaseReservation(tx, p, now);
      return true;
    }
    const ownedAccount =
      account &&
      (once
        ? account.billingMode === "one_time" &&
          seat?.accountId === account.id &&
          seat.checkoutId === p.id
        : account.stripeSubscriptionId === current.subscriptionId || carriesPaidMonth)
        ? account
        : null;
    if (
      ownedAccount &&
      ownedAccount.stripeCustomerId !== observation.customerId
    )
      throw new Error("Billing customer ownership mismatch.");
    // Refund observations can end reconciliation before the entitlement update.
    // One-time provider observations prefix the original payment ID with refund:.
    if (account)
      for (const invoice of observation.invoices.filter(
        (i) => (i.paid || i.refunded) && i.priceId === p.priceId,
      )) {
        const paymentId = invoice.id.replace(/^refund:/, "");
        if (once && paymentId !== p.paidInvoiceId) continue;
        // The verified checkout + recorded payment identifies historical spend;
        // a later seat or subscription must not be changed by this adjustment.
        await tx
          .update(sponsorDeliveryPeriods)
          .set({ baseAmount: invoice.netBaseAmount === undefined
            ? (invoice.refunded ? null : observation.price.unitAmount!)
            : invoice.netBaseAmount })
          .where(
            and(
              eq(sponsorDeliveryPeriods.accountId, account.id),
              eq(sponsorDeliveryPeriods.paymentId, paymentId),
              eq(sponsorDeliveryPeriods.currency, invoice.currency),
            ),
          );
      }
    const previous = {
      paidThrough: ownedAccount?.paidThrough?.getTime() ?? null,
      periodStart: ownedAccount?.periodStart?.getTime() ?? null,
    };
    let decision = billingDecision(
      observation,
      previous,
      now.getTime(),
      p.priceId,
    );
    let sourceDisputed = false;
    if (renewal && ownedAccount && (decision.periodStart ?? 0) < Date.parse(renewal.startsAt)) {
      const original = await readRenewalSource(tx, p.ownerUserId, renewal, provider, now);
      if (!original.paid) {
        await tx.update(sponsorAccounts).set({ state: original.disputed ? original.decision.state : "inactive",
          recoveryDeadline: original.disputed && original.decision.recoveryDeadline ? new Date(original.decision.recoveryDeadline) : null,
          cancelAtPeriodEnd: true, updatedAt: now }).where(eq(sponsorAccounts.id, ownedAccount.id));
        accessWithdrawn = true;
        invalidated = true;
        await queueSponsorJob(tx, "reconcile", renewal.sourceCheckoutId, `renewal-source:${p.id}`, now);
        if (!(await stopCollection())) return false;
        if (carriesPaidMonth) {
          await releaseReservation(tx, p, now);
          return true;
        }
        // A refund/dispute of the carried month cannot be hidden behind the
        // newly authorized subscription. Stop collection and pause its access.
        sourceDisputed = original.disputed;
        decision = { ...original.decision, invoiceId: null,
          state: original.disputed ? original.decision.state : "inactive",
          terminate: original.disputed ? original.decision.terminate : true };
        observation.cancelAtPeriodEnd = true;
      }
    }
    const disputedPeriod = sourceDisputed || observation.invoices.some(i => i.disputeState &&
      i.priceId === p.priceId && i.currency === observation.price.currency &&
      i.periodStart === decision.periodStart && i.periodEnd === decision.paidThrough);
    if (disputedPeriod || p.exceptionCode === "payment_dispute")
      await tx.update(sponsorCheckouts)
        .set({ exceptionCode: disputedPeriod ? "payment_dispute" : null })
        .where(eq(sponsorCheckouts.id, p.id));
    const refunded = once && observation.invoices.some((i) => i.refunded);
    if (once && !denied && !seat && account?.billingMode === "subscription" && (refunded || disputedPeriod)) {
      const [currentSeat] = await tx.select().from(sponsorSeats).where(eq(sponsorSeats.accountId, account.id));
      const [currentCheckout] = currentSeat?.checkoutId ? await tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id, currentSeat.checkoutId)) : [];
      const carried = currentCheckout?.snapshot?.renewal;
      if (carried?.sourceCheckoutId === p.id && carried.accountId === account.id &&
        account.periodStart?.toISOString() === carried.periodStart && account.paidThrough?.toISOString() === carried.startsAt) {
        await tx.update(sponsorAccounts).set({ state: disputedPeriod ? decision.state : "inactive",
          recoveryDeadline: decision.recoveryDeadline ? new Date(decision.recoveryDeadline) : null,
          cancelAtPeriodEnd: true, updatedAt: now }).where(eq(sponsorAccounts.id, account.id));
        await tx.update(sponsorCheckouts).set({ exceptionCode: disputedPeriod ? "payment_dispute" : "original_payment_reversed" }).where(eq(sponsorCheckouts.id, currentCheckout.id));
        await queueSponsorJob(tx, "reconcile", currentCheckout.id, `source-payment:${p.id}:${now.getTime()}`, now);
        accessWithdrawn = true;
        invalidated = true;
      }
    }
    if (
      denied ||
      p.releasedAt ||
      !seat ||
      refunded ||
      (account && !ownedAccount && account.state !== "inactive")
    ) {
      const latest = observation.invoices
        .filter((i) => i.paid || i.refunded)
        .sort((a, b) => b.periodEnd - a.periodEnd)[0];
      if (latest && latest.id !== p.paidInvoiceId)
        await tx
          .update(sponsorCheckouts)
          .set({ exceptionCode: "late_payment_refund_review" })
          .where(eq(sponsorCheckouts.id, p.id));
      if (refunded && ownedAccount && !denied) {
        await tx
          .update(sponsorAccounts)
          .set({ state: "inactive", recoveryDeadline: null, updatedAt: now })
          .where(eq(sponsorAccounts.id, ownedAccount.id));
        accessWithdrawn = true;
        invalidated = true;
      }
      const safe = await stopCollection();
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
      }
      await tx.update(sponsorCheckouts).set({ releasedAt: p.releasedAt ?? now,
        state: p.state === "reserved" ? "expired" : p.state }).where(eq(sponsorCheckouts.id, p.id));
      return true;
    }
    if (decision.state === "pending") {
      if (
        seat.reservedUntil &&
        seat.reservedUntil > now &&
        current.status !== "expired" &&
        !["canceled", "incomplete_expired"].includes(observation.status)
      )
        return false;
      if (!(await stopCollection())) return false;
      if (once && (await readBilling()).invoices.some((i) => i.paid))
        return false;
      await releaseReservation(tx, p, now);
      return true;
    }
    if (!decision.paidThrough || !decision.periodStart)
      throw new Error("Paid period unavailable.");
    const paidInvoice = observation.invoices.find(
      (invoice) => invoice.id === decision.invoiceId && invoice.paid,
    );
    const values = {
      state: decision.state,
      stripeCustomerId: observation.customerId,
      stripeSubscriptionId: observation.subscriptionId,
      paidThrough: new Date(decision.paidThrough),
      periodStart: new Date(decision.periodStart),
      // Payment can arrive after a subscription period starts. Keep Stripe's
      // verified payment timestamp separate from the coverage dates.
      paidAt: paidInvoice?.paidAt && Number.isFinite(paidInvoice.paidAt)
        ? new Date(paidInvoice.paidAt)
        : ownedAccount?.periodStart?.getTime() === decision.periodStart
          ? ownedAccount.paidAt
          : null,
      recoveryDeadline: decision.recoveryDeadline
        ? new Date(decision.recoveryDeadline)
        : null,
      cancelAtPeriodEnd: observation.cancelAtPeriodEnd,
      billingCurrency: observation.price.currency,
      billingMode: p.billingMode,
      billingInterval: once ? "month" : observation.price.interval!,
      billingIntervalCount: once ? 1 : observation.price.intervalCount!,
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
    if (decision.state !== "active") accessWithdrawn = true;
    await tx
      .update(sponsorSeats)
      .set({
        state: decision.terminate ? "releasing" : "occupied",
        accountId: account.id,
        checkoutId: p.id,
        reservedUntil: null,
      })
      .where(eq(sponsorSeats.slot, seat.slot));
    if (paidInvoice)
      await tx
        .insert(sponsorDeliveryPeriods)
        .values({
          accountId: account.id,
          paymentId: paidInvoice.id,
          startAt: new Date(paidInvoice.periodStart),
          endAt: new Date(paidInvoice.periodEnd),
          baseAmount: paidInvoice.netBaseAmount === undefined
            ? observation.price.unitAmount!
            : paidInvoice.netBaseAmount,
          currency: paidInvoice.currency,
        })
        .onConflictDoNothing();
    await tx
      .update(sponsorCheckouts)
      .set({
        state: "completed",
        paymentReceivedAt: p.paymentReceivedAt ?? (paidInvoice || !renewal ? now : null),
        paidInvoiceId: decision.invoiceId ?? p.paidInvoiceId,
      })
      .where(eq(sponsorCheckouts.id, p.id));
    invalidated = true;
    if (decision.terminate) {
      if (!(await stopCollection())) return false;
      // Re-read after stopping collection so an in-flight success becomes an
      // explicit exception, never entitlement after the seat is reused.
      let final;
      try { final = await readBilling(); }
      catch (error) {
        if (accessWithdrawn) return false;
        throw error;
      }
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
    if (disputedPeriod) return false;
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
