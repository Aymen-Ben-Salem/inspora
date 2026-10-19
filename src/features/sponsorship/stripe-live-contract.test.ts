import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createStripeProvider } from "./stripe-client";
import { billingDecision } from "./billing";
import { SPONSOR_AMOUNTS, type SponsorCurrency } from "./pricing";
import type { SponsorBillingMode } from "./purchase-mode";

// Every SDK request terminates in this fixture transport. No Stripe access.
beforeEach(() => {
  for (const [key, value] of Object.entries({ DATA_ENVIRONMENT: "production", VERCEL_ENV: "production",
    SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "true", STRIPE_SPONSOR_AUTOMATIC_TAX: "false",
    SITE_URL: "https://www.inspora.design", STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID: "bpc_live",
    STRIPE_SECRET_KEY: "sk_live_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_SPONSOR_PRICE_ID: "price_live", CRON_SECRET: "c".repeat(32) })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

function fixture(mode: SponsorBillingMode = "subscription", currency: SponsorCurrency = "eur", wrong?: string) {
  const amount = SPONSOR_AMOUNTS[currency], tax = 5000;
  const start = Date.UTC(2026, 0, 31) / 1000, end = Date.UTC(2026, 1, 28) / 1000;
  const p = { id: "price_live", livemode: true, active: true, currency: "usd", unit_amount: 50000,
    recurring: mode === "subscription" ? { interval: "month", interval_count: 1 } : null, tax_behavior: "exclusive",
    currency_options: { usd: { unit_amount: 50000, tax_behavior: "exclusive" }, eur: { unit_amount: 45000, tax_behavior: "exclusive" } } };
  const objects: Record<string, Record<string, unknown>> = {
    price: p,
    session: { id: "cs_live", livemode: true, mode: mode === "subscription" ? "subscription" : "payment",
      client_reference_id: "checkout_live", metadata: { sponsor_checkout_id: "checkout_live" }, expires_at: 1800000000,
      status: "complete", payment_status: "paid", subscription: mode === "subscription" ? "sub_live" : null,
      customer: "cus_live", currency, amount_subtotal: amount, amount_total: amount + tax,
      total_details: { amount_tax: tax, amount_discount: 0 }, payment_intent: "pi_live", url: "https://checkout.stripe.com/fixture" },
    subscription: { id: "sub_live", livemode: true, status: "active", currency, customer: "cus_live", billing_cycle_anchor: start,
      metadata: { sponsor_checkout_id: "checkout_live" }, items: { data: [{ quantity: 1, price: p }] }, cancel_at_period_end: true },
    invoice: { id: "in_live", livemode: true, status: "paid", currency, status_transitions: { paid_at: start } },
    invoicePayment: { livemode: true, amount_paid: amount + tax, payment: { payment_intent: "pi_live" } },
    intent: { id: "pi_live", livemode: true, status: "succeeded", customer: "cus_live", currency,
      amount: amount + tax, amount_received: amount + tax, latest_charge: "ch_live", metadata: { sponsor_checkout_id: "checkout_live" } },
    charge: { id: "ch_live", livemode: true, status: "succeeded", paid: true, captured: true, disputed: false, customer: "cus_live",
      payment_intent: "pi_live", currency, amount: amount + tax, amount_captured: amount + tax, amount_refunded: 0, created: start },
    customer: { id: "cus_live", livemode: true },
    portal: { id: "bpc_live", livemode: true, active: true, features: { invoice_history: { enabled: true },
      payment_method_update: { enabled: true }, subscription_cancel: { enabled: true, mode: "at_period_end" }, subscription_update: { enabled: false } } },
  };
  if (wrong) objects[wrong].livemode = false;
  const list = (data: unknown[]) => ({ object: "list", has_more: false, data });
  const fetcher = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1/prices/price_live") return Response.json(objects.price);
    if (path === "/v1/checkout/sessions") {
      const body = new URLSearchParams(String(options?.body));
      expect(body.get("mode")).toBe(mode === "subscription" ? "subscription" : "payment");
      expect(body.get("currency")).toBe(currency);
      expect(body.get("adaptive_pricing[enabled]")).toBe("false");
      expect(body.get("allowed_payment_method_types[0]")).toBe("card");
      expect(body.get("automatic_tax[enabled]")).toBe("false");
      expect(body.get("line_items[0][price]")).toBe("price_live");
      expect(body.get("success_url")).toBe("https://www.inspora.design/sponsor/dashboard");
      return Response.json({ ...objects.session, status: "open" });
    }
    if (path === "/v1/checkout/sessions/cs_live") return Response.json(objects.session);
    if (path === "/v1/checkout/sessions/cs_live/line_items") return Response.json(list([{ quantity: 1, price: p, currency, amount_subtotal: amount, amount_discount: 0 }]));
    if (path === "/v1/subscriptions/sub_live") return Response.json(objects.subscription);
    if (path === "/v1/invoices") return Response.json(list([objects.invoice]));
    if (path === "/v1/invoices/in_live/lines") return Response.json(list([{ quantity: 1, amount, parent: { type: "subscription_item_details" },
      pricing: { price_details: { price: "price_live" } }, period: { start, end } }]));
    if (path === "/v1/invoice_payments") return Response.json(list([objects.invoicePayment]));
    if (path === "/v1/payment_intents/pi_live") return Response.json(objects.intent);
    if (path === "/v1/charges/ch_live") return Response.json(objects.charge);
    if (path === "/v1/customers/cus_live") return Response.json(objects.customer);
    if (path === "/v1/billing_portal/configurations/bpc_live") return Response.json(objects.portal);
    if (path === "/v1/billing_portal/sessions") return Response.json({ url: "https://billing.stripe.com/fixture" });
    throw Error("Unexpected mock SDK request: " + path);
  });
  return { provider: createStripeProvider(new Stripe("sk_live_fixture", { httpClient: Stripe.createFetchHttpClient(fetcher), maxNetworkRetries: 0 })),
    fetcher, start: start * 1000, end: end * 1000 };
}

it.each([ ["subscription", "usd"], ["subscription", "eur"], ["one_time", "usd"], ["one_time", "eur"] ] as const)(
  "uses the real SDK with simulated live %s %s checkout and verified payments", async (mode, currency) => {
    const f = fixture(mode, currency);
    await f.provider.price("price_live", mode);
    expect((await f.provider.createCheckout({ checkoutId: "checkout_live", priceId: "price_live", key: "fixture",
      expiresAt: 1800000000000, billingMode: mode, currency })).billingMode).toBe(mode);
    const observation = mode === "subscription" ? await f.provider.observe("sub_live") : await f.provider.observePayment("cs_live");
    expect(observation).toMatchObject({ livemode: true, price: { livemode: true, currency, unitAmount: SPONSOR_AMOUNTS[currency] } });
    expect(billingDecision(observation, { paidThrough: null, periodStart: null }, f.start, "price_live"))
      .toMatchObject({ state: "active", paidThrough: f.end });
  });
it.each(["price", "session", "subscription", "invoice", "invoicePayment", "intent", "charge"])(
  "rejects a test-mode %s nested in simulated live provider state", async wrong => {
    const f = fixture("subscription", "eur", wrong);
    const operation = wrong === "session" ? f.provider.session("cs_live") : f.provider.observe("sub_live");
    await expect(operation).rejects.toThrow(/live objects/);
  });
it.each([undefined, "customer", "portal"])("preserves mode checks on the recovery portal (%s)", async wrong => {
  const f = fixture("subscription", "usd", wrong);
  if (wrong) await expect(f.provider.portal("cus_live")).rejects.toThrow(/live objects/);
  else expect(await f.provider.portal("cus_live")).toBe("https://billing.stripe.com/fixture");
});
it("rejects live mode before even a mock transport call when activation is off", () => {
  vi.stubEnv("SPONSORSHIP_LIVE_PAYMENTS_ENABLED", "false");
  expect(() => fixture()).toThrow(/activation/);
});
it("refuses reserved Checkout creation with missing tax configuration even when purchases are disabled", async () => {
  const f = fixture();
  vi.stubEnv("SPONSORSHIP_CHECKOUT_ENABLED", "false");
  vi.stubEnv("STRIPE_SPONSOR_AUTOMATIC_TAX", "");
  await expect(f.provider.createCheckout({ checkoutId: "checkout_live", priceId: "price_live", key: "fixture", expiresAt: 1800000000000, pinned: true })).rejects.toThrow(/tax/);
  expect(f.fetcher).not.toHaveBeenCalled();
});
