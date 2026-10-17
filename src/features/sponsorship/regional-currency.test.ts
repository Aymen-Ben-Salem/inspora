import { expect, it } from "vitest";
import { regionalSponsorCurrency } from "./regional-currency";
import { sponsorPriceLabel } from "./pricing";

it.each(["FR", "DE", "GB", "CH", "NO", "CY", "XK"])("offers euros in European pricing region %s", country => {
  expect(regionalSponsorCurrency(new Headers({ "x-vercel-ip-country": country }))).toBe("eur");
});
it.each(["US", "CA", "TN", "JP", "AU", "", "XX"])("defaults to dollars outside Europe or without a known location (%s)", country => {
  expect(regionalSponsorCurrency(new Headers({ "x-vercel-ip-country": country }))).toBe("usd");
});
it("uses the visitor's continent when available and ignores browser language", () => {
  expect(regionalSponsorCurrency(new Headers({ "x-vercel-ip-continent": "EU" }))).toBe("eur");
  expect(regionalSponsorCurrency(new Headers({ "x-vercel-ip-continent": "NA", "x-vercel-ip-country": "FR" }))).toBe("usd");
  expect(regionalSponsorCurrency(new Headers({ "accept-language": "fr-FR" }))).toBe("usd");
  expect(sponsorPriceLabel("eur")).toBe("€450");
  expect(sponsorPriceLabel("usd")).toBe("$500");
});
