import { describe, expect, it } from "vitest";
import { assertNoPreviewSponsorshipTransfer, legacyOrphanKeyAllowed } from "./sponsor-release-policy";

describe("preview sponsorship release exclusion", () => {
  it("rejects sponsor and visitor data before release writes", () => {
    for (const table of ["sponsors", "sponsor_identities", "sponsor_accounts", "sponsor_seats", "sponsor_assets", "analytics_events", "analytics_identity_epochs", "analytics_reports"]) {
      expect(() => assertNoPreviewSponsorshipTransfer({ inserts: { [table]: [{ id: "test" }] }, mediaKeys: [] })).toThrow(/Sponsorship transfer/);
    }
  });
  it("rejects unreferenced sponsor media and owner bindings but permits independently editorial shared bytes", () => {
    const key = "sponsorships/account/campaign/version/wordmark.png";
    expect(() => assertNoPreviewSponsorshipTransfer({ inserts: { logos: [] }, mediaKeys: [key] })).toThrow(/media/);
    expect(() => assertNoPreviewSponsorshipTransfer({ inserts: { creators: [{ id: "test", owner_user_id: "sponsor" }] }, mediaKeys: [] })).toThrow(/ownership/);
    expect(() => assertNoPreviewSponsorshipTransfer({ inserts: { logo_media: [{ id: "editorial", storage_key: key }] }, mediaKeys: [key] })).not.toThrow();
  });
  it("keeps new sponsor objects outside legacy orphan cleanup", () => {
    expect(legacyOrphanKeyAllowed("sponsorships/account/campaign/version/wordmark.png")).toBe(false);
    expect(legacyOrphanKeyAllowed("sponsors/legacy/icon.png")).toBe(true);
    expect(legacyOrphanKeyAllowed("posts/work/image.png")).toBe(true);
  });
});
