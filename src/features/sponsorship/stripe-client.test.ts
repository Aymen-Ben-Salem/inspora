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
