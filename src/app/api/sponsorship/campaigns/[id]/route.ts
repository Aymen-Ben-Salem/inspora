import { z } from "zod";
import {
  paidCampaignService,
  withCampaignWrites,
} from "@/features/sponsorship/campaign-service";
import { sponsorApiResponse } from "@/features/sponsorship/api-response";
import { readSponsorJson } from "@/features/sponsorship/request-policy";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return sponsorApiResponse(async () =>
    paidCampaignService.read(z.uuid().parse((await context.params).id)),
  );
}
export async function PUT(request: Request, context: Context) {
  return sponsorApiResponse(async () =>
    withCampaignWrites(async () =>
      paidCampaignService.save(
        z.uuid().parse((await context.params).id),
        await readSponsorJson(request),
      ),
    ),
  );
}
export async function DELETE(request: Request, context: Context) {
  return sponsorApiResponse(async () =>
    withCampaignWrites(async () => {
      const { expectedRevision } = z
        .object({ expectedRevision: z.number().int().positive() })
        .strict()
        .parse(await readSponsorJson(request));
      return paidCampaignService.remove(
        z.uuid().parse((await context.params).id),
        expectedRevision,
      );
    }),
  );
}
