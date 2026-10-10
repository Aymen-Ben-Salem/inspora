import type { VerifiedSponsorAsset } from "./types";

// Immutable public paths must use the same extension during promotion and
// deletion. These MIME types have already passed sponsor media validation.
export function createSponsorPublicAssetKey(input: {
  accountId: string;
  campaignId: string;
  versionId: string;
  asset: Pick<VerifiedSponsorAsset, "id" | "contentType">;
}) {
  const extension = input.asset.contentType.split("/")[1].replace("jpeg", "jpg");
  return `sponsorships/${input.accountId}/${input.campaignId}/${input.versionId}/${input.asset.id}.${extension}`;
}
