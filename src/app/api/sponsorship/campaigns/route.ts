import {
  paidCampaignService,
  withCampaignWrites,
} from "@/features/sponsorship/campaign-service";
import { sponsorApiResponse } from "@/features/sponsorship/api-response";
import { readSponsorJson } from "@/features/sponsorship/request-policy";
export async function GET() {
  return sponsorApiResponse(() => paidCampaignService.list());
}
export async function POST(request: Request) {
  return sponsorApiResponse(async () =>
    withCampaignWrites(() =>
      readSponsorJson(request).then((input) =>
        paidCampaignService.save(null, input),
      ),
    ),
  );
}
