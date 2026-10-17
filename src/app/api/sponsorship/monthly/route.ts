import { readSponsorJson } from "@/features/sponsorship/request-policy";
import { sponsorApiResponse } from "@/features/sponsorship/api-response";
import { startOwnMonthlyRenewal } from "@/features/sponsorship/billing-service";

export async function POST(request: Request) {
  return sponsorApiResponse(async () => {
    const body = await readSponsorJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)
      return { ok: false, code: "invalid_input", message: "Review your monthly billing change." };
    return startOwnMonthlyRenewal();
  });
}
