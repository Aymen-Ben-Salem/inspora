import "server-only";
import Stripe from "stripe";
import { PRO_PACK, proStripeConfig } from "./config";
import { assertProStripeObjectMode, assertProStripeSecretKey } from "./payment-environment";

/** Provider-neutral facts. Every grant decision re-reads these from Stripe, never from a webhook payload or return URL. */
export type ProCheckoutFacts = {
  id: string;
  mode: string;
  status: string | null;
  paymentStatus: string;
  customerId: string | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  amountTotal: number | null;
  userId: string | null;
  purchaseId: string | null;
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
  defaultPaymentMethodId: string | null;
  isPro?: boolean;
};
export type ProInvoiceFacts = {
  id: string;
  status: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  purchaseId: string | null;
  paid: boolean;
  amountPaid: number;
  total: number;
  subscriptionPeriod: { start: Date; end: Date; priceId: string } | null;
  paidAt?: Date | null;
  packVerified?: boolean;
};
export type ProChargeFacts = { id: string; customerId: string | null; paymentIntentId: string | null; invoiceId: string | null; amount: number; amountRefunded: number };
export type ProDisputeFacts = { id: string; status: string; chargeId: string | null };
export type ProPaymentIntentFacts = { id: string; status: string; customerId: string | null; amountReceived: number; purchaseId: string | null; paidAt?: Date | null };

export interface ProBillingProvider {
  ensureCustomer(input: { userId: string; existingCustomerId: string | null }): Promise<string>;
  subscriptionCheckout(input: { userId: string; customerId: string; attemptId: string; createdAt: Date; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string }>;
  findSubscriptionCheckout(input: { customerId: string; attemptId: string }): Promise<ProCheckoutFacts | null>;
  expireCheckout(id: string): Promise<ProCheckoutFacts>;
  cancelCheckoutPayment(id: string): Promise<void>;
  packCheckout(input: { userId: string; customerId: string; purchaseId: string; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string }>;
  portal(input: { customerId: string; returnUrl: string }): Promise<string>;
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<ProSubscriptionFacts>;
  cancelImmediately(subscriptionId: string): Promise<void>;
  checkout(id: string): Promise<ProCheckoutFacts>;
  subscription(id: string): Promise<ProSubscriptionFacts>;
  invoice(id: string): Promise<ProInvoiceFacts>;
  charge(id: string): Promise<ProChargeFacts>;
  dispute(id: string): Promise<ProDisputeFacts>;
  paymentIntent(id: string): Promise<ProPaymentIntentFacts>;
  /** Tax-inclusive total of one pack for this customer, without creating anything. */
  previewPack(customerId: string): Promise<number>;
  /** Read-only recovery of an invoice whose creation/payment response was lost. */
  findAutomaticInvoice(customerId: string, purchaseId: string): Promise<string | null>;
  /** Close an already-created automatic invoice without creating or attempting a payment. */
  cancelAutomaticInvoice(input: { invoiceId: string; customerId: string; purchaseId: string }): Promise<"canceled" | "paid" | "pending">;
  /** Create, finalize and (only if the finalized total fits maxCents) pay one pack invoice off-session. */
  chargePack(input: { customerId: string; purchaseId: string; userId: string; maxCents: number; paymentMethodId: string }): Promise<{ invoiceId: string; outcome: "paid" | "failed" | "over_cap" | "requires_action"; amountCents: number }>;
}

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));
const date = (seconds: number) => new Date(seconds * 1000);

