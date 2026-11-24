import type { ProBillingProvider, ProChargeFacts, ProCheckoutFacts, ProInvoiceFacts, ProSubscriptionFacts } from "./stripe";

/** Deterministic in-memory stand-in for Stripe. Test fixtures only; never wired into runtime code. */
export function createFakeProvider() {
  let seq = 0;
  const id = (prefix: string) => `${prefix}_${String(++seq).padStart(8, "0")}`;
  const state = {
    customers: new Map<string, string>(),
    checkoutAttempts: new Map<string, string>(),
    checkouts: new Map<string, ProCheckoutFacts>(),
    subscriptions: new Map<string, ProSubscriptionFacts>(),
    invoices: new Map<string, ProInvoiceFacts>(),
    charges: new Map<string, ProChargeFacts>(),
    disputes: new Map<string, { id: string; status: string; chargeId: string | null }>(),
    canceled: [] as string[],
    calls: [] as string[],
  };
  const provider: ProBillingProvider = {
    async ensureCustomer({ userId, existingCustomerId }) {
      state.calls.push("ensureCustomer");
      if (existingCustomerId) return existingCustomerId;
      const prior = [...state.customers].find(([, owner]) => owner === userId);
      if (prior) return prior[0];
      const customer = id("cus");
      state.customers.set(customer, userId);
      return customer;
    },
    async subscriptionCheckout({ userId, customerId, attemptId }) {
      const prior = state.checkoutAttempts.get(attemptId);
      if (prior) return { id: prior, url: `https://checkout.test/${prior}` };
      const session = id("cs");
      state.checkoutAttempts.set(attemptId, session);
      state.checkouts.set(session, { id: session, mode: "subscription", status: "open", customerId, subscriptionId: null, userId, attemptId, url: `https://checkout.test/${session}` });
      return { id: session, url: `https://checkout.test/${session}` };
    },
    async findSubscriptionCheckout({ customerId, attemptId }) {
      return structuredClone([...state.checkouts.values()].find((s) => s.customerId === customerId && s.attemptId === attemptId) ?? null);
    },
    async expireCheckout(sessionId) {
      const session = state.checkouts.get(sessionId)!;
      if (session.status === "open") session.status = "expired";
      return structuredClone(session);
    },
    async portal() { return "https://billing.test/portal"; },
    async setCancelAtPeriodEnd(subscriptionId, cancel) {
      const sub = state.subscriptions.get(subscriptionId)!;
      sub.cancelAtPeriodEnd = cancel;
      return sub;
    },
    async cancelImmediately(subscriptionId) {
      state.canceled.push(subscriptionId);
      const sub = state.subscriptions.get(subscriptionId)!;
      sub.status = "canceled";
      sub.endedAt = new Date();
    },
    async checkout(sessionId) { return structuredClone(state.checkouts.get(sessionId)!); },
    async subscription(subscriptionId) { return structuredClone(state.subscriptions.get(subscriptionId)!); },
    async invoice(invoiceId) { return structuredClone(state.invoices.get(invoiceId)!); },
    async charge(chargeId) { return structuredClone(state.charges.get(chargeId)!); },
    async dispute(disputeId) { return structuredClone(state.disputes.get(disputeId)!); },
  };

  /** Simulate Stripe completing a subscription checkout and its first paid invoice. */
  function completeSubscription(sessionId: string, period: { start: Date; end: Date }) {
    const session = state.checkouts.get(sessionId)!;
    const subscriptionId = id("sub");
    state.subscriptions.set(subscriptionId, { id: subscriptionId, customerId: session.customerId!, userId: session.userId, status: "active", priceId: "price_pro", currentPeriodStart: period.start, currentPeriodEnd: period.end, cancelAtPeriodEnd: false, endedAt: null });
    Object.assign(session, { status: "complete", subscriptionId });
    const invoiceId = payRenewal(subscriptionId, period);
    return { subscriptionId, invoiceId };
  }
  function payRenewal(subscriptionId: string, period: { start: Date; end: Date }, paid = true) {
    const sub = state.subscriptions.get(subscriptionId)!;
    Object.assign(sub, { currentPeriodStart: period.start, currentPeriodEnd: period.end, status: paid ? "active" : "past_due" });
    const invoiceId = id("in");
    state.invoices.set(invoiceId, { id: invoiceId, status: paid ? "paid" : "open", customerId: sub.customerId, subscriptionId, paid, subscriptionPeriod: { ...period, priceId: "price_pro" }, paidAt: paid ? period.start : null });
    return invoiceId;
  }
  /** A card charge on the subscription, for dispute scenarios. */
  function chargeFor(subscriptionId: string) {
    const charge = id("ch");
    state.charges.set(charge, { id: charge, customerId: state.subscriptions.get(subscriptionId)!.customerId });
    return charge;
  }
  return { provider, state, completeSubscription, payRenewal, chargeFor, id };
}
