import Stripe from "stripe";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createStripeProvider } from "./stripe-client";

it.each([
  ["usd", "valid"], ["eur", "valid"], ["usd", "wrong_checkout"], ["usd", "wrong_customer"],
  ["usd", "wrong_currency"], ["usd", "partial_amount"], ["usd", "uncaptured"], ["usd", "live_charge"],
  ["usd", "discount"], ["usd", "processing"], ["usd", "refunded"],
])("creates and verifies a single %s payment (%s)", async (currency, scenario) => {
  const price = { id: "price_once", livemode: false, active: true, currency: "usd", unit_amount: 50000, recurring: null, tax_behavior: "exclusive",
    currency_options: { usd: { unit_amount: 50000, tax_behavior: "exclusive" }, eur: { unit_amount: 50000, tax_behavior: "exclusive" } } };
  const session = { id: "cs_once", livemode: false, mode: "payment", status: "complete", payment_status: "paid", subscription: null,
    client_reference_id: "checkout_once", metadata: { sponsor_checkout_id: "checkout_once" }, expires_at: 1800000000,
    currency, amount_subtotal: 50000, amount_total: 55000, total_details: { amount_tax: 5000, amount_discount: 0 }, customer: "cus_once", payment_intent: "pi_once" };
  const intent = { id: "pi_once", livemode: false, status: "succeeded", currency,
    amount: 55000, amount_received: 55000, customer: "cus_once", latest_charge: "ch_once", metadata: { sponsor_checkout_id: "checkout_once" } };
  const charge = { id: "ch_once", livemode: false, status: "succeeded", paid: true, captured: true,
    amount: 55000, amount_captured: 55000, amount_refunded: 0, currency, customer: "cus_once", payment_intent: "pi_once", created: 1769868916 };
  if (scenario === "wrong_checkout") intent.metadata.sponsor_checkout_id = "another_owner";
  if (scenario === "wrong_customer") intent.customer = "another_customer";
  if (scenario === "wrong_currency") intent.currency = "eur";
  if (scenario === "partial_amount") intent.amount_received = 49999;
  if (scenario === "uncaptured") charge.captured = false;
  if (scenario === "live_charge") charge.livemode = true;
  if (scenario === "discount") session.total_details.amount_discount = 100;
  if (scenario === "processing") intent.status = "processing";
  if (scenario === "refunded") charge.amount_refunded = 55000;
  const fetcher = async (url: RequestInfo | URL, options?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1/prices/price_once") return Response.json(price);
    if (path === "/v1/checkout/sessions") {
      const body = new URLSearchParams(String(options?.body));
      expect(body.get("mode")).toBe("payment");
      expect(body.has("subscription_data[metadata][sponsor_checkout_id]")).toBe(false);
      expect(body.get("payment_intent_data[metadata][sponsor_checkout_id]")).toBe("checkout_once");
      expect(body.get("invoice_creation[enabled]")).toBe("true");
      return Response.json({ ...session, status: "open", url: "https://checkout.stripe.com/test" });
    }
    if (path === "/v1/checkout/sessions/cs_once") return Response.json(session);
    if (path === "/v1/checkout/sessions/cs_once/line_items") return Response.json({ object: "list", has_more: false,
      data: [{ quantity: 1, price, currency, amount_subtotal: 50000, amount_discount: 0 }] });
    if (path === "/v1/payment_intents/pi_once") return Response.json(intent);
    if (path === "/v1/charges/ch_once") return Response.json(charge);
    throw Error("Unexpected single-payment request: " + path);
  };
  const provider = createStripeProvider(new Stripe("sk_test_fixture", { httpClient: Stripe.createFetchHttpClient(fetcher), maxNetworkRetries: 0 }));
  await provider.createCheckout({ checkoutId: "checkout_once", priceId: price.id, key: "once", expiresAt: 1800000000000, billingMode: "one_time" });
  if (scenario === "valid") expect(await provider.observePayment("cs_once")).toMatchObject({ billingMode: "one_time", subscriptionId: null, price: { currency },
    invoices: [{ paid: true, periodStart: 1769868916000, periodEnd: 1772288116000 }] });
  else if (scenario === "processing") expect((await provider.observePayment("cs_once")).invoices).toHaveLength(0);
  else if (scenario === "refunded") expect((await provider.observePayment("cs_once")).invoices)
    .toMatchObject([{ id: "refund:pi_once", paid: false, refunded: true }]);
  else await expect(provider.observePayment("cs_once")).rejects.toThrow();
});

it.each([["processing", false], ["requires_action", true]])("settles a single %s payment before seat reuse", async (status, safe) => {
  const cancel = vi.fn();
  const fetcher = async (url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1/checkout/sessions/cs_once") return Response.json({ id: "cs_once", livemode: false, mode: "payment", status: "expired", client_reference_id: "checkout_once", payment_intent: "pi_once" });
    if (path === "/v1/payment_intents/pi_once") return Response.json({ id: "pi_once", livemode: false, status, metadata: { sponsor_checkout_id: "checkout_once" } });
    if (path === "/v1/payment_intents/pi_once/cancel") { cancel(); return Response.json({ id: "pi_once", livemode: false, status: "canceled" }); }
    throw Error("Unexpected settlement request");
  };
  const provider = createStripeProvider(new Stripe("sk_test_fixture", { httpClient: Stripe.createFetchHttpClient(fetcher), maxNetworkRetries: 0 }));
  expect(await provider.settlePayment("cs_once")).toBe(safe);
  expect(cancel).toHaveBeenCalledTimes(safe ? 1 : 0);
});

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
