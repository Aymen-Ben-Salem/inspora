import { z } from "zod";
import { readSponsorJson } from "@/features/sponsorship/request-policy";
import { startSponsorCheckout } from "@/features/sponsorship/billing-service";
import { sponsorApiResponse } from "@/features/sponsorship/api-response";
import { regionalSponsorCurrency } from "@/features/sponsorship/regional-currency";
export async function POST(request: Request) {
  return sponsorApiResponse(async () => {
    const parsed = z
      .object({ checkoutId: z.uuid(), billingMode: z.enum(["one_time", "subscription"]), currency: z.enum(["usd", "eur"]).optional() })
      .strict()
      .safeParse(await readSponsorJson(request));
    if (!parsed.success)
      return {
        ok: false,
        code: "invalid_input",
        message: "An owned preparation is required.",
      };
    return startSponsorCheckout(parsed.data.checkoutId, parsed.data.billingMode, parsed.data.currency ?? regionalSponsorCurrency(request.headers));
  });
}
