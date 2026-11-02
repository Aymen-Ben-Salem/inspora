import type { SponsorCurrency } from "./pricing";

// Countries and territories that use the euro, as of November 2026.
// https://economy-finance.ec.europa.eu/euro/use-euro/euro-outside-euro-area_en
const euroCountries = new Set("AD AT AX BE BG BL CY DE EE ES FI FR GF GP GR HR IE IT LT LU LV MC ME MF MQ MT NL PM PT RE SI SK SM VA XK YT".split(" "));

export function regionalSponsorCurrency(headers: Pick<Headers, "get">): SponsorCurrency {
  const country = headers.get("x-vercel-ip-country")?.trim().toUpperCase();
  return country && euroCountries.has(country) ? "eur" : "usd";
}
