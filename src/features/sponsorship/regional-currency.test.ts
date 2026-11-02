import { expect, it } from "vitest";
import { regionalSponsorCurrency } from "./regional-currency";
import { sponsorPriceLabel } from "./pricing";

it.each(["AT", "BE", "BG", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES", "AD", "MC", "SM", "VA", "ME", "XK", "AX", "BL", "GF", "GP", "MF", "MQ", "PM", "RE", "YT"])("offers euros where the euro is used (%s)", country => {
  expect(regionalSponsorCurrency(new Headers({ "x-vercel-ip-country": country }))).toBe("eur");
});
it.each(["GB", "CH", "NO", "SE", "PL", "RO", "HU", "DK", "CZ", "US", "CA", "TN", "JP", "AU", "", "XX"])("uses dollars outside euro countries or without a known location (%s)", country => {
  expect(regionalSponsorCurrency(new Headers({ "x-vercel-ip-country": country, "x-vercel-ip-continent": "EU" }))).toBe("usd");
});
it("uses country rather than continent or browser language", () => {
  expect(regionalSponsorCurrency(new Headers({ "x-vercel-ip-continent": "EU" }))).toBe("usd");
  expect(regionalSponsorCurrency(new Headers({ "x-vercel-ip-continent": "NA", "x-vercel-ip-country": "FR" }))).toBe("eur");
  expect(regionalSponsorCurrency(new Headers({ "x-vercel-ip-country": " fr " }))).toBe("eur");
  expect(regionalSponsorCurrency(new Headers({ "accept-language": "fr-FR" }))).toBe("usd");
  expect(sponsorPriceLabel("eur")).toBe("€700");
  expect(sponsorPriceLabel("usd")).toBe("$750");
});
