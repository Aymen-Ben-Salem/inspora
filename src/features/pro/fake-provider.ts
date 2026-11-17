import type { ProBillingProvider, ProChargeFacts, ProCheckoutFacts, ProInvoiceFacts, ProPaymentIntentFacts, ProSubscriptionFacts } from "./stripe";

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
    paymentIntents: new Map<string, ProPaymentIntentFacts>(),
    disputes: new Map<string, { id: string; status: string; chargeId: string | null }>(),
    canceled: [] as string[],
    packTotalCents: 500,
    payOutcome: "paid" as "paid" | "failed" | "requires_action",
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
      state.checkouts.set(session, { id: session, mode: "subscription", status: "open", paymentStatus: "unpaid", customerId, subscriptionId: null, paymentIntentId: null, amountTotal: 700, userId, purchaseId: null, attemptId, url: `https://checkout.test/${session}` });
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
    async cancelCheckoutPayment(intentId) {
      const intent = state.paymentIntents.get(intentId)!;
      if (intent.status === "canceled") return;
      if (intent.status !== "requires_capture") throw new Error("Checkout payment is not cancelable yet.");
      intent.status = "canceled";
    },
    async packCheckout({ userId, customerId, purchaseId }) {
      const session = id("cs");
      state.checkouts.set(session, { id: session, mode: "payment", status: "open", paymentStatus: "unpaid", customerId, subscriptionId: null, paymentIntentId: null, amountTotal: state.packTotalCents, userId, purchaseId });
      return { id: session, url: `https://checkout.test/${session}` };
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
    async paymentIntent(intentId) {
      const saved = state.paymentIntents.get(intentId);
      if (saved) return structuredClone(saved);
      const checkout = [...state.checkouts.values()].find((c) => c.paymentIntentId === intentId)!;
      return { id: intentId, status: checkout.paymentStatus === "paid" ? "succeeded" : "requires_payment_method", customerId: checkout.customerId, amountReceived: checkout.paymentStatus === "paid" ? checkout.amountTotal! : 0, purchaseId: checkout.purchaseId };
    },
    async previewPack() { state.calls.push("previewPack"); return state.packTotalCents; },
    async findAutomaticInvoice(customerId, purchaseId) { return [...state.invoices.values()].find((invoice) => invoice.customerId === customerId && invoice.purchaseId === purchaseId)?.id ?? null; },
    async cancelAutomaticInvoice({ invoiceId, customerId, purchaseId }) {
      state.calls.push("cancelAutomaticInvoice");
      const invoice = state.invoices.get(invoiceId);
      if (!invoice) return "canceled";
      if (invoice.customerId !== customerId || invoice.purchaseId !== purchaseId) throw new Error("Automatic invoice ownership mismatch.");
      if (invoice.paid) return "paid";
      if (!["open", "draft", "void", "uncollectible"].includes(invoice.status ?? "")) return "pending";
      invoice.status = "void";
      return "canceled";
    },
    async chargePack({ customerId, purchaseId, maxCents }) {
      state.calls.push("chargePack");
      const prior = [...state.invoices.values()].find((invoice) => invoice.purchaseId === purchaseId);
      if (prior) {
        if (!prior.paid && state.payOutcome === "paid" && prior.status === "open") Object.assign(prior, { status: "paid", paid: true, amountPaid: prior.total, paidAt: new Date() });
        return { invoiceId: prior.id, outcome: prior.paid ? "paid" : "requires_action", amountCents: prior.total };
      }
      const invoiceId = id("in");
      const total = state.packTotalCents;
      if (total > maxCents) {
        state.invoices.set(invoiceId, { id: invoiceId, status: "void", customerId, subscriptionId: null, purchaseId, paid: false, amountPaid: 0, total, subscriptionPeriod: null });
        return { invoiceId, outcome: "over_cap", amountCents: total };
      }
      const paid = state.payOutcome === "paid";
      state.invoices.set(invoiceId, { id: invoiceId, status: paid ? "paid" : "open", customerId, subscriptionId: null, purchaseId, paid, amountPaid: paid ? total : 0, total, subscriptionPeriod: null, paidAt: paid ? new Date() : null });
      return { invoiceId, outcome: state.payOutcome, amountCents: total };
    },
  };

  /** Simulate Stripe completing a subscription checkout and its first paid invoice. */
  function completeSubscription(sessionId: string, period: { start: Date; end: Date }, options: { paymentMethod?: string | null } = {}) {
    const session = state.checkouts.get(sessionId)!;
    const subscriptionId = id("sub");
    state.subscriptions.set(subscriptionId, { id: subscriptionId, customerId: session.customerId!, userId: session.userId, status: "active", priceId: "price_pro", currentPeriodStart: period.start, currentPeriodEnd: period.end, cancelAtPeriodEnd: false, endedAt: null, defaultPaymentMethodId: options.paymentMethod === undefined ? "pm_card" : options.paymentMethod });
    Object.assign(session, { status: "complete", paymentStatus: "paid", subscriptionId });
    const invoiceId = payRenewal(subscriptionId, period);
    return { subscriptionId, invoiceId };
  }
  function payRenewal(subscriptionId: string, period: { start: Date; end: Date }, paid = true) {
    const sub = state.subscriptions.get(subscriptionId)!;
    Object.assign(sub, { currentPeriodStart: period.start, currentPeriodEnd: period.end, status: paid ? "active" : "past_due" });
    const invoiceId = id("in");
    state.invoices.set(invoiceId, { id: invoiceId, status: paid ? "paid" : "open", customerId: sub.customerId, subscriptionId, purchaseId: null, paid, amountPaid: paid ? 700 : 0, total: 700, subscriptionPeriod: { ...period, priceId: "price_pro" }, paidAt: paid ? period.start : null });
    return invoiceId;
  }
  function completePack(sessionId: string) {
    const session = state.checkouts.get(sessionId)!;
    const intent = id("pi");
    Object.assign(session, { status: "complete", paymentStatus: "paid", paymentIntentId: intent });
    const charge = id("ch");
    state.charges.set(charge, { id: charge, customerId: session.customerId, paymentIntentId: intent, invoiceId: null, amount: session.amountTotal!, amountRefunded: 0 });
    return { intent, charge };
  }
  return { provider, state, completeSubscription, payRenewal, completePack, id };
}
