import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { sponsorAccounts, sponsorCheckouts, sponsorSeats } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { lockSponsorOwner, withSponsorWrite } from "./repository";
import { queueSponsorJob } from "./jobs-store";
import { billingDecision } from "./billing";
import { isSponsorCurrency } from "./pricing";
import type { BillingProvider } from "./stripe-client";
import type { SponsorCheckoutSnapshot, SponsorshipResult } from "./types";

export type RenewalBinding = NonNullable<SponsorCheckoutSnapshot["renewal"]>;

export async function readRenewalSource(tx: WriteTx, owner: string, binding: RenewalBinding, provider: BillingProvider, now: Date) {
  const [source] = await tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id, binding.sourceCheckoutId));
  if (!source?.stripeSessionId || source.ownerUserId !== owner || source.billingMode !== "one_time" ||
    source.state !== "completed" || !source.priceId || !source.paidInvoiceId || source.snapshot?.renewal ||
    !Number.isFinite(Date.parse(binding.startsAt)) || !Number.isFinite(Date.parse(binding.periodStart)))
    throw new Error("Original paid month is unavailable.");
  const observation = await provider.observePayment(source.stripeSessionId);
  if (observation.checkoutId !== source.id || observation.customerId !== binding.customerId ||
    observation.billingMode !== "one_time" || observation.subscriptionId !== null ||
    (source.snapshot?.checkoutCurrency && observation.price.currency !== source.snapshot.checkoutCurrency))
    throw new Error("Original payment binding mismatch.");
  const decision = billingDecision(observation, {
    periodStart: Date.parse(binding.periodStart), paidThrough: Date.parse(binding.startsAt),
  }, now.getTime(), source.priceId);
  const receipt = observation.invoices.find(invoice => invoice.id.replace(/^refund:/, "") === source.paidInvoiceId &&
    invoice.periodStart === Date.parse(binding.periodStart) && invoice.periodEnd === Date.parse(binding.startsAt));
  return { source, observation, decision,
    paid: Boolean(receipt?.paid && !receipt.refunded && !receipt.disputeState && decision.invoiceId === source.paidInvoiceId),
    disputed: Boolean(receipt?.disputeState), refunded: Boolean(receipt?.refunded),
  };
}

export async function prepareMonthlyRenewal(owner: string, priceId: string, provider: BillingProvider, now = new Date()): Promise<SponsorshipResult<{ checkoutId: string }>> {
  return withSponsorWrite(async tx => {
    await lockSponsorOwner(tx, owner);
    const [account] = await tx.select().from(sponsorAccounts).where(eq(sponsorAccounts.ownerUserId, owner)).for("update");
    const [seat] = account ? await tx.select().from(sponsorSeats).where(eq(sponsorSeats.accountId, account.id)).for("update") : [];
    const [source] = seat?.checkoutId ? await tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id, seat.checkoutId)) : [];
    if (!account || account.state !== "active" || account.billingMode !== "one_time" || !account.periodStart || !account.paidThrough || !account.stripeCustomerId ||
      !isSponsorCurrency(account.billingCurrency) || seat?.state !== "occupied" || !source?.snapshot || source.state !== "completed" || source.releasedAt || source.ownerUserId !== owner || source.billingMode !== "one_time")
      return { ok: false, code: "conflict", message: "An active, paid one-time month is required to switch to monthly billing." };
    const binding: RenewalBinding = { accountId: account.id, sourceCheckoutId: source.id,
      periodStart: account.periodStart.toISOString(), startsAt: account.paidThrough.toISOString(), customerId: account.stripeCustomerId };
    const original = await readRenewalSource(tx, owner, binding, provider, now);
    if (!original.paid || original.decision.state !== "active" || original.observation.price.currency !== account.billingCurrency)
      return { ok: false, code: "conflict", message: "Your current payment needs billing resolution before you can change plans." };
    const [pending] = await tx.select().from(sponsorCheckouts).where(and(eq(sponsorCheckouts.ownerUserId, owner), inArray(sponsorCheckouts.state, ["preparing", "ready", "reserved"])));
    if (pending) {
      if (pending.state === "reserved" && pending.snapshot?.renewal?.sourceCheckoutId === source.id && !pending.releasedAt)
        return { ok: true, value: { checkoutId: pending.id } };
      return { ok: false, code: "conflict", message: "Finish or let your current checkout expire before changing billing." };
    }
    const expiresAt = new Date(Math.ceil(now.getTime() / 1000) * 1000 + 1805000);
    if (expiresAt.getTime() + 5000 >= account.paidThrough.getTime())
      return { ok: false, code: "conflict", message: "Your paid month is ending shortly. Choose monthly billing after it ends." };
    await provider.price(priceId, "subscription");
    const [checkout] = await tx.insert(sponsorCheckouts).values({
      ownerUserId: owner, campaignId: source.campaignId, state: "reserved", revision: source.revision,
      priceId, billingMode: "subscription", expiresAt,
      snapshot: { ...source.snapshot, checkoutCurrency: account.billingCurrency, renewal: binding },
    }).returning();
    await queueSponsorJob(tx, "reconcile", checkout.id, `checkout:${checkout.id}`);
    return { ok: true, value: { checkoutId: checkout.id } };
  });
}
