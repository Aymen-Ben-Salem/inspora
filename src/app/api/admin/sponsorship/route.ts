import { after } from "next/server";
import { z } from "zod";
import { readSponsorJson } from "@/features/sponsorship/request-policy";
import { administerSponsorBilling } from "@/features/sponsorship/admin-billing";
import { sponsorApiResponse } from "@/features/sponsorship/api-response";
import { drainSponsorJobs } from "@/features/sponsorship/jobs";
export async function POST(request: Request) {
  return sponsorApiResponse(async () => {
    const parsed = z
      .object({
        action: z.enum(["retry", "revoke", "resolve_exception"]),
        checkoutId: z.uuid(),
      })
      .strict()
      .safeParse(await readSponsorJson(request));
    if (!parsed.success)
      return {
        ok: false,
        code: "invalid_input",
        message: "Select a sponsor checkout and supported action.",
      };
    await administerSponsorBilling(parsed.data.action, parsed.data.checkoutId);
    after(async () => {
      try {
        await drainSponsorJobs();
      } catch {
        console.error("Sponsor admin work remains queued.");
      }
    });
    return { ok: true, value: { queued: true } };
  });
}
