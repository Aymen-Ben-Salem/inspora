// Central Inspora Pro plan rules. The November 2026 validation candidate (base
// price before applicable tax), not a profitability claim. Pro has no credits:
// the MCP plugin is included under fair-use limits enforced by the hosted Worker.
export const PRO_PLAN = {
  id: "pro_monthly",
  name: "Inspora Pro",
  interval: "month",
  currency: "usd",
  baseAmountCents: 700,
  features: ["mcp"] as const,
} as const;

/** Fair-use limits per personal account across all connected clients (enforced by the MCP Worker). */
export const PRO_MCP_FAIR_USE = { toolCallsPerMinute: 30, toolCallsPerDay: 500, searchesPerMonth: 3000 } as const;

export type ProEnvironment = Record<string, string | undefined>;

/** Pro surfaces stay dark unless explicitly enabled for the deployment. */
export function proFeatureEnabled(values: ProEnvironment = process.env) {
  return values.INSPORA_PRO_ENABLED === "true";
}

export function proStripeConfig(values: ProEnvironment = process.env) {
  const subscriptionPriceId = values.STRIPE_PRO_PRICE_ID ?? "";
  const webhookSecret = values.STRIPE_PRO_WEBHOOK_SECRET ?? "";
  const portalConfigurationId = values.STRIPE_PRO_PORTAL_CONFIGURATION_ID ?? "";
  if (!subscriptionPriceId.startsWith("price_")) return null;
  return {
    subscriptionPriceId,
    webhookSecret: webhookSecret.startsWith("whsec_") ? webhookSecret : null,
    portalConfigurationId: portalConfigurationId.startsWith("bpc_") ? portalConfigurationId : null,
    // Tax collection is never assumed; enable only after merchant/obligation verification.
    automaticTax: values.STRIPE_PRO_AUTOMATIC_TAX === "true",
  };
}

export function formatUsd(cents: number) {
  return `US$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
