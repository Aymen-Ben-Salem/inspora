import Stripe from "stripe";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertStripeObjectMode, assertStripeSecretKey, stripePaymentMode } from "./payment-environment";
import { stripeCheckoutConfigured, stripeClient } from "./stripe-client";
import { validateSponsorRecoveryEnvironment } from "../../../scripts/lib/sponsorship-environment";
import { billingDecision, validateSponsorPrice, type BillingObservation } from "./billing";
import { createStripeWebhookReceiver } from "./webhook";

afterEach(() => vi.unstubAllEnvs());
const preview = { DATA_ENVIRONMENT: "preview", VERCEL_ENV: "preview", NODE_ENV: "production", SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "false" };
const live = { DATA_ENVIRONMENT: "production", VERCEL_ENV: "production", SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "true" };
const operational = { STRIPE_SECRET_KEY: "sk_live_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  STRIPE_SPONSOR_PRICE_ID: "price_month", STRIPE_SPONSOR_ONE_TIME_PRICE_ID: "price_once",
  STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID: "bpc_fixture", STRIPE_SPONSOR_AUTOMATIC_TAX: "false",
  CRON_SECRET: "c".repeat(32), SITE_URL: "https://www.inspora.design",
  SPONSORSHIP_ENABLED: "true", SPONSORSHIP_WRITES_ENABLED: "false", SPONSORSHIP_CHECKOUT_ENABLED: "false",
  ANALYTICS_KEY_ENCRYPTION_SECRET: "k".repeat(32) };
