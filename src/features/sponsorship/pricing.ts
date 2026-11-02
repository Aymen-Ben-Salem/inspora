// Minor units, before tax. These are the only prices offered to new sponsors.
export const SPONSOR_AMOUNTS = { usd: 75000, eur: 70000 } as const;
export const SPONSOR_OFFER_DESCRIPTION = `USD ${SPONSOR_AMOUNTS.usd / 100} or EUR ${SPONSOR_AMOUNTS.eur / 100}`;
export type SponsorCurrency = keyof typeof SPONSOR_AMOUNTS;
export function isSponsorCurrency(value: unknown): value is SponsorCurrency {
  return value === "usd" || value === "eur";
}
export function sponsorPriceLabel(currency: SponsorCurrency): string {
  return `${currency === "eur" ? "€" : "$"}${SPONSOR_AMOUNTS[currency] / 100}`;
}
export function sponsorAmount(currency: string): number | undefined {
  return currency === "usd" || currency === "eur" ? SPONSOR_AMOUNTS[currency] : undefined;
}
