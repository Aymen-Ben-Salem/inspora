import { describe, expect, it } from "vitest";
import { collectSponsorBackupReferences, assertSponsorBackupTables } from "./sponsor-backup-references";
import { SPONSORSHIP_BACKUP_TABLES } from "./sponsor-release-policy";

describe("retained sponsorship backup inventory", () => {
  it("retains private originals, all published versions and wordmarks while drafts do not require public promotion", () => {
    const refs = collectSponsorBackupReferences({
      assets: [{ staging_key: "sponsorships/owner/staging/original.png", object_key: "sponsorships/owner/source/original.png", state: "verified", digest: "a".repeat(64) }],
      campaigns: [{ wordmark_storage_key: "sponsorships/account/campaign/current/wordmark.png" }],
      versions: [
        { id: "old", campaign_id: "campaign", account_id: "account", was_public: true, creative: { assets: [{ id: "wordmark", kind: "wordmark", contentType: "image/png", digest: "b".repeat(64) }, { id: "source", kind: "original", contentType: "image/png" }] } },
        { id: "draft", campaign_id: "campaign", account_id: "account", was_public: false, creative: { assets: [{ id: "new", kind: "icon", contentType: "image/png" }] } },
      ],
    });
    expect(refs).toContainEqual({ bucket: "inspora-submissions-preview", key: "sponsorships/owner/source/original.png", required: true, digest: "a".repeat(64) });
    expect(refs).toContainEqual({ bucket: "inspora-media-preview", key: "sponsorships/account/campaign/old/wordmark.png", required: true, digest: "b".repeat(64) });
    expect(refs.find(r => r.key.endsWith("draft/new.png"))?.required).toBe(false);
    expect(refs.some(r => r.key.endsWith("old/source.png"))).toBe(false);
  });
  it("rejects stale backup schema coverage and unsafe references", () => {
    expect(() => assertSponsorBackupTables(["sponsors"])).toThrow(/schema/);
    expect(() => assertSponsorBackupTables([...SPONSORSHIP_BACKUP_TABLES])).not.toThrow();
    expect(() => collectSponsorBackupReferences({ assets: [{ object_key: "../foreign", staging_key: "pending", state: "verified" }], campaigns: [], versions: [] })).toThrow(/reference/);
  });
});