function environment(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}
it("isolates production builds in preview and refuses missing or conflicting environment identity", () => {
  expect(stripePaymentMode(preview)).toBe("test");
  expect(() => assertStripeObjectMode({ livemode: false }, preview)).not.toThrow();
  expect(() => assertStripeObjectMode({ livemode: true }, preview)).toThrow();
  for (const values of [{}, { NODE_ENV: "production" }, { DATA_ENVIRONMENT: "production" },
    { ...live, VERCEL_ENV: "preview" }, { ...preview, VERCEL_ENV: "production" },
    { DATA_ENVIRONMENT: "rehearsal" }]) expect(() => stripePaymentMode(values)).toThrow();
});
it("requires explicit launch activation and matching key and object modes", () => {
  for (const enabled of [undefined, "", "false", "TRUE"]) {
    expect(() => assertStripeSecretKey({ ...live, ...operational, SPONSORSHIP_LIVE_PAYMENTS_ENABLED: enabled })).toThrow(/activation/);
  }
  expect(() => assertStripeSecretKey({ ...preview, STRIPE_SECRET_KEY: "sk_live_fixture" })).toThrow(/test/);
  expect(() => assertStripeSecretKey({ ...live, STRIPE_SECRET_KEY: "sk_test_fixture" })).toThrow(/live/);
  expect(() => assertStripeSecretKey({ ...live, STRIPE_SECRET_KEY: "rk_live_fixture" })).not.toThrow();
  expect(() => assertStripeObjectMode({ livemode: false }, live)).toThrow(/live/);
  expect(() => assertStripeObjectMode({}, live)).toThrow(/live/);
  expect(() => assertStripeObjectMode({ livemode: false }, { ...preview, SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "true" })).toThrow(/forbidden/);
});
it("fails closed before SDK or checkout access until launch is explicitly activated", () => {
  environment({ ...live, ...operational, SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "false" });
  expect(() => stripeClient()).toThrow(/activation/);
  expect(stripeCheckoutConfigured()).toBe(false);
  environment({ SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "true" });
  expect(stripeCheckoutConfigured()).toBe(true);
  expect(stripeCheckoutConfigured("one_time")).toBe(true);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  expect(stripeCheckoutConfigured()).toBe(false);
  expect(() => stripeClient()).toThrow(/live/);
});
it("keeps production billing recovery operational with checkout and campaign writes disabled", () => {
  expect(() => validateSponsorRecoveryEnvironment({ ...live, ...operational })).not.toThrow();
  for (const change of [{ STRIPE_SECRET_KEY: "sk_test_fixture" }, { SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "false" },
    { STRIPE_WEBHOOK_SECRET: "" }, { STRIPE_SPONSOR_AUTOMATIC_TAX: "" }, { SITE_URL: "http://localhost:3000" },
    { SPONSORSHIP_CHECKOUT_ENABLED: "true" }, { SPONSORSHIP_WRITES_ENABLED: "true" }])
    expect(() => validateSponsorRecoveryEnvironment({ ...live, ...operational, ...change })).toThrow();
});
it.each(["subscription", "one_time"] as const)("reconciles simulated live %s USD/EUR prices and rejects mixed modes", mode => {
  environment(live);
  const start = Date.UTC(2026, 0, 31), end = Date.UTC(2026, 1, 28);
  const price = { id: "price_live", livemode: true, active: true, currency: "usd", unitAmount: 50000,
    interval: mode === "subscription" ? "month" : null, intervalCount: mode === "subscription" ? 1 : null,
    taxBehavior: "exclusive", currencyOptions: { usd: { unitAmount: 50000, taxBehavior: "exclusive" }, eur: { unitAmount: 45000, taxBehavior: "exclusive" } } };
  expect(() => validateSponsorPrice(price, price.id, true, mode)).not.toThrow();
  expect(() => validateSponsorPrice({ ...price, livemode: false }, price.id, true, mode)).toThrow();
  for (const [currency, amount] of [["usd", 50000], ["eur", 45000]] as const) {
    const observation: BillingObservation = { subscriptionId: mode === "subscription" ? "sub_live" : null,
      billingMode: mode, customerId: "cus_live", checkoutId: "checkout_live", livemode: true,
      price: { ...price, currency, unitAmount: amount }, status: "active", cancelAtPeriodEnd: false, billingAnchor: start,
      invoices: [{ id: "in_live", paid: true, amountPaid: amount, currency, priceId: price.id, periodStart: start, periodEnd: end }] };
    expect(billingDecision(observation, { paidThrough: null, periodStart: null }, start, price.id).state).toBe("active");
    expect(() => billingDecision({ ...observation, livemode: false }, { paidThrough: null, periodStart: null }, start, price.id)).toThrow();
    expect(billingDecision({ ...observation, invoices: [] }, { paidThrough: end, periodStart: start }, end, price.id).state)
      .toBe(mode === "subscription" ? "recovery" : "inactive");
  }
});
it("verifies raw signed live fixtures, rejects wrong mode/secret/body, and preserves durable replay handling", async () => {
  environment(live);
  const sdk = new Stripe("sk_live_fixture");
  const record = vi.fn(async () => true);
  const receiver = createStripeWebhookReceiver({ verify: (raw, signature) => {
    const event = sdk.webhooks.constructEvent(raw, signature, "whsec_fixture");
    return { id: event.id, type: event.type, livemode: event.livemode,
      data: { object: { id: "id" in event.data.object ? event.data.object.id : undefined } } };
  }, record });
  const raw = JSON.stringify({ id: "evt_live", type: "invoice.paid", livemode: true, data: { object: { id: "in_live" } } });
  const sign = (body: string, secret = "whsec_fixture") => sdk.webhooks.generateTestHeaderString({ payload: body, secret });
  expect(await receiver(raw, sign(raw))).toEqual({ accepted: true, duplicate: false });
  record.mockResolvedValueOnce(false);
  expect(await receiver(raw, sign(raw))).toEqual({ accepted: true, duplicate: true });
  record.mockClear();
  for (const [body, signature] of [[raw, sign(raw, "whsec_wrong")], [raw + " ", sign(raw)],
    [raw.replace('"livemode":true', '"livemode":false'), sign(raw.replace('"livemode":true', '"livemode":false'))]])
    expect((await receiver(body, signature)).accepted).toBe(false);
  environment({ SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "false" });
  expect((await receiver(raw, sign(raw))).accepted).toBe(false);
  expect(record).not.toHaveBeenCalled();
});
