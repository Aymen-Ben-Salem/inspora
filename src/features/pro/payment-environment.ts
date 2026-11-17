import { sponsorSiteOrigin, stripePaymentMode, type PaymentEnvironment } from "../sponsorship/payment-environment";
import { assertDataOperationEnvironment, runtimeDataEnvironmentFromValues } from "../../../scripts/lib/environment-fingerprint";

/**
 * Pro shares the merchant account's test/live derivation with sponsorship but
 * has its own live-payment gate, so enabling one product never enables the other.
 */
export function assertProPaymentsEnabled(values: PaymentEnvironment = process.env) {
  let mode: "test" | "live";
  if (values.RELEASE_REHEARSAL_TARGET === "pro-fixture") {
    assertDataOperationEnvironment(runtimeDataEnvironmentFromValues(values));
    if (values.STRIPE_PRO_REHEARSAL_ACCOUNT_ID !== "acct_1USgzLRtLZ8OUdCw") throw new Error("Pro rehearsal requires the dedicated merchant test account.");
    mode = "test";
  } else mode = stripePaymentMode(values);
  const enabled = values.PRO_LIVE_PAYMENTS_ENABLED;
  if (mode === "live") {
    if (enabled !== "true") throw new Error("Live Pro payments are disabled pending launch authorization.");
  } else if (enabled !== undefined && enabled !== "" && enabled !== "false") {
    throw new Error("Live Pro payments are forbidden outside production.");
  }
  return mode;
}

export function proSiteOrigin(values: PaymentEnvironment = process.env) {
  assertProPaymentsEnabled(values);
  return sponsorSiteOrigin(values.RELEASE_REHEARSAL_TARGET === "pro-fixture"
    ? { ...values, RELEASE_REHEARSAL_TARGET: undefined, DATA_ENVIRONMENT: "preview" }
    : values);
}

export function assertProStripeSecretKey(values: PaymentEnvironment = process.env) {
  const mode = assertProPaymentsEnabled(values);
  if (!new RegExp(`^(sk|rk)_${mode}_.+`).test(values.STRIPE_SECRET_KEY ?? ""))
    throw new Error(`STRIPE_SECRET_KEY must be a Stripe ${mode} key.`);
}

export function assertProStripeObjectMode(object: { livemode?: boolean }, values: PaymentEnvironment = process.env) {
  const mode = assertProPaymentsEnabled(values);
  if (object.livemode !== (mode === "live")) throw new Error(`Stripe ${mode} objects are required for this environment.`);
}
