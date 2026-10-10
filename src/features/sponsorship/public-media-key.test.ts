import { expect, it } from "vitest";
import { createSponsorPublicAssetKey } from "./public-media-key";

it.each([
  ["image/jpeg", "sponsorships/account/campaign/version/asset.jpg"],
  ["image/png", "sponsorships/account/campaign/version/asset.png"],
  ["image/webp", "sponsorships/account/campaign/version/asset.webp"],
  ["image/avif", "sponsorships/account/campaign/version/asset.avif"],
  ["image/gif", "sponsorships/account/campaign/version/asset.gif"],
  ["video/mp4", "sponsorships/account/campaign/version/asset.mp4"],
  ["video/webm", "sponsorships/account/campaign/version/asset.webm"],
])("preserves existing immutable public paths for %s", (contentType, expected) => {
  expect(createSponsorPublicAssetKey({
    accountId: "account",
    campaignId: "campaign",
    versionId: "version",
    asset: { id: "asset", contentType },
  })).toBe(expected);
});
