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
        const { expectedRevision, ...fields } = parsed.data;
        if (p.revision !== expectedRevision)
          return failure(
            "conflict",
            "Your preparation changed. Reload before saving.",
          );
        const attachments = [
          [fields.iconId, "icon"],
          [fields.wordmarkId, "wordmark"],
          [fields.mediaId, "media"],
          [fields.posterId, "poster"],
          [fields.videoPreviewId, "video-preview"],
          ...fields.variantIds.map((id) => [id, "variant"]),
        ];
        const assets: VerifiedSponsorAsset[] = [];
        for (const [id, kind] of attachments) {
          if (!id) continue;
          const asset = await tx.findOwnedAsset(p.ownerUserId, id, p.id, now);
          if (!asset || asset.kind !== kind)
            return failure(
              "forbidden",
              "Use verified assets from your own current preparation.",
            );
          assets.push(asset);
        }
        const media = assets.find((a) => a.id === fields.mediaId);
        if (
          media?.contentType.startsWith("video/") &&
          (!fields.posterId || !fields.videoPreviewId)
        )
          return failure(
            "invalid_input",
            "Video requires a verified poster and preview.",
          );
        if (
          !media?.contentType.startsWith("video/") &&
          (fields.posterId || fields.videoPreviewId)
        )
          return failure(
            "invalid_input",
            "Poster and video preview require a video.",
          );
        if (!media && fields.variantIds.length)
          return failure("invalid_input", "Image variants require feed media.");
        return {
          ok: true,
          value: await tx.freezeCampaign(p, { ...fields, assets }),
        };
      });
    },
  };
}
