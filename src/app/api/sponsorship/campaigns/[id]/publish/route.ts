import { z } from "zod";
import {
  paidCampaignService,
  withCampaignWrites,
} from "@/features/sponsorship/campaign-service";
import { sponsorApiResponse } from "@/features/sponsorship/api-response";
import { readSponsorJson } from "@/features/sponsorship/request-policy";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return sponsorApiResponse(async () =>
    withCampaignWrites(async () => {
      const { expectedRevision } = z
        .object({ expectedRevision: z.number().int().positive() })
        .strict()
        .parse(await readSponsorJson(request));
      return paidCampaignService.publish(
        z.uuid().parse((await context.params).id),
        expectedRevision,
      );
    }),
  );
}
