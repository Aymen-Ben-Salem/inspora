import { resolveSponsorCreative } from "./creative";
import { campaignInputSchema } from "./validation";
import {
  SPONSOR_PREPARATION_HOURS,
  type CreativeSnapshot,
  type OwnedCampaign,
  type SponsorPreparation,
  type SponsorshipResult,
  type VerifiedSponsorAsset,
} from "./types";

export type PreparationTransaction = {
  lockOwner(ownerUserId: string): Promise<void>;
  findPreparation(ownerUserId: string): Promise<SponsorPreparation | null>;
  createPreparation(
    ownerUserId: string,
    expiresAt: Date,
  ): Promise<SponsorPreparation>;
  expirePreparation(preparation: SponsorPreparation): Promise<void>;
  findOwnedAsset(
    ownerUserId: string,
    id: string,
    checkoutId: string,
    now: Date,
  ): Promise<VerifiedSponsorAsset | null>;
  freezeCampaign(
    preparation: SponsorPreparation,
    creative: CreativeSnapshot,
  ): Promise<OwnedCampaign>;
};
export type PreparationStore = {
  transaction<T>(work: (tx: PreparationTransaction) => Promise<T>): Promise<T>;
};
const failure = (
  code: Extract<SponsorshipResult<never>, { ok: false }>["code"],
  message: string,
) => ({ ok: false as const, code, message });

export function createPreparationService(deps: {
  owner(): Promise<string | null>;
  now(): Date;
  store: PreparationStore;
}) {
  async function withPreparation<T>(
    create: boolean,
    work: (
      tx: PreparationTransaction,
      p: SponsorPreparation,
      now: Date,
    ) => Promise<SponsorshipResult<T>>,
  ): Promise<SponsorshipResult<T>> {
    const owner = await deps.owner();
    if (!owner)
      return failure(
        "unauthenticated",
        "Verify sponsor access before saving or uploading.",
      );
    return deps.store.transaction(async (tx) => {
      await tx.lockOwner(owner);
      const now = deps.now();
      let preparation = await tx.findPreparation(owner);
      if (preparation?.state === "reserved")
        return failure("conflict", "Checkout has pinned this preparation. Open your sponsorship dashboard to continue.");
      if (
        preparation &&
        (preparation.expiresAt <= now || preparation.state === "expired")
      ) {
        await tx.expirePreparation(preparation);
        if (!create)
          return failure(
            "expired",
            "Your preparation expired. Start a new preparation.",
          );
        preparation = null;
      }
      if (!preparation && create)
        preparation = await tx.createPreparation(
          owner,
          new Date(now.getTime() + SPONSOR_PREPARATION_HOURS * 3600000),
        );
      if (!preparation || preparation.state === "completed")
        return failure("forbidden", "No unpaid preparation is available.");
      return work(tx, preparation, now);
    });
  }
  return {
    begin: () =>
      withPreparation(true, async (_tx, p) => ({ ok: true, value: p })),
    read: () =>
      withPreparation(false, async (_tx, p) => ({ ok: true, value: p })),
    async save(raw: unknown): Promise<SponsorshipResult<OwnedCampaign>> {
      const parsed = campaignInputSchema.safeParse(raw);
      if (!parsed.success)
        return failure(
          "invalid_input",
          parsed.error.issues[0]?.message ?? "Check your campaign fields.",
        );
      return withPreparation(false, async (tx, p, now) => {
        if (p.revision !== parsed.data.expectedRevision)
          return failure("conflict", "Your preparation changed. Reload before saving.");
        const creative = await resolveSponsorCreative(parsed.data, id => tx.findOwnedAsset(p.ownerUserId, id, p.id, now));
        if (!creative.ok) return creative;
        return { ok: true, value: await tx.freezeCampaign(p, creative.value) };
      });
    },
  };
}
