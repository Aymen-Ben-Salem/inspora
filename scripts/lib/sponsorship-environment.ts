import { assertStripePaymentsEnabled, assertStripeSecretKey, sponsorSiteOrigin } from "../../src/features/sponsorship/payment-environment";

export const SPONSORSHIP_CONFIGURATION_KEYS = [
  "SPONSORSHIP_ENABLED",
  "SPONSORSHIP_WRITES_ENABLED",
  "SPONSORSHIP_CHECKOUT_ENABLED",
  "SPONSORSHIP_LIVE_PAYMENTS_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SPONSOR_PRICE_ID",
  "STRIPE_SPONSOR_ONE_TIME_PRICE_ID",
  "STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID",
  "STRIPE_SPONSOR_AUTOMATIC_TAX",
  "CRON_SECRET",
  "SITE_URL",
] as const;
export function validatePreviewSponsorshipEnvironment(
  values: Record<string, string | undefined>,
) {
  if (values.DATA_ENVIRONMENT === "production" || /^(sk|rk)_live_/.test(values.STRIPE_SECRET_KEY ?? ""))
    throw new Error("Preview sponsorship requires a Stripe test secret key.");
  validateSponsorBillingEnvironment(values);
}

/** Operational validation also applies with purchases off (webhooks and recovery). */
export function validateSponsorBillingEnvironment(
  values: Record<string, string | undefined>,
  requireOperational = false,
) {
  const configured = SPONSORSHIP_CONFIGURATION_KEYS.some(name => name.startsWith("STRIPE_") && values[name]);
  if (configured || requireOperational || values.SPONSORSHIP_CHECKOUT_ENABLED === "true" || values.SPONSORSHIP_LIVE_PAYMENTS_ENABLED === "true") {
    assertStripePaymentsEnabled(values);
    assertStripeSecretKey(values);
  }
  if (
    values.STRIPE_WEBHOOK_SECRET &&
    !values.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")
  )
    throw new Error("Stripe webhook secret format is invalid.");
  if (values.STRIPE_SPONSOR_ONE_TIME_PRICE_ID && !values.STRIPE_SPONSOR_ONE_TIME_PRICE_ID.startsWith("price_"))
    throw new Error("Stripe one-time price configuration is invalid.");
  if (!requireOperational && values.SPONSORSHIP_CHECKOUT_ENABLED !== "true") return;
  for (const name of [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_SPONSOR_PRICE_ID",
    "STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID",
    "CRON_SECRET",
    "SITE_URL",
  ])
    if (!values[name]) throw new Error(`Stripe billing requires ${name}.`);
  if (
    !values.STRIPE_SPONSOR_PRICE_ID?.startsWith("price_") ||
    !values.STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID?.startsWith("bpc_") ||
    (values.CRON_SECRET?.length ?? 0) < 32
  )
    throw new Error(
      "Stripe sponsorship provider/job configuration is invalid.",
    );
  if (!["true", "false"].includes(values.STRIPE_SPONSOR_AUTOMATIC_TAX ?? ""))
    throw new Error("Explicit Stripe tax behavior is required.");
  sponsorSiteOrigin(values);
}

/** A compatible fallback keeps paid reads and operational billing configured. */
export function validateSponsorRecoveryEnvironment(values: Record<string, string | undefined>) {
  if (values.SPONSORSHIP_ENABLED !== "true")
    throw new Error("Recovery must retain paid sponsorship eligibility and owner access.");
  if (values.SPONSORSHIP_WRITES_ENABLED !== "false" || values.SPONSORSHIP_CHECKOUT_ENABLED !== "false")
    throw new Error("Recovery must explicitly disable checkout and campaign writes.");
  validateSponsorBillingEnvironment(values, true);
  if ((values.ANALYTICS_KEY_ENCRYPTION_SECRET?.length ?? 0) < 32)
    throw new Error("Recovery requires the retained ANALYTICS_KEY_ENCRYPTION_SECRET.");
}
