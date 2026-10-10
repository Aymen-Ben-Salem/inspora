import "server-only";
import Stripe from "stripe";
import {
  validateSponsorPrice,
  type BillingObservation,
  type SponsorPrice,
} from "./billing";
import { validatePreviewSponsorshipEnvironment } from "../../../scripts/lib/sponsorship-environment";

export type CheckoutSession = {
  id: string;
  status: string | null;
  url: string | null;
  subscriptionId: string | null;
  checkoutId: string;
  expiresAt: number;
};
export type BillingProvider = {
  price(id: string): Promise<SponsorPrice>;
  createCheckout(input: {
    checkoutId: string;
    priceId: string;
    key: string;
    expiresAt: number;
  }): Promise<CheckoutSession>;
  session(id: string): Promise<CheckoutSession>;
  findCheckout(
    checkoutId: string,
    reservedUntil: Date,
  ): Promise<CheckoutSession | null>;
  expireSession(id: string): Promise<CheckoutSession>;
  observe(subscriptionId: string): Promise<BillingObservation>;
  terminate(subscriptionId: string): Promise<boolean>;
  portal(customerId: string): Promise<string>;
  eventTarget(eventType: string, objectId: string): Promise<string | null>;
};
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_"))
    throw new Error("Stripe test configuration is unavailable.");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 10000 });
}
export function stripeCheckoutConfigured() {
  try {
    validatePreviewSponsorshipEnvironment(process.env);
  } catch {
    return false;
  }
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
    process.env.STRIPE_SPONSOR_PRICE_ID?.startsWith("price_") &&
    process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") &&
    process.env.STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID?.startsWith("bpc_"),
  );
}
function siteOrigin() {
  const url = new URL(process.env.SITE_URL ?? "http://localhost:3000");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("A canonical site origin is required.");
  return url.origin;
}
function testObject(object: { livemode?: boolean }) {
  if (object.livemode !== false)
    throw new Error("Stripe test objects are required.");
}
function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : (value?.id ?? null);
}
function priceView(p: Stripe.Price): SponsorPrice {
  return {
    id: p.id,
    livemode: p.livemode,
    active: p.active,
    currency: p.currency,
    unitAmount: p.unit_amount,
    interval: p.recurring?.interval ?? null,
    intervalCount: p.recurring?.interval_count ?? null,
    taxBehavior: p.tax_behavior ?? "unspecified",
  };
}
function sessionView(s: Stripe.Checkout.Session): CheckoutSession {
  testObject(s);
  if (s.mode !== "subscription")
    throw new Error("A subscription checkout is required.");
  return {
    id: s.id,
    status: s.status,
    url: s.url,
    subscriptionId: idOf(s.subscription),
    checkoutId: s.client_reference_id ?? "",
    expiresAt: s.expires_at * 1000,
  };
}
export function createStripeProvider(stripe: Stripe): BillingProvider {
  return {
    async price(id) {
      const p = priceView(await stripe.prices.retrieve(id));
      validateSponsorPrice(p, id);
      return p;
    },
    async createCheckout(input) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          client_reference_id: input.checkoutId,
          metadata: { sponsor_checkout_id: input.checkoutId },
          subscription_data: {
            metadata: { sponsor_checkout_id: input.checkoutId },
          },
          line_items: [{ price: input.priceId, quantity: 1 }],
          allowed_payment_method_types: ["card"],
          billing_address_collection: "required",
          tax_id_collection: { enabled: true, required: "never" },
          name_collection: {
            business: { enabled: true, optional: true },
            individual: { enabled: true },
          },
          custom_text: {
            submit: {
              message:
                "Business or professional promotion. USD 500 before applicable tax, renewing every exact 30 days. Cancel future renewal in Billing.",
            },
          },
          automatic_tax: {
            enabled: process.env.STRIPE_SPONSOR_AUTOMATIC_TAX === "true",
          },
          expires_at: Math.ceil(input.expiresAt / 1000),
          success_url: `${siteOrigin()}/sponsor/dashboard`,
          cancel_url: `${siteOrigin()}/sponsor/dashboard`,
        },
        { idempotencyKey: input.key },
      );
      return sessionView(session);
    },
    async session(id) {
      return sessionView(await stripe.checkout.sessions.retrieve(id));
    },
    async findCheckout(checkoutId, reservedUntil) {
      let match: CheckoutSession | null = null,
        scanned = 0;
      for await (const session of stripe.checkout.sessions.list({
        created: {
          gte: Math.floor((reservedUntil.getTime() - 1805000) / 1000) - 5,
          lte: Math.ceil(reservedUntil.getTime() / 1000),
        },
        limit: 100,
      })) {
        testObject(session);
        if (++scanned > 1000)
          throw new Error("Checkout lookup requires administrator resolution.");
        if (session.client_reference_id !== checkoutId) continue;
        if (match)
          throw new Error(
            "Duplicate provider checkout requires administrator resolution.",
          );
        match = sessionView(session);
      }
      return match;
    },
    async expireSession(id) {
      const s = await stripe.checkout.sessions.retrieve(id);
      testObject(s);
      return s.status === "open"
        ? sessionView(await stripe.checkout.sessions.expire(id))
        : sessionView(s);
    },
    async observe(subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      testObject(sub);
      if (
        sub.items.data.length !== 1 ||
        sub.items.data[0].quantity !== 1 ||
        sub.trial_start ||
        sub.pause_collection
      )
        throw new Error("Unexpected sponsor subscription configuration.");
      const price = priceView(sub.items.data[0].price);
      const invoices: BillingObservation["invoices"] = [];
      // Only bounded recent invoices can advance current entitlement.
      const list = await stripe.invoices.list({
        subscription: sub.id,
        limit: 12,
      });
      for (const invoice of list.data) {
        testObject(invoice);
        if (invoice.status !== "paid") continue;
        const lines = await stripe.invoices.listLineItems(invoice.id, {
          limit: 100,
        });
        const recurring = lines.data.filter(
          (l) => l.parent?.type === "subscription_item_details",
        );
        if (
          lines.has_more ||
          recurring.length !== 1 ||
          recurring[0].quantity !== 1 ||
          recurring[0].amount !== 50000 ||
          recurring[0].discount_amounts?.length
        )
          continue;
        const payments = await stripe.invoicePayments.list({
          invoice: invoice.id,
          status: "paid",
          limit: 100,
        });
        let confirmed = 0;
        for (const payment of payments.data) {
          testObject(payment);
          const intentId = idOf(payment.payment.payment_intent);
          if (!intentId) continue;
          const intent = await stripe.paymentIntents.retrieve(intentId);
          testObject(intent);
          if (intent.status === "succeeded" && intent.currency === "usd")
            confirmed += payment.amount_paid ?? 0;
        }
        const line = recurring[0];
        invoices.push({
          id: invoice.id,
          paid: confirmed >= 50000,
          amountPaid: confirmed,
          currency: invoice.currency,
          priceId: idOf(line.pricing?.price_details?.price) ?? "",
          periodStart: line.period.start * 1000,
          periodEnd: line.period.end * 1000,
          paidAt: (invoice.status_transitions.paid_at ?? 0) * 1000,
        });
      }
      return {
        subscriptionId: sub.id,
        customerId: idOf(sub.customer)!,
        checkoutId: sub.metadata.sponsor_checkout_id ?? "",
        livemode: sub.livemode,
        price,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        invoices,
      };
    },
    async terminate(subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      testObject(sub);
      if (sub.status !== "canceled")
        await stripe.subscriptions.cancel(
          sub.id,
          { invoice_now: false, prorate: false },
          { idempotencyKey: `sponsor-stop:${sub.id}` },
        );
      // Cancellation alone does not settle outstanding collection. Refuse reuse
      // while any intent is processing or any invoice remains collectable.
      for await (const invoice of stripe.invoices.list({
        subscription: sub.id,
        limit: 100,
      })) {
        testObject(invoice);
        for await (const payment of stripe.invoicePayments.list({
          invoice: invoice.id,
          limit: 100,
        })) {
          testObject(payment);
          const intentId = idOf(payment.payment.payment_intent);
          if (!intentId) continue;
          const intent = await stripe.paymentIntents.retrieve(intentId);
          testObject(intent);
          if (intent.status === "processing") return false;
          if (!["succeeded", "canceled"].includes(intent.status))
            await stripe.paymentIntents.cancel(
              intent.id,
              {},
              { idempotencyKey: `sponsor-stop-intent:${intent.id}` },
            );
        }
        if (invoice.status === "draft") await stripe.invoices.del(invoice.id);
        else if (
          invoice.status === "open" ||
          invoice.status === "uncollectible"
        )
          await stripe.invoices.voidInvoice(
            invoice.id,
            {},
            { idempotencyKey: `sponsor-void:${invoice.id}` },
          );
      }
      const final = await stripe.invoices.list({
        subscription: sub.id,
        limit: 100,
      });
      return (
        !final.has_more &&
        final.data.every((i) => ["paid", "void"].includes(i.status ?? ""))
      );
    },
    async portal(customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) throw new Error("Billing customer unavailable.");
      testObject(customer);
      const configId = process.env.STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID;
      if (!configId) throw new Error("Sponsor billing portal unavailable.");
      const config =
        await stripe.billingPortal.configurations.retrieve(configId);
      testObject(config);
      if (
        !config.active ||
        !config.features.invoice_history.enabled ||
        !config.features.payment_method_update.enabled ||
        !config.features.subscription_cancel.enabled ||
        config.features.subscription_cancel.mode !== "at_period_end" ||
        config.features.subscription_update.enabled
      )
        throw new Error(
          "Use a sponsor portal with period-end cancellation and no subscription changes.",
        );
      return (
        await stripe.billingPortal.sessions.create({
          customer: customerId,
          configuration: configId,
          return_url: `${siteOrigin()}/sponsor/dashboard`,
        })
      ).url;
    },
    async eventTarget(type, objectId) {
      if (type.startsWith("checkout.session."))
        return (await this.session(objectId)).checkoutId || null;
      let subscriptionId: string | null = null;
      if (type.startsWith("customer.subscription.")) subscriptionId = objectId;
      else if (type.startsWith("invoice.")) {
        const invoice = await stripe.invoices.retrieve(objectId);
        testObject(invoice);
        subscriptionId = idOf(
          invoice.parent?.subscription_details?.subscription,
        );
      }
      if (!subscriptionId) return null;
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      testObject(sub);
      return sub.metadata.sponsor_checkout_id ?? null;
    },
  };
}
export function sponsorBillingProvider() {
  return createStripeProvider(stripeClient());
}
