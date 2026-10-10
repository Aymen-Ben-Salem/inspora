import "server-only";
import { verifiedSponsorOwner } from "./authorization";
import { createPaidCampaignService } from "./paid-campaigns";
import { promoteSponsorMedia } from "./public-media";
import { sponsorshipWritesEnabled } from "./config";
export const paidCampaignService = createPaidCampaignService({
  owner: () => verifiedSponsorOwner(),
  now: () => new Date(),
  promote: promoteSponsorMedia,
});
export function withCampaignWrites<T>(work: () => Promise<T>) {
  if (!sponsorshipWritesEnabled())
    return Promise.resolve({
      ok: false as const,
      code: "unavailable" as const,
      message: "Sponsor changes are currently unavailable.",
    });
  return work();
}
