import "server-only";
import { verifiedSponsorOwner } from "./authorization";
import { createPaidCampaignService } from "./paid-campaigns";
import { promoteSponsorMedia } from "./public-media";
import { sponsorshipWritesEnabled } from "./config";
const campaigns = createPaidCampaignService({
  owner: () => verifiedSponsorOwner(),
  now: () => new Date(),
  promote: promoteSponsorMedia,
});
export const paidCampaignService = {
  ...campaigns,
  async list() {
    const result = await campaigns.list();
    if (result.ok && !sponsorshipWritesEnabled()) {
      return { ...result, value: { ...result.value, readonly: true } };
    }
    return result;
  },
};
export function withCampaignWrites<T>(work: () => Promise<T>) {
  if (!sponsorshipWritesEnabled())
    return Promise.resolve({
      ok: false as const,
      code: "unavailable" as const,
      message: "Sponsor changes are currently unavailable.",
    });
  return work();
}
