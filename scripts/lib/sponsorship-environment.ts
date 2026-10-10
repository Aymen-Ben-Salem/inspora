export const SPONSORSHIP_CONFIGURATION_KEYS = [
  "SPONSORSHIP_ENABLED",
  "SPONSORSHIP_WRITES_ENABLED",
  "SPONSORSHIP_CHECKOUT_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SPONSOR_PRICE_ID",
  "STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID",
  "STRIPE_SPONSOR_AUTOMATIC_TAX",
  "CRON_SECRET",
  "SITE_URL",
] as const;
export function validatePreviewSponsorshipEnvironment(
  values: Record<string, string | undefined>,
) {
  if (
    values.STRIPE_SECRET_KEY &&
    !values.STRIPE_SECRET_KEY.startsWith("sk_test_")
  )
    throw new Error("Preview sponsorship requires a Stripe test secret key.");
  if (
    values.STRIPE_WEBHOOK_SECRET &&
    !values.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")
  )
    throw new Error("Stripe webhook secret format is invalid.");
  if (values.SPONSORSHIP_CHECKOUT_ENABLED !== "true") return;
  for (const name of [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_SPONSOR_PRICE_ID",
    "STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID",
    "CRON_SECRET",
    "SITE_URL",
  ])
    if (!values[name]) throw new Error(`Preview checkout requires ${name}.`);
  if (
    !values.STRIPE_SPONSOR_PRICE_ID?.startsWith("price_") ||
    !values.STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID?.startsWith("bpc_") ||
    (values.CRON_SECRET?.length ?? 0) < 32
  )
    throw new Error(
      "Preview sponsorship provider/job configuration is invalid.",
    );
  if (!["true", "false"].includes(values.STRIPE_SPONSOR_AUTOMATIC_TAX ?? ""))
    throw new Error("Explicit preview Stripe tax behavior is required.");
}
