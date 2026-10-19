import "server-only";
import Stripe from "stripe";
import {
  validateSponsorPrice,
  type BillingObservation,
  type SponsorPrice,
} from "./billing";
import { validateSponsorBillingEnvironment } from "../../../scripts/lib/sponsorship-environment";
import { assertStripeObjectMode, assertStripePaymentsEnabled, assertStripeSecretKey, sponsorSiteOrigin } from "./payment-environment";
import { calendarMonthEnd, type SponsorBillingMode } from "./purchase-mode";
import { isSponsorCurrency, type SponsorCurrency } from "./pricing";

export type CheckoutSession = {
  id: string;
  status: string | null;
  url: string | null;
  subscriptionId: string | null;
  checkoutId: string;
  expiresAt: number;
  billingMode: SponsorBillingMode;
};
export type BillingProvider = {
  price(id: string, billingMode?: SponsorBillingMode): Promise<SponsorPrice>;
  createCheckout(input: {
    checkoutId: string;
    priceId: string;
    key: string;
    expiresAt: number;
    billingMode?: SponsorBillingMode;
    /** Only set for an existing server-owned seat reservation. */
    pinned?: boolean;
    currency?: SponsorCurrency;
    renewal?: { customerId: string; startsAt: string };
  }): Promise<CheckoutSession>;
  session(id: string): Promise<CheckoutSession>;
  findCheckout(
    checkoutId: string,
    reservedUntil: Date,
  ): Promise<CheckoutSession | null>;
  expireSession(id: string): Promise<CheckoutSession>;
  observe(subscriptionId: string): Promise<BillingObservation>;
  observePayment(sessionId: string): Promise<BillingObservation>;
  settlePayment(sessionId: string): Promise<boolean>;
  terminate(subscriptionId: string): Promise<boolean>;
  portal(customerId: string): Promise<string>;
  eventTarget(eventType: string, objectId: string): Promise<string | null>;
};
export function stripeClient() {
  assertStripeSecretKey();
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 10000 });
}
export function stripeCheckoutConfigured(billingMode: SponsorBillingMode = "subscription") {
  try {
    validateSponsorBillingEnvironment(process.env, true);
  } catch {
    return false;
  }
  return Boolean(
    (billingMode === "one_time" ? process.env.STRIPE_SPONSOR_ONE_TIME_PRICE_ID : process.env.STRIPE_SPONSOR_PRICE_ID)?.startsWith("price_") &&
    process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") &&
    process.env.STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID?.startsWith("bpc_"),
  );
}
function siteOrigin() {
  return sponsorSiteOrigin();
}
function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : (value?.id ?? null);
}
function remainingBaseSpend(base: number, charged: number, refunded: number) {
  if (![base, charged, refunded].every(Number.isSafeInteger) || base < 0 || charged < base || refunded < 0 || refunded > charged)
    throw new Error("Verified refund amounts are required.");
  if (refunded === 0) return base;
  if (refunded === charged) return 0;
  // A generic taxed refund does not identify how much fee versus tax was
  // returned. Preserve that uncertainty instead of inventing a proportional split.
  return charged === base ? base - refunded : null;
}
function priceView(p: Stripe.Price, currency = p.currency): SponsorPrice {
  const selected = p.currency_options?.[currency];
  return {
    id: p.id,
    livemode: p.livemode,
    active: p.active,
    currency,
    unitAmount: currency === p.currency ? p.unit_amount : (selected?.unit_amount ?? null),
    interval: p.recurring?.interval ?? null,
    intervalCount: p.recurring?.interval_count ?? null,
    taxBehavior: currency === p.currency ? (p.tax_behavior ?? "unspecified") : (selected?.tax_behavior ?? "unspecified"),
    currencyOptions: p.currency_options ? Object.fromEntries(Object.entries(p.currency_options)
      .map(([code, option]) => [code, { unitAmount: option.unit_amount, taxBehavior: option.tax_behavior ?? "unspecified" }])) : undefined,
  };
}
function sessionView(s: Stripe.Checkout.Session): CheckoutSession {
  assertStripeObjectMode(s);
  if (!["subscription", "payment"].includes(s.mode))
    throw new Error("A sponsor payment checkout is required.");
  return {
    id: s.id,
    status: s.status,
    url: s.url,
    subscriptionId: idOf(s.subscription),
    checkoutId: s.client_reference_id ?? "",
    expiresAt: s.expires_at * 1000,
    billingMode: s.mode === "payment" ? "one_time" : "subscription",
  };
}
export function createStripeProvider(stripe: Stripe): BillingProvider {
  assertStripePaymentsEnabled();
  async function disputeState(charge: Stripe.Charge): Promise<"open" | "lost" | undefined> {
    if (!charge.disputed) return undefined;
    const disputes = await stripe.disputes.list({ charge: charge.id, limit: 100 });
    if (disputes.has_more || !disputes.data.length) throw new Error("Complete dispute history is required.");
    let state: "open" | "lost" | undefined;
    for (const dispute of disputes.data) {
      assertStripeObjectMode(dispute);
      if (idOf(dispute.charge) !== charge.id || dispute.currency !== charge.currency)
        throw new Error("Dispute charge binding mismatch.");
      if (dispute.status === "lost") state = "lost";
      else if (!["won", "warning_closed", "warning_needs_response", "warning_under_review", "prevented"].includes(dispute.status) && state !== "lost") state = "open";
    }
    return state;
  }
  return {
    async price(id, billingMode = "subscription") {
      const p = priceView(await stripe.prices.retrieve(id, { expand: ["currency_options"] }));
      validateSponsorPrice(p, id, true, billingMode);
      return p;
    },
    async createCheckout(input) {
      // Reconciliation can resume a reserved Checkout with purchases disabled.
      // It must still fail closed on missing tax, webhook or job configuration.
      validateSponsorBillingEnvironment(process.env, true);
      const once = input.billingMode === "one_time";
      if (input.renewal && (once || !input.pinned || !input.currency || !input.renewal.customerId ||
        !Number.isFinite(Date.parse(input.renewal.startsAt)) || Date.parse(input.renewal.startsAt) <= input.expiresAt))
        throw new Error("A server-pinned future monthly renewal is required.");
      const price = priceView(await stripe.prices.retrieve(input.priceId, { expand: ["currency_options"] }));
      validateSponsorPrice(price, input.priceId, !input.pinned, input.billingMode);
      if (input.currency !== undefined) {
        if (!isSponsorCurrency(input.currency)) throw new Error("A supported checkout currency is required.");
        validateSponsorPrice({ ...price,
          currency: input.currency,
          unitAmount: price.currencyOptions?.[input.currency]?.unitAmount ?? (input.currency === price.currency ? price.unitAmount : null),
          taxBehavior: price.currencyOptions?.[input.currency]?.taxBehavior ?? price.taxBehavior,
        }, input.priceId, false, input.billingMode);
      }
      const amounts = Object.entries(price.currencyOptions ?? { [price.currency]: { unitAmount: price.unitAmount } })
        .filter(([currency]) => input.currency ? currency === input.currency : currency === "usd" || currency === "eur")
        .map(([currency, option]) => `${currency.toUpperCase()} ${option.unitAmount! / 100}`).join(" or ");
      const session = await stripe.checkout.sessions.create(
        {
          mode: once ? "payment" : "subscription",
          adaptive_pricing: { enabled: false },
          ...(input.currency ? { currency: input.currency } : {}),
          ...(input.renewal ? { customer: input.renewal.customerId, customer_update: { address: "auto" as const, name: "auto" as const }, payment_method_collection: "always" as const } : {}),
          client_reference_id: input.checkoutId,
          metadata: { sponsor_checkout_id: input.checkoutId },
          ...(once ? { customer_creation: "always" as const,
            invoice_creation: { enabled: true, invoice_data: { metadata: { sponsor_checkout_id: input.checkoutId } } },
            payment_intent_data: { metadata: { sponsor_checkout_id: input.checkoutId } },
          } : { subscription_data: {
            metadata: { sponsor_checkout_id: input.checkoutId },
            ...(input.renewal ? { billing_cycle_anchor: Math.floor(Date.parse(input.renewal.startsAt) / 1000), proration_behavior: "none" as const } : {}),
          } }),
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
                once ? `Business or professional promotion. ${amounts} before applicable tax for one calendar month. Single payment, no automatic renewal.` : input.renewal
                  ? `Your paid month remains covered. ${amounts} before applicable tax, billed monthly starting ${input.renewal.startsAt.slice(0, 10)}. No charge for the remaining paid time. Cancel future renewal in Billing.`
                  : `Business or professional promotion. ${amounts} before applicable tax, renewing monthly. Cancel future renewal in Billing.`,
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
        assertStripeObjectMode(session);
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
      assertStripeObjectMode(s);
      return s.status === "open"
        ? sessionView(await stripe.checkout.sessions.expire(id))
        : sessionView(s);
    },
    async observePayment(sessionId) {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      assertStripeObjectMode(s);
      if (s.mode !== "payment" || s.subscription || !s.client_reference_id ||
        s.metadata?.sponsor_checkout_id !== s.client_reference_id)
        throw new Error("Single-payment checkout binding mismatch.");
      const lines = await stripe.checkout.sessions.listLineItems(s.id, { limit: 100 });
      const line = lines.data[0];
      if (lines.has_more || lines.data.length !== 1 || line.quantity !== 1 || !line.price ||
        line.amount_discount || s.total_details?.amount_discount || !s.currency || line.currency !== s.currency)
        throw new Error("Unexpected single-payment amount or line items.");
      const source = await stripe.prices.retrieve(line.price.id, { expand: ["currency_options"] });
      const price = priceView(source, s.currency);
      validateSponsorPrice(price, line.price.id, false, "one_time");
      if (line.amount_subtotal !== price.unitAmount || s.amount_subtotal !== price.unitAmount ||
        s.amount_total !== price.unitAmount! + (s.total_details?.amount_tax ?? 0))
        throw new Error("Unexpected single-payment amount or line items.");
      const result: BillingObservation = { billingMode: "one_time", subscriptionId: null,
        checkoutId: s.client_reference_id, customerId: idOf(s.customer) ?? "", livemode: s.livemode,
        price, status: "pending", cancelAtPeriodEnd: true, invoices: [] };
      const intentId = idOf(s.payment_intent);
      if (!intentId) {
        if (s.payment_status === "paid") throw new Error("Verified payment intent required.");
        return result;
      }
      const intent = await stripe.paymentIntents.retrieve(intentId);
      assertStripeObjectMode(intent);
      if (intent.metadata.sponsor_checkout_id !== s.client_reference_id || intent.currency !== s.currency ||
        intent.amount !== s.amount_total || idOf(intent.customer) !== idOf(s.customer))
        throw new Error("Single-payment intent binding mismatch.");
      result.status = intent.status;
      if (intent.status === "succeeded" && (s.status !== "complete" || s.payment_status !== "paid"))
        throw new Error("Payment completion still needs reconciliation.");
      if (s.status !== "complete" || s.payment_status !== "paid" || intent.status !== "succeeded") return result;
      if (!result.customerId || intent.amount_received !== s.amount_total || !idOf(intent.latest_charge))
        throw new Error("Full single payment required.");
      const charge = await stripe.charges.retrieve(idOf(intent.latest_charge)!);
      assertStripeObjectMode(charge);
      if (charge.status !== "succeeded" || !charge.paid || !charge.captured || charge.amount !== s.amount_total ||
        charge.amount_captured !== s.amount_total || charge.currency !== s.currency ||
        idOf(charge.payment_intent) !== intent.id || idOf(charge.customer) !== result.customerId)
        throw new Error("Verified captured single payment required.");
      const start = charge.created * 1000;
      const refunded = charge.amount_refunded > 0;
      const dispute = await disputeState(charge);
      // Keep a verified refund receipt for audited resolution and replay checks.
      // It never qualifies as a paid invoice that grants entitlement.
      result.invoices = [{ id: refunded ? `refund:${intent.id}` : intent.id, paid: !refunded, refunded, amountPaid: intent.amount_received, currency: s.currency,
        priceId: source.id, periodStart: start, periodEnd: calendarMonthEnd(start), paidAt: start,
        disputeState: dispute,
        // Disputed funds may be partial and include tax. Keep spend unknown
        // until resolved rather than count withdrawn funds as retained revenue.
        netBaseAmount: dispute ? null : remainingBaseSpend(price.unitAmount!, charge.amount, charge.amount_refunded) }];
      return result;
    },
    async settlePayment(sessionId) {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      assertStripeObjectMode(s);
      if (s.mode !== "payment" || s.status === "open") return false;
      const intentId = idOf(s.payment_intent);
      if (!intentId) return s.status === "expired";
      const intent = await stripe.paymentIntents.retrieve(intentId);
      assertStripeObjectMode(intent);
      if (intent.metadata.sponsor_checkout_id !== s.client_reference_id) throw new Error("Payment binding mismatch.");
      if (intent.status === "processing") return false;
      if (["succeeded", "canceled"].includes(intent.status)) return true;
      const canceled = await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `sponsor-stop-payment:${intent.id}` });
      assertStripeObjectMode(canceled);
      return canceled.status === "canceled";
    },
    async observe(subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      assertStripeObjectMode(sub);
      if (
        sub.items.data.length !== 1 ||
        sub.items.data[0].quantity !== 1 ||
        sub.trial_start ||
        sub.pause_collection
      )
        throw new Error("Unexpected sponsor subscription configuration.");
      const sourcePrice = await stripe.prices.retrieve(sub.items.data[0].price.id, { expand: ["currency_options"] });
      assertStripeObjectMode(sourcePrice);
      const price = priceView(sourcePrice, sub.currency);
      validateSponsorPrice(price, sourcePrice.id, false, "subscription");
      const invoices: BillingObservation["invoices"] = [];
      // Reports expire relative to period end, not invoice creation. A creation
      // cutoff could hide refunds on a still-retained period. Keep the read
      // bounded and entitlement subject to verified period/anchor rules.
      const list = await stripe.invoices.list({
        subscription: sub.id,
        limit: 100,
      });
      if (list.has_more) throw new Error("Billing history exceeds its safe read limit.");
      for (const invoice of list.data) {
        assertStripeObjectMode(invoice);
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
          recurring[0].amount !== price.unitAmount ||
          recurring[0].discount_amounts?.length
        )
          continue;
        const payments = await stripe.invoicePayments.list({
          invoice: invoice.id,
          status: "paid",
          limit: 100,
        });
        if (payments.has_more) throw new Error("Complete invoice payments are required.");
        let confirmed = 0, refundedAmount = 0, refundSplitKnown = true;
        let dispute: "open" | "lost" | undefined;
        for (const payment of payments.data) {
          assertStripeObjectMode(payment);
          const intentId = idOf(payment.payment.payment_intent);
          if (!intentId) continue;
          const intent = await stripe.paymentIntents.retrieve(intentId);
          assertStripeObjectMode(intent);
          if (intent.status !== "succeeded" || intent.currency !== price.currency || invoice.currency !== price.currency) continue;
          if (intent.id !== intentId || idOf(intent.customer) !== idOf(sub.customer) || !idOf(intent.latest_charge))
            throw new Error("Monthly payment ownership mismatch.");
          const charge = await stripe.charges.retrieve(idOf(intent.latest_charge)!);
          assertStripeObjectMode(charge);
          if (charge.status !== "succeeded" || !charge.paid || !charge.captured ||
            charge.amount !== charge.amount_captured || charge.amount_captured !== intent.amount_received ||
            charge.currency !== price.currency || idOf(charge.payment_intent) !== intent.id || idOf(charge.customer) !== idOf(sub.customer) ||
            !Number.isSafeInteger(payment.amount_paid) || !payment.amount_paid || payment.amount_paid <= 0 || payment.amount_paid > charge.amount_captured)
            throw new Error("Verified captured monthly payment required.");
          confirmed += payment.amount_paid;
          const state = await disputeState(charge);
          if (state === "lost" || (state === "open" && !dispute)) dispute = state;
          refundedAmount += charge.amount_refunded;
          if (payment.amount_paid !== charge.amount_captured) refundSplitKnown = false;
        }
        const line = recurring[0];
        invoices.push({
          id: invoice.id,
          paid: confirmed >= price.unitAmount!,
          amountPaid: confirmed,
          refunded: refundedAmount > 0,
          disputeState: dispute,
          netBaseAmount: !dispute && confirmed >= price.unitAmount! && refundSplitKnown
            ? remainingBaseSpend(price.unitAmount!, confirmed, refundedAmount)
            : null,
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
        // The portal can schedule the same end using cancel_at while leaving
        // cancel_at_period_end false. Either form stops future renewal.
        cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at != null,
        invoices,
        billingAnchor: sub.billing_cycle_anchor * 1000,
      };
    },
    async terminate(subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      assertStripeObjectMode(sub);
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
        assertStripeObjectMode(invoice);
        for await (const payment of stripe.invoicePayments.list({
          invoice: invoice.id,
          limit: 100,
        })) {
          assertStripeObjectMode(payment);
          const intentId = idOf(payment.payment.payment_intent);
          if (!intentId) continue;
          const intent = await stripe.paymentIntents.retrieve(intentId);
          assertStripeObjectMode(intent);
          if (intent.status === "processing") return false;
          // Invoice-owned intents cannot be cancelled directly. Delete/void
          // their unpaid invoice below, then verify collection is settled.
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
      for (const invoice of final.data) assertStripeObjectMode(invoice);
      return (
        !final.has_more &&
        final.data.every((i) => ["paid", "void"].includes(i.status ?? ""))
      );
    },
    async portal(customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) throw new Error("Billing customer unavailable.");
      assertStripeObjectMode(customer);
      const configId = process.env.STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID;
      if (!configId) throw new Error("Sponsor billing portal unavailable.");
      const config =
        await stripe.billingPortal.configurations.retrieve(configId);
      assertStripeObjectMode(config);
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
      if (type === "charge.refunded" || type === "refund.updated" || type.startsWith("charge.dispute.")) {
        let disputeChargeId: string | null = null;
        if (type.startsWith("charge.dispute.")) {
          const dispute = await stripe.disputes.retrieve(objectId);
          assertStripeObjectMode(dispute);
          disputeChargeId = idOf(dispute.charge);
        }
        let chargeId = type.startsWith("charge.dispute.") ? disputeChargeId : objectId;
        if (type === "refund.updated") {
          const refund = await stripe.refunds.retrieve(objectId);
          // Refunds have no livemode field; verify their owning charge below.
          chargeId = idOf(refund.charge);
        }
        if (!chargeId) return null;
        const charge = await stripe.charges.retrieve(chargeId);
        assertStripeObjectMode(charge);
        const intentId = idOf(charge.payment_intent);
        if (!intentId) return null;
        const intent = await stripe.paymentIntents.retrieve(intentId);
        assertStripeObjectMode(intent);
        if (intent.metadata.sponsor_checkout_id) return intent.metadata.sponsor_checkout_id;
        const payments = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: intentId }, limit: 2 });
        if (!payments.has_more && payments.data.length === 0) return null;
        if (payments.has_more || payments.data.length !== 1)
          throw new Error("Refund invoice binding is unavailable.");
        assertStripeObjectMode(payments.data[0]);
        const invoice = await stripe.invoices.retrieve(idOf(payments.data[0].invoice)!);
        assertStripeObjectMode(invoice);
        subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
      }
      if (type.startsWith("customer.subscription.")) subscriptionId = objectId;
      else if (type.startsWith("invoice.")) {
        const invoice = await stripe.invoices.retrieve(objectId);
        assertStripeObjectMode(invoice);
        if (invoice.metadata?.sponsor_checkout_id) return invoice.metadata.sponsor_checkout_id;
        subscriptionId = idOf(
          invoice.parent?.subscription_details?.subscription,
        );
      }
      if (!subscriptionId) return null;
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      assertStripeObjectMode(sub);
      return sub.metadata.sponsor_checkout_id ?? null;
    },
  };
}
export function sponsorBillingProvider() {
  return createStripeProvider(stripeClient());
}
