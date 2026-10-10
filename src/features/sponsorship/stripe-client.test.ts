import Stripe from "stripe";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createStripeProvider } from "./stripe-client";

it.each(["usd", "eur"])("verifies a full monthly payment in the subscription's %s currency", async currency => {
  const price = { id: "price_monthly", livemode: false, active: true, currency: "usd", unit_amount: 50000,
    recurring: { interval: "month", interval_count: 1 }, tax_behavior: "exclusive",
    currency_options: { usd: { unit_amount: 50000, tax_behavior: "exclusive" }, eur: { unit_amount: 50000, tax_behavior: "exclusive" } } };
  const fetcher = async (url: RequestInfo | URL, options?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1/prices/price_monthly") return Response.json(price);
    if (path === "/v1/checkout/sessions") {
      const body = new URLSearchParams(String(options?.body));
      expect(body.get("adaptive_pricing[enabled]")).toBe("false");
      expect(body.get("custom_text[submit][message]")).toContain("monthly");
      return Response.json({ id: "cs_monthly", livemode: false, mode: "subscription", status: "open", client_reference_id: "checkout_test", expires_at: 1800000000, url: "https://checkout.stripe.com/test" });
    }
    if (path === "/v1/subscriptions/sub_test") return Response.json({ id: "sub_test", livemode: false, currency,
      status: "active", customer: "cus_test", billing_cycle_anchor: 1769817600, metadata: { sponsor_checkout_id: "checkout_test" },
      items: { data: [{ quantity: 1, price }] } });
    if (path === "/v1/invoices") return Response.json({ object: "list", has_more: false,
      data: [{ id: "in_monthly", livemode: false, status: "paid", currency, status_transitions: { paid_at: 1769817600 } }] });
    if (path === "/v1/invoices/in_monthly/lines") return Response.json({ object: "list", has_more: false,
      data: [{ parent: { type: "subscription_item_details" }, quantity: 1, amount: 50000, pricing: { price_details: { price: price.id } }, period: { start: 1769817600, end: 1772236800 } }] });
    if (path === "/v1/invoice_payments") return Response.json({ object: "list", has_more: false,
      data: [{ livemode: false, amount_paid: 50000, payment: { payment_intent: "pi_test" } }] });
    if (path === "/v1/payment_intents/pi_test") return Response.json({ livemode: false, status: "succeeded", currency });
    throw Error("Unexpected monthly fixture request.");
  };
  const provider = createStripeProvider(new Stripe("sk_test_fixture", { httpClient: Stripe.createFetchHttpClient(fetcher), maxNetworkRetries: 0 }));
  await provider.price(price.id);
  await provider.createCheckout({ checkoutId: "checkout_test", priceId: price.id, key: "fixture", expiresAt: 1800000000000 });
  expect(await provider.observe("sub_test")).toMatchObject({ price: { currency, unitAmount: 50000, interval: "month" },
    billingAnchor: 1769817600000, invoices: [{ paid: true, amountPaid: 50000, currency }] });
});

it.each([
  [false, 1794256280, true],
  [true, null, true],
  [false, null, false],
])("recognizes scheduled cancellation (flag=%s, timestamp=%s)", async (flag, timestamp, expected) => {
  const fetcher = vi.fn(async (url: RequestInfo | URL) =>
    Response.json(String(url).includes("/v1/prices/") ? {
      id: "price_test", livemode: false, active: true, currency: "usd", unit_amount: 50000,
      recurring: { interval: "day", interval_count: 30 }, tax_behavior: "exclusive",
    } :
      String(url).includes("/v1/subscriptions/")
        ? {
            id: "sub_test",
            object: "subscription",
            livemode: false,
            status: "active",
            customer: "cus_test",
            cancel_at_period_end: flag,
            cancel_at: timestamp,
            metadata: { sponsor_checkout_id: "checkout_test" },
            items: {
              data: [{
                quantity: 1,
                price: {
                  id: "price_test",
                  livemode: false,
                  active: true,
                  currency: "usd",
                  unit_amount: 50000,
                  recurring: { interval: "day", interval_count: 30 },
                  tax_behavior: "exclusive",
                },
              }],
            },
          }
        : { object: "list", data: [], has_more: false },
    ),
  );
  const stripe = new Stripe("sk_test_fixture", {
    httpClient: Stripe.createFetchHttpClient(fetcher),
    maxNetworkRetries: 0,
  });
  expect(await createStripeProvider(stripe).observe("sub_test")).toMatchObject({
    status: "active",
    cancelAtPeriodEnd: expected,
  });
});

it.each([
  ["requires_payment_method", true],
  ["processing", false],
])("settles invoice-owned %s payments before allowing seat release", async (status, safe) => {
  let invoiceState = "open";
  const fetcher = async (url: RequestInfo | URL, options?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1/subscriptions/sub_test")
      return Response.json({ id: "sub_test", livemode: false, status: options?.method === "DELETE" ? "canceled" : "active" });
    if (path === "/v1/invoices")
      return Response.json({ object: "list", data: [{ id: "in_test", livemode: false, status: invoiceState }], has_more: false });
    if (path === "/v1/invoice_payments")
      return Response.json({ object: "list", data: [{ id: "inpay_test", livemode: false, payment: { payment_intent: "pi_test" } }], has_more: false });
    if (path === "/v1/payment_intents/pi_test")
      return Response.json({ id: "pi_test", livemode: false, status });
    if (path === "/v1/payment_intents/pi_test/cancel")
      return Response.json({ error: { type: "invalid_request_error", message: "You cannot cancel PaymentIntents created by invoices. Try voiding the invoice instead." } }, { status: 400 });
    if (path === "/v1/invoices/in_test/void") {
      if (status === "processing") throw Error("A processing invoice must remain held.");
      invoiceState = "void";
      return Response.json({ id: "in_test", livemode: false, status: invoiceState });
    }
    throw Error("Unexpected Stripe fixture request.");
  };
  const stripe = new Stripe("sk_test_fixture", { httpClient: Stripe.createFetchHttpClient(fetcher), maxNetworkRetries: 0 });
  expect(await createStripeProvider(stripe).terminate("sub_test")).toBe(safe);
});
