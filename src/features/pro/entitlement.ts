import { AUTO_RECHARGE } from "./config";

export type SubscriptionFacts = {
  stripeSubscriptionId: string;
  status: string;
  paidThrough: Date | null;
  endedAt: Date | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
};

export type AccountFacts = {
  state: string;
  includedBalance: number;
  includedPeriodKey: string | null;
  includedPeriodStart: Date | null;
  includedPeriodEnd: Date | null;
  purchasedBalance: number;
  autoRechargeEnabled: boolean;
  autoRechargeCapCents: number | null;
  autoRechargeSubscriptionId: string | null;
};

export type InactiveReason = "no_account" | "closed" | "no_active_subscription" | "payment_review";
export type Entitlement =
  | { active: true; subscription: SubscriptionFacts; paidThrough: Date }
  | { active: false; reason: InactiveReason; paidThrough: Date | null };

/**
 * Pro access is current paid-through time from verified paid invoices. Stripe's
 * own period advances when a renewal invoice is created, before payment, so it
 * never extends access by itself: no unpaid grace period.
 */
export function evaluateEntitlement(input: {
  account: Pick<AccountFacts, "state"> | null;
  subscriptions: SubscriptionFacts[];
  paymentReviewHold: boolean;
  now: Date;
}): Entitlement {
  const { account, now } = input;
  const latestPaid = input.subscriptions
    .map((s) => s.paidThrough)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  if (!account) return { active: false, reason: "no_account", paidThrough: null };
  if (account.state !== "open") return { active: false, reason: "closed", paidThrough: latestPaid };
  const current = input.subscriptions
    .filter((s) => s.paidThrough && s.paidThrough > now && (!s.endedAt || s.endedAt > now))
    .sort((a, b) => b.paidThrough!.getTime() - a.paidThrough!.getTime())[0];
  if (!current) return { active: false, reason: "no_active_subscription", paidThrough: latestPaid };
  // A formal dispute pauses usage and recharge; balances and history are untouched.
  if (input.paymentReviewHold) return { active: false, reason: "payment_review", paidThrough: current.paidThrough };
  return { active: true, subscription: current, paidThrough: current.paidThrough! };
}

/** Included credits are only spendable inside the paid period they were granted for. */
export function spendableBalances(account: AccountFacts, now: Date) {
  const included = account.includedPeriodEnd && account.includedPeriodEnd > now ? account.includedBalance : 0;
  return { included, purchased: account.purchasedBalance, available: included + account.purchasedBalance };
}

/** Included first, then purchased. Returns null when the balance cannot cover the cost. */
export function splitCharge(balances: { included: number; purchased: number }, credits: number) {
  if (!Number.isSafeInteger(credits) || credits <= 0) throw new Error("Credit cost must be a positive integer.");
  if (balances.included + balances.purchased < credits) return null;
  const included = Math.min(balances.included, credits);
  return { included, purchased: credits - included };
}

export type RechargeDecision =
  | { start: true }
  | { start: false; reason: "not_enabled" | "inactive" | "consent_stale" | "above_threshold" | "in_progress" | "cap_insufficient" };

/**
 * Demand-driven only: called when a customer starts a new search, never on
 * enablement, status or detail requests. The next full tax-inclusive pack must
 * fit the remaining monthly cap, counting pending reservations.
 */
export function autoRechargeDecision(input: {
  account: AccountFacts;
  entitlement: Entitlement;
  availableBefore: number;
  openAutomaticPurchase: boolean;
  capSpentCents: number;
  estimatedChargeCents: number;
}): RechargeDecision {
  const { account, entitlement } = input;
  if (!account.autoRechargeEnabled || account.autoRechargeCapCents === null) return { start: false, reason: "not_enabled" };
  if (!entitlement.active) return { start: false, reason: "inactive" };
  if (account.autoRechargeSubscriptionId !== entitlement.subscription.stripeSubscriptionId)
    return { start: false, reason: "consent_stale" };
  if (input.availableBefore >= AUTO_RECHARGE.thresholdCredits) return { start: false, reason: "above_threshold" };
  if (input.openAutomaticPurchase) return { start: false, reason: "in_progress" };
  if (input.capSpentCents + input.estimatedChargeCents > account.autoRechargeCapCents)
    return { start: false, reason: "cap_insufficient" };
  return { start: true };
}

/** Pack refunds reverse unspent purchased credits proportionally; never below zero. */
export function refundReversalTarget(input: { credits: number; chargedCents: number; refundedCents: number }) {
  const { credits, chargedCents, refundedCents } = input;
  if (![credits, chargedCents, refundedCents].every(Number.isSafeInteger) || chargedCents <= 0 || refundedCents < 0 || refundedCents > chargedCents)
    throw new Error("Verified refund amounts are required.");
  return Math.floor((credits * refundedCents) / chargedCents);
}

/** Formal disputes hold access until won, or until a later valid payment after a loss. */
export function disputeHoldActive(status: string) {
  return !["won", "warning_closed"].includes(status);
}
