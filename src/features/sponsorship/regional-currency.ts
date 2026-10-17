import type { SponsorCurrency } from "./pricing";

// Europe is a pricing region, including countries that do not use the euro.
// Country codes also cover requests where Vercel does not supply a continent.
const europe = new Set("AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK".split(" "));

export function regionalSponsorCurrency(headers: Pick<Headers, "get">): SponsorCurrency {
  const continent = headers.get("x-vercel-ip-continent")?.trim().toUpperCase();
  const country = headers.get("x-vercel-ip-country")?.trim().toUpperCase();
  return continent === "EU" || (!continent && country && europe.has(country)) ? "eur" : "usd";
}
