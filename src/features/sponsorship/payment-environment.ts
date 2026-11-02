/** Shared by runtime billing and local recovery tooling; never infer mode from NODE_ENV. */
import { assertDataOperationEnvironment, runtimeDataEnvironmentFromValues } from '../../../scripts/lib/environment-fingerprint';

export type PaymentEnvironment = Record<string, string | undefined>;

export function stripePaymentMode(values: PaymentEnvironment = process.env): "test" | "live" {
  const data = values.DATA_ENVIRONMENT;
  if (values.RELEASE_REHEARSAL_TARGET) {
    assertDataOperationEnvironment(runtimeDataEnvironmentFromValues(values));
    if (values.STRIPE_REHEARSAL_ACCOUNT_ID !== 'acct_1USgzLRtLZ8OUdCw' ||
        values.STRIPE_SPONSOR_PRICE_ID !== 'price_1UX9KyRtLZ8OUdCwcHZWn7Yr' ||
        values.STRIPE_SPONSOR_ONE_TIME_PRICE_ID !== 'price_1UX9KzRtLZ8OUdCwKzE0RN3a' ||
        values.STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID !== 'bpc_1USyKfRtLZ8OUdCw8YGYtf26')
      throw new Error('Release rehearsal requires the approved dedicated TEST catalog.');
    return 'test';
  }
  if (!["development", "preview", "production"].includes(data ?? ""))
    throw new Error("Explicit DATA_ENVIRONMENT is required for Stripe payments.");
  if (values.VERCEL_ENV && values.VERCEL_ENV !== data)
    throw new Error("Stripe deployment and data environments conflict.");
  if (data === "production" && values.VERCEL_ENV !== "production")
    throw new Error("Live Stripe requires an explicit production deployment.");
  return data === "production" ? "live" : "test";
}

export function assertStripePaymentsEnabled(values: PaymentEnvironment = process.env) {
  const mode = stripePaymentMode(values);
  const enabled = values.SPONSORSHIP_LIVE_PAYMENTS_ENABLED;
  if (mode === "live") {
    if (enabled !== "true")
      throw new Error("Live Stripe activation is disabled pending launch authorization.");
  } else if (enabled !== undefined && enabled !== "" && enabled !== "false") {
    throw new Error("Live Stripe activation is forbidden outside production.");
  }
  return mode;
}

export function assertStripeSecretKey(values: PaymentEnvironment = process.env) {
  const mode = assertStripePaymentsEnabled(values);
  if (!new RegExp(`^(sk|rk)_${mode}_.+`).test(values.STRIPE_SECRET_KEY ?? ""))
    throw new Error(`STRIPE_SECRET_KEY must be a Stripe ${mode} key.`);
}

export function assertStripeObjectMode(object: { livemode?: boolean }, values: PaymentEnvironment = process.env) {
  const mode = assertStripePaymentsEnabled(values);
  if (object.livemode !== (mode === "live"))
    throw new Error(`Stripe ${mode} objects are required for this environment.`);
}

export function sponsorSiteOrigin(values: PaymentEnvironment = process.env) {
  const mode = stripePaymentMode(values);
  const url = new URL(values.SITE_URL ?? "");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    !["http:", "https:"].includes(url.protocol) ||
    (url.protocol !== "https:" && !loopback) ||
    (mode === "live" && (loopback || url.hostname.endsWith(".vercel.app"))))
    throw new Error("A canonical site origin matching the payment environment is required.");
  return url.origin;
}
