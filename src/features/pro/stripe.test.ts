import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createProStripeProvider } from "./stripe";

vi.mock("server-only", () => ({}));

const config = { subscriptionPriceId: "price_pro", packPriceId: "price_pack", webhookSecret: null, portalConfigurationId: null, automaticTax: false };
const provider = (sdk: unknown) => createProStripeProvider(sdk as Stripe, config);
async function* objects<T>(values: T[]) { yield* values; }
const packLine = { quantity: 1, pricing: { price_details: { price: "price_pack" } } };

beforeEach(() => {
  vi.stubEnv("DATA_ENVIRONMENT", "development");
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("RELEASE_REHEARSAL_TARGET", undefined);
  vi.stubEnv("PRO_LIVE_PAYMENTS_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("Stripe Pro adapter recovery", () => {
  it("previews only the pack without including the customer's next subscription renewal", async () => {
    const createPreview = vi.fn(async (params: Stripe.InvoiceCreatePreviewParams) => ({ total: 500, currency: params.currency ?? "usd" }));
    const billing = provider({ customers: { retrieve: async () => ({ id: "cus_one", livemode: false, tax_exempt: "none", address: { country: "DE", city: null, line1: null, line2: null, postal_code: null, state: null } }) }, invoices: { createPreview } });
    expect(await billing.previewPack("cus_one")).toBe(500);
    const params = createPreview.mock.calls[0]?.[0] as Stripe.InvoiceCreatePreviewParams;
    expect(params.customer).toBeUndefined();
    expect(params.subscription).toBeUndefined();
    expect(params.customer_details?.address).toMatchObject({ country: "DE" });
    expect(params.invoice_items).toEqual([{ price: "price_pack", quantity: 1 }]);
  });

  it("binds a subscription checkout to its persistent attempt and fixed expiry", async () => {
    const create = vi.fn(async () => ({ id: "cs_one", url: "https://checkout.stripe.com/one", livemode: false }));
    const billing = provider({ checkout: { sessions: { create } } });
    const input = { userId: "user_one", customerId: "cus_one", attemptId: "attempt_one", createdAt: new Date("2027-01-01T00:00:00Z"), successUrl: "https://preview.test/success", cancelUrl: "https://preview.test/cancel" };
    await billing.subscriptionCheckout(input);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ adaptive_pricing: { enabled: false }, expires_at: 1798765200, metadata: expect.objectContaining({ inspora_pro_attempt_id: "attempt_one" }) }), { idempotencyKey: "inspora-pro-subscription-checkout:attempt_one" });
  });

  it("keeps manual pack Checkout in the agreed USD currency without Adaptive Pricing", async () => {
    const create = vi.fn(async () => ({ id: "cs_pack", url: "https://checkout.stripe.com/pack", livemode: false }));
    await provider({ checkout: { sessions: { create } } }).packCheckout({ userId: "user_one", customerId: "cus_one", purchaseId: "purchase_one", successUrl: "https://preview.test/success", cancelUrl: "https://preview.test/cancel" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mode: "payment", adaptive_pricing: { enabled: false }, line_items: [{ price: "price_pack", quantity: 1 }] }), { idempotencyKey: "inspora-pro-pack-checkout:purchase_one" });
  });

  it("returns foreign subscription facts as non-Pro instead of causing perpetual webhook retries", async () => {
    const retrieve = vi.fn(async () => ({ id: "sub_sponsor", customer: "cus_sponsor", metadata: {}, status: "active", livemode: false, items: { data: [{ quantity: 1, price: { id: "price_sponsor" }, current_period_start: 1, current_period_end: 2 }] } }));
    expect(await provider({ subscriptions: { retrieve } }).subscription("sub_sponsor")).toMatchObject({ isPro: false });
  });

  it("recovers an existing paid pack invoice without creating or paying another one", async () => {
    const invoice = { id: "in_paid", status: "paid", total: 500, livemode: false, metadata: { inspora_pro_purchase_id: "purchase_one" } };
    const create = vi.fn();
    const pay = vi.fn();
    const billing = provider({ invoices: { list: () => objects([invoice]), create, pay } });
    expect(await billing.chargePack({ customerId: "cus_one", purchaseId: "purchase_one", userId: "user_one", maxCents: 500, paymentMethodId: "pm_new" })).toMatchObject({ invoiceId: "in_paid", outcome: "paid" });
    expect(create).not.toHaveBeenCalled();
    expect(pay).not.toHaveBeenCalled();
  });

  it("resumes an open invoice with its original payment method instead of finalizing or adding lines again", async () => {
    const invoice = { id: "in_open", status: "open", total: 500, currency: "usd", default_payment_method: "pm_original", livemode: false, metadata: { inspora_pro_purchase_id: "purchase_one" } };
    const pay = vi.fn(async () => ({ ...invoice, status: "paid" }));
    const finalizeInvoice = vi.fn();
    const createItem = vi.fn();
    const billing = provider({ invoices: { list: () => objects([invoice]), listLineItems: async () => ({ data: [packLine], has_more: false }), pay, finalizeInvoice }, invoiceItems: { create: createItem } });
    expect(await billing.chargePack({ customerId: "cus_one", purchaseId: "purchase_one", userId: "user_one", maxCents: 500, paymentMethodId: "pm_new" })).toMatchObject({ outcome: "paid" });
    expect(pay).toHaveBeenCalledWith("in_open", { off_session: true, payment_method: "pm_original" }, { idempotencyKey: "inspora-pro-auto-pay:purchase_one" });
    expect(finalizeInvoice).not.toHaveBeenCalled();
    expect(createItem).not.toHaveBeenCalled();
  });

  it("voids an invoice whose final tax-inclusive total exceeds its reserved maximum before payment", async () => {
    const invoice = { id: "in_tax", status: "open", total: 595, currency: "usd", livemode: false, metadata: { inspora_pro_purchase_id: "purchase_one" } };
    const pay = vi.fn();
    const voidInvoice = vi.fn();
    const billing = provider({ invoices: { list: () => objects([invoice]), listLineItems: async () => ({ data: [packLine], has_more: false }), pay, voidInvoice } });
    expect(await billing.chargePack({ customerId: "cus_one", purchaseId: "purchase_one", userId: "user_one", maxCents: 500, paymentMethodId: "pm_one" })).toMatchObject({ outcome: "over_cap" });
    expect(voidInvoice).toHaveBeenCalledWith("in_tax");
    expect(pay).not.toHaveBeenCalled();
  });

  it("closes an unpaid automatic invoice without creating or paying anything", async () => {
    const invoice = { id: "in_open", status: "open", customer: "cus_one", livemode: false, metadata: { inspora_pro_purchase_id: "purchase_one" } };
    let current = invoice;
    const voidInvoice = vi.fn(async () => { current = { ...invoice, status: "void" }; return current; });
    const pay = vi.fn(), create = vi.fn();
    const billing = provider({ invoices: { retrieve: async () => current, voidInvoice, pay, create } });
    expect(await billing.cancelAutomaticInvoice({ invoiceId: invoice.id, customerId: "cus_one", purchaseId: "purchase_one" })).toBe("canceled");
    expect(voidInvoice).toHaveBeenCalledWith("in_open");
    expect(pay).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("treats an automatic invoice that was paid during closure as paid without another payment", async () => {
    let current = { id: "in_race", status: "open", customer: "cus_one", livemode: false, metadata: { inspora_pro_purchase_id: "purchase_one" } };
    const pay = vi.fn();
    const billing = provider({ invoices: { retrieve: async () => current, voidInvoice: async () => { current = { ...current, status: "paid" }; throw new Error("Payment won the race"); }, pay } });
    expect(await billing.cancelAutomaticInvoice({ invoiceId: current.id, customerId: "cus_one", purchaseId: "purchase_one" })).toBe("paid");
    expect(pay).not.toHaveBeenCalled();
  });

  it("only cancels Checkout payment intents in Stripe's allowed requires-capture state", async () => {
    let current = { id: "pi_capture", livemode: false, status: "requires_capture" };
    const cancel = vi.fn(async () => { current = { ...current, status: "canceled" }; return current; });
    const billing = provider({ paymentIntents: { retrieve: async () => current, cancel } });
    await billing.cancelCheckoutPayment(current.id);
    expect(cancel).toHaveBeenCalledWith("pi_capture", { cancellation_reason: "requested_by_customer" });
    cancel.mockClear();current = { ...current, status: "processing" };
    await expect(billing.cancelCheckoutPayment(current.id)).rejects.toThrow("not cancelable");
    expect(cancel).not.toHaveBeenCalled();
  });
});
