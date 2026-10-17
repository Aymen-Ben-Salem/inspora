// Minor units, before tax. These are the only prices offered to new sponsors.
export const SPONSOR_AMOUNTS = { usd: 50000, eur: 45000 } as const;
export type SponsorCurrency = keyof typeof SPONSOR_AMOUNTS;
export function sponsorAmount(currency: string): number | undefined {
  return currency === "usd" || currency === "eur" ? SPONSOR_AMOUNTS[currency] : undefined;
}
