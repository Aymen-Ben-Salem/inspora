export type SponsorshipResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "unauthenticated"
        | "forbidden"
        | "invalid_input"
        | "conflict"
        | "expired"
        | "capacity_full"
        | "unavailable";
      message: string;
    };
export type SponsorAccountState =
  "active" | "recovery" | "inactive" | "revoked" | "deleting";
export type SponsorActor = {
  userId: string;
  accountId: string;
  state: SponsorAccountState;
};
export type CampaignState =
  "legacy" | "prepared" | "draft" | "published" | "archived";
export type SponsorPlacement = "header" | "feed" | "detail";
export type SponsorAssetKind =
  "original" | "media" | "icon" | "wordmark" | "poster" | "video-preview" | "variant";
export type VerifiedSponsorAsset = {
  id: string;
  kind: SponsorAssetKind;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  digest: string;
  url: string;
  sourceAssetId?: string;
};
export type CampaignInput = {
  title: string;
  url: string;
  tagline: string;
  expectedRevision: number;
  iconId: string;
  wordmarkId: string;
  mediaId?: string;
  posterId?: string;
  videoPreviewId?: string;
  variantIds: string[];
};
export type CreativeSnapshot = Omit<CampaignInput, "expectedRevision"> & {
  assets: VerifiedSponsorAsset[];
};
export type OwnedCampaign = {
  id: string;
  checkoutId: string;
  versionId: string;
  revision: number;
  state: "prepared" | "draft" | "published" | "archived";
  expiresAt: string;
  creative: CreativeSnapshot;
};
export type SponsorPreparation = {
  id: string;
  ownerUserId: string;
  state: "preparing" | "ready" | "reserved" | "expired" | "completed";
  expiresAt: Date;
  revision: number;
  campaign: OwnedCampaign | null;
};
// Currency is pinned alongside the campaign when its seat is reserved. Older
// reservations omit it and keep their existing Stripe localization behavior.
export type SponsorCheckoutSnapshot = OwnedCampaign & {
  checkoutCurrency?: import("./pricing").SponsorCurrency;
  /** Server-only, immutable binding for renewal after a paid one-time month. */
  renewal?: {
    accountId: string;
    sourceCheckoutId: string;
    periodStart: string;
    startsAt: string;
    customerId: string;
  };
};
export type SponsorUpload = {
  id: string;
  ownerUserId: string;
  checkoutId: string;
  sourceAssetId?: string | null;
  kind: SponsorAssetKind;
  state: "pending" | "verified" | "deleting";
  contentType: string;
  sizeBytes: number;
  stagingKey: string;
  objectKey: string | null;
  digest: string | null;
  width: number | null;
  height: number | null;
  expiresAt: Date;
};
export type AccountCapabilities = {
  viewer: boolean;
  sponsor: boolean;
  sponsorReadonly: boolean;
};
export type MetadataSuggestions = {
  title?: string;
  iconId?: string;
  wordmarkId?: string;
  mediaId?: string;
  missingAssets?: string[];
};
export const SPONSOR_PREPARATION_HOURS = 24;