export function createProStripeProvider(stripe: Stripe, config = proStripeConfig()): ProBillingProvider {
  if (!config) throw new Error("Pro Stripe prices are not configured.");
  const tax = config.automaticTax ? { automatic_tax: { enabled: true } } : {};
  const checkoutTax = config.automaticTax ? { ...tax, billing_address_collection: "required" as const, customer_update: { address: "auto" as const, name: "auto" as const } } : {};

  function checkoutFacts(session: Stripe.Checkout.Session): ProCheckoutFacts {
    assertProStripeObjectMode(session);
    return {
      id: session.id, mode: session.mode, status: session.status, paymentStatus: session.payment_status,
      customerId: idOf(session.customer), subscriptionId: idOf(session.subscription), paymentIntentId: idOf(session.payment_intent),
      amountTotal: session.amount_total, userId: session.metadata?.inspora_pro_user_id ?? null,
      purchaseId: session.metadata?.inspora_pro_purchase_id ?? null, attemptId: session.metadata?.inspora_pro_attempt_id ?? null,
      url: session.url,
    };
  }

  async function findPackInvoice(customerId: string, purchaseId: string) {
    // Recover a creation whose response was lost; metadata survives Stripe's idempotency retention window.
    for await (const invoice of stripe.invoices.list({ customer: customerId, limit: 100 })) {
      if (invoice.metadata?.inspora_pro_purchase_id === purchaseId) {
        assertProStripeObjectMode(invoice);
        return invoice;
      }
    }
    return null;
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
      defaultPaymentMethodId: idOf(sub.default_payment_method),
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
    async cancelCheckoutPayment(id) {
      const intent = await stripe.paymentIntents.retrieve(id);
      assertProStripeObjectMode(intent);
      if (intent.status === "canceled") return;
      if (intent.status !== "requires_capture") throw new Error("Checkout payment is not cancelable yet.");
      const canceled = await stripe.paymentIntents.cancel(id, { cancellation_reason: "requested_by_customer" });
      assertProStripeObjectMode(canceled);
      if (canceled.status !== "canceled") throw new Error("Checkout payment cancellation remains pending.");
    },
    async packCheckout({ userId, customerId, purchaseId, successUrl, cancelUrl }) {
      const metadata = { inspora_pro_user_id: userId, inspora_pro_purchase_id: purchaseId, inspora_pro_kind: "manual_pack" };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          adaptive_pricing: { enabled: false },
          customer: customerId,
          client_reference_id: userId,
          line_items: [{ price: config.packPriceId, quantity: 1 }],
          payment_intent_data: { metadata, setup_future_usage: "off_session" },
          metadata,
          success_url: successUrl,
          cancel_url: cancelUrl,
          ...checkoutTax,
        },
        { idempotencyKey: `inspora-pro-pack-checkout:${purchaseId}` },
      );
      assertProStripeObjectMode(session);
      if (!session.url) throw new Error("Checkout is unavailable.");
      return { id: session.id, url: session.url };
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
      const session = await stripe.checkout.sessions.retrieve(id);
      const facts = checkoutFacts(session);
      if (facts.purchaseId) {
        const lines = await stripe.checkout.sessions.listLineItems(id, { limit: 2 });
        if (session.currency !== PRO_PACK.currency || lines.has_more || lines.data.length !== 1 || lines.data[0].price?.id !== config.packPriceId || lines.data[0].quantity !== 1)
          throw new Error("Unexpected Pro pack checkout.");
      }
      return facts;
    },
    subscription,
    async invoice(id) {
      const invoice = await stripe.invoices.retrieve(id);
      assertProStripeObjectMode(invoice);
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
      let subscriptionPeriod: ProInvoiceFacts["subscriptionPeriod"] = null;
      let packVerified: boolean | undefined;
      if (subscriptionId) {
        const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 20 });
        const recurring = lines.data.filter((line) => line.parent?.type === "subscription_item_details" && idOf(line.pricing?.price_details?.price) === config.subscriptionPriceId);
        if (!lines.has_more && recurring.length === 1 && recurring[0].quantity === 1)
          subscriptionPeriod = { start: date(recurring[0].period.start), end: date(recurring[0].period.end), priceId: config.subscriptionPriceId };
      }
      if (invoice.metadata?.inspora_pro_purchase_id) {
        const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 2 });
        packVerified = invoice.currency === PRO_PACK.currency && !lines.has_more && lines.data.length === 1 && lines.data[0].quantity === 1 && idOf(lines.data[0].pricing?.price_details?.price) === config.packPriceId;
      }
      return {
        id: invoice.id,
        status: invoice.status,
        customerId: idOf(invoice.customer),
        subscriptionId,
        purchaseId: invoice.metadata?.inspora_pro_purchase_id ?? null,
        paid: invoice.status === "paid" && invoice.amount_remaining === 0,
        amountPaid: invoice.amount_paid,
        total: invoice.total,
        subscriptionPeriod,
        paidAt: invoice.status_transitions.paid_at ? date(invoice.status_transitions.paid_at) : null,
        packVerified,
      };
    },
    async charge(id) {
      const charge = await stripe.charges.retrieve(id);
      assertProStripeObjectMode(charge);
      const paymentIntentId = idOf(charge.payment_intent);
      let invoiceId: string | null = null;
      if (paymentIntentId) {
        const payments = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: paymentIntentId }, limit: 2 });
        if (payments.data.length === 1 && !payments.has_more) invoiceId = idOf(payments.data[0].invoice);
      }
      return { id: charge.id, customerId: idOf(charge.customer), paymentIntentId, invoiceId, amount: charge.amount, amountRefunded: charge.amount_refunded };
    },
    async dispute(id) {
      const dispute = await stripe.disputes.retrieve(id);
      assertProStripeObjectMode(dispute);
      return { id: dispute.id, status: dispute.status, chargeId: idOf(dispute.charge) };
    },
    async paymentIntent(id) {
      const intent = await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
      assertProStripeObjectMode(intent);
      if (intent.metadata?.inspora_pro_purchase_id && (intent.currency !== PRO_PACK.currency || (intent.status === "succeeded" && intent.amount_received < PRO_PACK.baseAmountCents)))
        throw new Error("Unexpected Pro pack payment.");
      const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
      return { id: intent.id, status: intent.status, customerId: idOf(intent.customer), amountReceived: intent.amount_received, purchaseId: intent.metadata?.inspora_pro_purchase_id ?? null, paidAt: intent.status === "succeeded" && charge?.paid ? date(charge.created) : null };
    },
    async previewPack(customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) throw new Error("Pro customer is unavailable.");
      assertProStripeObjectMode(customer);
      const address = (value: Stripe.Address | null | undefined) => value ? {
        city: value.city ?? undefined, country: value.country ?? undefined, line1: value.line1 ?? undefined,
        line2: value.line2 ?? undefined, postal_code: value.postal_code ?? undefined, state: value.state ?? undefined,
      } : undefined;
      const taxIds: Stripe.InvoiceCreatePreviewParams.CustomerDetails.TaxId[] = [];
      if (config.automaticTax) for await (const id of stripe.customers.listTaxIds(customerId, { limit: 100 }))
        if (id.value) taxIds.push({ type: id.type, value: id.value });
      const preview = await stripe.invoices.createPreview({
        // Passing customer selects its next subscription renewal as well as the
        // pack. Use a one-off billing snapshot so the estimate contains only this pack.
        customer_details: {
          address: address(customer.address), tax_exempt: customer.tax_exempt ?? "none", tax_ids: taxIds,
          ...(customer.shipping ? { shipping: { name: customer.shipping.name ?? customer.name ?? "Inspora customer", address: address(customer.shipping.address)! } } : {}),
        },
        currency: PRO_PACK.currency,
        invoice_items: [{ price: config.packPriceId, quantity: 1 }],
        ...tax,
      });
      if (!Number.isSafeInteger(preview.total) || preview.total < PRO_PACK.baseAmountCents || preview.currency !== PRO_PACK.currency)
        throw new Error("Pack total could not be verified.");
      return preview.total;
    },
    async findAutomaticInvoice(customerId, purchaseId) {
      return (await findPackInvoice(customerId, purchaseId))?.id ?? null;
    },
    async cancelAutomaticInvoice({ invoiceId, customerId, purchaseId }) {
      const missing = (error: unknown) => error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing";
      async function read() {
        try {
          const invoice = await stripe.invoices.retrieve(invoiceId);
          assertProStripeObjectMode(invoice);
          if (idOf(invoice.customer) !== customerId || invoice.metadata?.inspora_pro_purchase_id !== purchaseId)
            throw new Error("Automatic invoice ownership mismatch.");
          return invoice;
        } catch (error) { if (missing(error)) return null; throw error; }
      }
      let invoice = await read();
      if (!invoice || invoice.status === "void" || invoice.status === "uncollectible") return "canceled";
      if (invoice.status === "paid") return "paid";
      try {
        if (invoice.status === "draft") await stripe.invoices.del(invoiceId);
        else if (invoice.status === "open") await stripe.invoices.voidInvoice(invoiceId);
        else return "pending";
      } catch {
        // Payment/finalization can race closure. Only a fresh terminal read is proof.
      }
      invoice = await read();
      if (!invoice || invoice.status === "void" || invoice.status === "uncollectible") return "canceled";
      return invoice.status === "paid" ? "paid" : "pending";
    },
    async chargePack({ customerId, purchaseId, userId, maxCents, paymentMethodId }) {
      const metadata = { inspora_pro_user_id: userId, inspora_pro_purchase_id: purchaseId, inspora_pro_kind: "automatic_pack" };
      const draft = await findPackInvoice(customerId, purchaseId) ?? await stripe.invoices.create(
        { customer: customerId, collection_method: "charge_automatically", default_payment_method: paymentMethodId, auto_advance: false, pending_invoice_items_behavior: "exclude", currency: PRO_PACK.currency, metadata, ...tax },
        { idempotencyKey: `inspora-pro-auto-invoice:${purchaseId}` },
      );
      assertProStripeObjectMode(draft);
      if (draft.status === "paid") return { invoiceId: draft.id, outcome: "paid", amountCents: draft.total };
      if (draft.status === "void" || draft.status === "uncollectible") return { invoiceId: draft.id, outcome: "failed", amountCents: draft.total };
      if (draft.status === "open") {
        const lines = await stripe.invoices.listLineItems(draft.id, { limit: 2 });
        if (lines.has_more || lines.data.length !== 1 || lines.data[0].quantity !== 1 || idOf(lines.data[0].pricing?.price_details?.price) !== config.packPriceId)
          throw new Error("Unexpected automatic pack invoice.");
      }
      if (draft.status === "draft") {
        const lines = await stripe.invoices.listLineItems(draft.id, { limit: 2 });
        if (lines.has_more || lines.data.length > 1 || (lines.data.length === 1 && (idOf(lines.data[0].pricing?.price_details?.price) !== config.packPriceId || lines.data[0].quantity !== 1)))
          throw new Error("Unexpected automatic pack invoice.");
        if (!lines.data.length) await stripe.invoiceItems.create(
          { customer: customerId, invoice: draft.id, pricing: { price: config.packPriceId }, quantity: 1, metadata },
          { idempotencyKey: `inspora-pro-auto-item:${purchaseId}` },
        );
      }
      const finalized = draft.status === "draft" ? await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false }) : draft;
      // The finalized tax-inclusive total must still fit the remaining cap; otherwise nothing is charged.
      if (finalized.currency !== PRO_PACK.currency || finalized.total < PRO_PACK.baseAmountCents) throw new Error("Unexpected automatic pack total.");
      if (finalized.total > maxCents) {
        await stripe.invoices.voidInvoice(finalized.id);
        return { invoiceId: finalized.id, outcome: "over_cap", amountCents: finalized.total };
      }
      try {
        const paid = await stripe.invoices.pay(finalized.id, { off_session: true, payment_method: idOf(finalized.default_payment_method) ?? paymentMethodId }, { idempotencyKey: `inspora-pro-auto-pay:${purchaseId}` });
        return { invoiceId: paid.id, outcome: paid.status === "paid" ? "paid" : "requires_action", amountCents: paid.total };
      } catch (error) {
        if (error instanceof Stripe.errors.StripeCardError) {
          await stripe.invoices.voidInvoice(finalized.id).catch(() => undefined);
          return { invoiceId: finalized.id, outcome: "failed", amountCents: finalized.total };
        }
        throw error;
      }
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
