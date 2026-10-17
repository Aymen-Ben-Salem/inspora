import "server-only";
import { headers } from "next/headers";
import { regionalSponsorCurrency } from "./regional-currency";

export async function readSponsorCurrency() {
  return regionalSponsorCurrency(await headers());
}
