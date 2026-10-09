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
  "media" | "icon" | "wordmark" | "poster" | "video-preview" | "variant";
export type VerifiedSponsorAsset = {
  id: string;
  kind: SponsorAssetKind;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  digest: string;
  url: string;
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
  state: "prepared";
  expiresAt: string;
  creative: CreativeSnapshot;
};
export type SponsorPreparation = {
  id: string;
  ownerUserId: string;
  state: "preparing" | "ready" | "expired" | "completed";
  expiresAt: Date;
  revision: number;
  campaign: OwnedCampaign | null;
};
export type SponsorUpload = {
  id: string;
  ownerUserId: string;
  checkoutId: string;
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
  mediaId?: string;
};
export const SPONSOR_PREPARATION_HOURS = 24;
