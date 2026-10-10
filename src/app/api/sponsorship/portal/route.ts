import { assertSponsorWriteRequest } from "@/features/sponsorship/request-policy";
import { createOwnBillingPortal } from "@/features/sponsorship/billing-service";
import { sponsorApiResponse } from "@/features/sponsorship/api-response";
export async function POST(request: Request) {
  return sponsorApiResponse(async () => {
    assertSponsorWriteRequest(request);
    return createOwnBillingPortal();
  });
}
