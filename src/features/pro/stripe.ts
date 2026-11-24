import "server-only";
import Stripe from "stripe";
import { proStripeConfig } from "./config";
import { assertProStripeObjectMode, assertProStripeSecretKey } from "./payment-environment";

/** Provider-neutral facts. Every access decision re-reads these from Stripe, never from a webhook payload or return URL. */
export type ProCheckoutFacts = {
  id: string;
  mode: string;
  status: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  userId: string | null;
  url?: string | null;
  attemptId?: string | null;
};
export type ProSubscriptionFacts = {
  id: string;
  customerId: string;
  userId: string | null;
  status: string;
  priceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  isPro?: boolean;
};
export type ProInvoiceFacts = {
  id: string;
  status: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  paid: boolean;
  subscriptionPeriod: { start: Date; end: Date; priceId: string } | null;
  paidAt?: Date | null;
};
export type ProChargeFacts = { id: string; customerId: string | null };
export type ProDisputeFacts = { id: string; status: string; chargeId: string | null };

export interface ProBillingProvider {
  ensureCustomer(input: { userId: string; existingCustomerId: string | null }): Promise<string>;
  subscriptionCheckout(input: { userId: string; customerId: string; attemptId: string; createdAt: Date; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string }>;
  findSubscriptionCheckout(input: { customerId: string; attemptId: string }): Promise<ProCheckoutFacts | null>;
  expireCheckout(id: string): Promise<ProCheckoutFacts>;
  portal(input: { customerId: string; returnUrl: string }): Promise<string>;
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<ProSubscriptionFacts>;
  cancelImmediately(subscriptionId: string): Promise<void>;
  checkout(id: string): Promise<ProCheckoutFacts>;
  subscription(id: string): Promise<ProSubscriptionFacts>;
  invoice(id: string): Promise<ProInvoiceFacts>;
  charge(id: string): Promise<ProChargeFacts>;
  dispute(id: string): Promise<ProDisputeFacts>;
}

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));
const date = (seconds: number) => new Date(seconds * 1000);

