import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createProStripeProvider } from "./stripe";

vi.mock("server-only", () => ({}));

const config = { subscriptionPriceId: "price_pro", webhookSecret: null, portalConfigurationId: null, automaticTax: false };
const provider = (sdk: unknown) => createProStripeProvider(sdk as Stripe, config);

beforeEach(() => {
  vi.stubEnv("DATA_ENVIRONMENT", "development");
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("RELEASE_REHEARSAL_TARGET", undefined);
  vi.stubEnv("PRO_LIVE_PAYMENTS_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("Stripe Pro adapter", () => {
  it("binds a subscription checkout to its persistent attempt and fixed expiry", async () => {
    const create = vi.fn(async () => ({ id: "cs_one", url: "https://checkout.stripe.com/one", livemode: false }));
    const billing = provider({ checkout: { sessions: { create } } });
    const input = { userId: "user_one", customerId: "cus_one", attemptId: "attempt_one", createdAt: new Date("2027-01-01T00:00:00Z"), successUrl: "https://preview.test/success", cancelUrl: "https://preview.test/cancel" };
    await billing.subscriptionCheckout(input);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ adaptive_pricing: { enabled: false }, expires_at: 1798765200, metadata: expect.objectContaining({ inspora_pro_attempt_id: "attempt_one" }) }), { idempotencyKey: "inspora-pro-subscription-checkout:attempt_one" });
  });

  it("returns foreign subscription facts as non-Pro instead of causing perpetual webhook retries", async () => {
    const retrieve = vi.fn(async () => ({ id: "sub_sponsor", customer: "cus_sponsor", metadata: {}, status: "active", livemode: false, items: { data: [{ quantity: 1, price: { id: "price_sponsor" }, current_period_start: 1, current_period_end: 2 }] } }));
    expect(await provider({ subscriptions: { retrieve } }).subscription("sub_sponsor")).toMatchObject({ isPro: false });
  });


  it("records a paid subscription invoice period only for the Pro price", async () => {
    const invoice = { id: "in_one", status: "paid", amount_remaining: 0, customer: "cus_one", livemode: false, parent: { subscription_details: { subscription: "sub_one" } }, status_transitions: { paid_at: 1798765200 } };
    const line = (price: string) => ({ parent: { type: "subscription_item_details" }, pricing: { price_details: { price } }, quantity: 1, period: { start: 1798765200, end: 1801443600 } });
    const billing = provider({ invoices: { retrieve: async () => invoice, listLineItems: async () => ({ data: [line("price_pro")], has_more: false }) } });
    expect(await billing.invoice("in_one")).toMatchObject({ paid: true, subscriptionId: "sub_one", subscriptionPeriod: { priceId: "price_pro" } });
    const foreign = provider({ invoices: { retrieve: async () => invoice, listLineItems: async () => ({ data: [line("price_sponsor")], has_more: false }) } });
    expect(await foreign.invoice("in_one")).toMatchObject({ subscriptionPeriod: null });
  });
});
