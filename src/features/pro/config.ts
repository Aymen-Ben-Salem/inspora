// Central Inspora Pro plan and credit rules. These are the November 2026
// validation candidate (base prices before applicable tax), not a profitability claim.
export const PRO_PLAN = {
  id: "pro_monthly",
  name: "Inspora Pro",
  interval: "month",
  currency: "usd",
  baseAmountCents: 700,
  includedCredits: 1000,
  features: ["mcp_search"] as const,
} as const;

export const PRO_PACK = {
  credits: 500,
  baseAmountCents: 500,
  currency: "usd",
} as const;

export const PRO_FEATURE_CREDITS = { mcp_search: 1 } as const;
export type ProFeature = keyof typeof PRO_FEATURE_CREDITS;

export const AUTO_RECHARGE = {
  thresholdCredits: 50,
  capOptionsCents: [500, 1000, 2000, 5000] as const,
  suggestedCapCents: 1000,
} as const;
export type AutoRechargeCapCents = (typeof AUTO_RECHARGE.capOptionsCents)[number];

export function isAutoRechargeCap(value: unknown): value is AutoRechargeCapCents {
  return AUTO_RECHARGE.capOptionsCents.includes(value as AutoRechargeCapCents);
}

// A reservation abandoned by a crashed/timed-out caller is released after this.
export const RESERVATION_TTL_MS = 5 * 60_000;

export type ProEnvironment = Record<string, string | undefined>;

/** Pro surfaces stay dark unless explicitly enabled for the deployment. */
export function proFeatureEnabled(values: ProEnvironment = process.env) {
  return values.INSPORA_PRO_ENABLED === "true";
}

export function proStripeConfig(values: ProEnvironment = process.env) {
  const subscriptionPriceId = values.STRIPE_PRO_PRICE_ID ?? "";
  const packPriceId = values.STRIPE_PRO_PACK_PRICE_ID ?? "";
  const webhookSecret = values.STRIPE_PRO_WEBHOOK_SECRET ?? "";
  const portalConfigurationId = values.STRIPE_PRO_PORTAL_CONFIGURATION_ID ?? "";
  if (!subscriptionPriceId.startsWith("price_") || !packPriceId.startsWith("price_") || subscriptionPriceId === packPriceId)
    return null;
  return {
    subscriptionPriceId,
    packPriceId,
    webhookSecret: webhookSecret.startsWith("whsec_") ? webhookSecret : null,
    portalConfigurationId: portalConfigurationId.startsWith("bpc_") ? portalConfigurationId : null,
    // Tax collection is never assumed; enable only after merchant/obligation verification.
    automaticTax: values.STRIPE_PRO_AUTOMATIC_TAX === "true",
  };
}

export function formatUsd(cents: number) {
  return `US$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
