import Stripe from "stripe";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createStripeProvider } from "./stripe-client";

it.each([
  [false, 1794256280, true],
  [true, null, true],
  [false, null, false],
])("recognizes scheduled cancellation (flag=%s, timestamp=%s)", async (flag, timestamp, expected) => {
  const fetcher = vi.fn(async (url: RequestInfo | URL) =>
    Response.json(
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
