export type SubscriptionFacts = {
  stripeSubscriptionId: string;
  status: string;
  paidThrough: Date | null;
  endedAt: Date | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
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
  account: { state: string } | null;
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
  // A formal dispute pauses Pro usage; the subscription and history are untouched.
  if (input.paymentReviewHold) return { active: false, reason: "payment_review", paidThrough: current.paidThrough };
  return { active: true, subscription: current, paidThrough: current.paidThrough! };
}

/** Formal disputes hold access until won, or until a later valid payment after a loss. */
export function disputeHoldActive(status: string) {
  return !["won", "warning_closed"].includes(status);
}