export function createProStripeProvider(stripe: Stripe, config = proStripeConfig()): ProBillingProvider {
  if (!config) throw new Error("Pro Stripe price is not configured.");
  const checkoutTax = config.automaticTax
    ? { automatic_tax: { enabled: true }, billing_address_collection: "required" as const, customer_update: { address: "auto" as const, name: "auto" as const } }
    : {};

  function checkoutFacts(session: Stripe.Checkout.Session): ProCheckoutFacts {
    assertProStripeObjectMode(session);
    return {
      id: session.id, mode: session.mode, status: session.status,
      customerId: idOf(session.customer), subscriptionId: idOf(session.subscription),
      userId: session.metadata?.inspora_pro_user_id ?? null, attemptId: session.metadata?.inspora_pro_attempt_id ?? null,
      url: session.url,
    };
  }

  async function subscription(id: string): Promise<ProSubscriptionFacts> {
    const sub = await stripe.subscriptions.retrieve(id);
    assertProStripeObjectMode(sub);
    const item = sub.items.data[0];
    const isPro = sub.items.data.length === 1 && item.quantity === 1 && item.price.id === config!.subscriptionPriceId;
    return {
      id: sub.id,
      customerId: idOf(sub.customer)!,
      userId: sub.metadata.inspora_pro_user_id ?? null,
      status: sub.status,
      priceId: item?.price.id ?? "",
      currentPeriodStart: date(item?.current_period_start ?? 0),
      currentPeriodEnd: date(item?.current_period_end ?? 0),
      cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at != null,
      endedAt: sub.ended_at ? date(sub.ended_at) : null,
      isPro,
    };
  }

  return {
    async ensureCustomer({ userId, existingCustomerId }) {
      if (existingCustomerId) return existingCustomerId;
      // Dedicated Pro customer; never reuses sponsorship customer records.
      const customer = await stripe.customers.create(
        { metadata: { inspora_pro_user_id: userId, inspora_product: "pro" } },
        { idempotencyKey: `inspora-pro-customer:${userId}` },
      );
      assertProStripeObjectMode(customer);
      return customer.id;
    },
    async subscriptionCheckout({ userId, customerId, attemptId, createdAt, successUrl, cancelUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        adaptive_pricing: { enabled: false },
        customer: customerId,
        client_reference_id: userId,
        line_items: [{ price: config.subscriptionPriceId, quantity: 1 }],
        subscription_data: { metadata: { inspora_pro_user_id: userId } },
        metadata: { inspora_pro_user_id: userId, inspora_pro_kind: "subscription", inspora_pro_attempt_id: attemptId },
        // Fixed for this persisted attempt, including retries with an unknown first response.
        expires_at: Math.floor(createdAt.getTime() / 1000) + 60 * 60,
        success_url: successUrl,
        cancel_url: cancelUrl,
        ...checkoutTax,
      }, { idempotencyKey: `inspora-pro-subscription-checkout:${attemptId}` });
      assertProStripeObjectMode(session);
      if (!session.url) throw new Error("Checkout is unavailable.");
      return { id: session.id, url: session.url };
    },
    async findSubscriptionCheckout({ customerId, attemptId }) {
      for await (const session of stripe.checkout.sessions.list({ customer: customerId, limit: 100 })) {
        if (session.metadata?.inspora_pro_attempt_id === attemptId) return checkoutFacts(session);
      }
      return null;
    },
    async expireCheckout(id) {
      const session = await stripe.checkout.sessions.retrieve(id);
      assertProStripeObjectMode(session);
      if (session.status !== "open") return checkoutFacts(session);
      try { return checkoutFacts(await stripe.checkout.sessions.expire(id)); }
      catch {
        // Completion can race expiration. Re-read; never discard a completed subscription.
        const current = await stripe.checkout.sessions.retrieve(id);
        if (current.status === "open") throw new Error("Checkout expiration remains pending.");
        return checkoutFacts(current);
      }
    },
    async portal({ customerId, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
        ...(config.portalConfigurationId ? { configuration: config.portalConfigurationId } : {}),
      });
      return session.url;
    },
    async setCancelAtPeriodEnd(id, cancel) {
      if (!(await subscription(id)).isPro) throw new Error("Unexpected Pro subscription configuration.");
      await stripe.subscriptions.update(id, { cancel_at_period_end: cancel });
      return subscription(id);
    },
    async cancelImmediately(id) {
      const sub = await stripe.subscriptions.retrieve(id);
      assertProStripeObjectMode(sub);
      if (sub.items.data.length !== 1 || sub.items.data[0].price.id !== config.subscriptionPriceId)
        throw new Error("Unexpected Pro subscription configuration.");
      if (sub.status === "canceled" || sub.status === "incomplete_expired") return;
      // No proration or automatic refund; mandatory-law remedies are handled separately.
      await stripe.subscriptions.cancel(id, { prorate: false, invoice_now: false });
    },
    async checkout(id) {
      return checkoutFacts(await stripe.checkout.sessions.retrieve(id));
    },
    subscription,
    async invoice(id) {
      const invoice = await stripe.invoices.retrieve(id);
      assertProStripeObjectMode(invoice);
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
      let subscriptionPeriod: ProInvoiceFacts["subscriptionPeriod"] = null;
      if (subscriptionId) {
        const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 20 });
        const recurring = lines.data.filter((line) => line.parent?.type === "subscription_item_details" && idOf(line.pricing?.price_details?.price) === config.subscriptionPriceId);
        if (!lines.has_more && recurring.length === 1 && recurring[0].quantity === 1)
          subscriptionPeriod = { start: date(recurring[0].period.start), end: date(recurring[0].period.end), priceId: config.subscriptionPriceId };
      }
      return {
        id: invoice.id,
        status: invoice.status,
        customerId: idOf(invoice.customer),
        subscriptionId,
        paid: invoice.status === "paid" && invoice.amount_remaining === 0,
        subscriptionPeriod,
        paidAt: invoice.status_transitions.paid_at ? date(invoice.status_transitions.paid_at) : null,
      };
    },
    async charge(id) {
      const charge = await stripe.charges.retrieve(id);
      assertProStripeObjectMode(charge);
      return { id: charge.id, customerId: idOf(charge.customer) };
    },
    async dispute(id) {
      const dispute = await stripe.disputes.retrieve(id);
      assertProStripeObjectMode(dispute);
      return { id: dispute.id, status: dispute.status, chargeId: idOf(dispute.charge) };
    },
  };
}

export function proStripeClient() {
  assertProStripeSecretKey();
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 10000 });
}

export function proBillingProvider() {
  return createProStripeProvider(proStripeClient());
}
