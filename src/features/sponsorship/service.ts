import "server-only";
import { verifiedSponsorOwner } from "./authorization";
import { createPreparationService } from "./campaigns";
import { sponsorshipWritesEnabled } from "./config";
import { preparationStore } from "./repository";
import { cleanupExpiredSponsorPreparations } from "./cleanup";
import { after } from "next/server";
export const preparationService = createPreparationService({
  owner: () => verifiedSponsorOwner("write"),
  now: () => new Date(),
  store: preparationStore,
});
export async function beginSponsorPreparation() {
  if (!sponsorshipWritesEnabled())
    return {
      ok: false as const,
      code: "unavailable" as const,
      message: "Sponsor preparation is currently unavailable.",
    };
  const result = await preparationService.begin();
  after(async () => {
    try {
      await cleanupExpiredSponsorPreparations();
    } catch {
      console.error("Sponsor preparation cleanup is pending retry.");
    }
  });
  return result;
}
export async function saveOwnCampaign(input: unknown) {
  if (!sponsorshipWritesEnabled())
    return {
      ok: false as const,
      code: "unavailable" as const,
      message: "Sponsor changes are currently unavailable.",
    };
  return preparationService.save(input);
}
