import { createSponsorPublicAssetKey } from "../../src/features/sponsorship/public-media-key";
import { ACCEPTED_MEDIA_MIME_TYPES } from "../../src/features/media/upload-policy";
import type { Row } from "./content-transfer-plan";
import type { TransferDatabaseClient } from "./content-transfer-database";
import { PREVIEW_MEDIA_BUCKETS, type SponsorBackupReference } from "./release-backup-media";
import { SPONSORSHIP_BACKUP_TABLES } from "./sponsor-release-policy";

export function assertSponsorBackupTables(tables: string[]) {
  if (SPONSORSHIP_BACKUP_TABLES.some(table => !tables.includes(table)))
    throw new Error("Backup sponsorship schema coverage incomplete.");
}

/** Inventory references only; credentials, owners and visitor identities never enter the report. */
export function collectSponsorBackupReferences(input: { assets: Row[]; campaigns: Row[]; versions: Row[] }): SponsorBackupReference[] {
  const references = new Map<string, SponsorBackupReference>();
  const add = (bucket: string, key: unknown, required: boolean, digest?: unknown) => {
    if (key == null) return;
    if (typeof key !== "string" || !key || key.startsWith("/") || key.includes("\\") || key.split("/").some(part => part === ".." || part === "."))
      throw new Error("Backup sponsorship reference rejected.");
    const hash = typeof digest === "string" ? digest : undefined;
    if (hash && !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Backup sponsorship reference digest rejected.");
    const prior = references.get(bucket + "/" + key);
    if (prior?.digest && hash && prior.digest !== hash) throw new Error("Backup sponsorship reference digest conflict.");
    references.set(bucket + "/" + key, { bucket, key, required: required || Boolean(prior?.required), ...(hash || prior?.digest ? { digest: hash || prior?.digest } : {}) });
  };
  for (const asset of input.assets) {
    add(PREVIEW_MEDIA_BUCKETS[1], asset.staging_key, false);
    if (asset.state === "verified" && !asset.object_key) throw new Error("Backup verified sponsorship reference missing.");
    add(PREVIEW_MEDIA_BUCKETS[1], asset.object_key, asset.state === "verified", asset.digest);
  }
  const publicReferences = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(publicReferences); return; }
    if (!value || typeof value !== "object") return;
    for (const [name, child] of Object.entries(value)) {
      if (/storage_?key$/i.test(name)) add(PREVIEW_MEDIA_BUCKETS[0], child, true);
      else publicReferences(child);
    }
  };
  input.campaigns.forEach(publicReferences);
  for (const version of input.versions) {
    if (!version.account_id) continue; // unpaid versions have no public account namespace
    const creative = version.creative as { assets?: Row[] } | null;
    if (!Array.isArray(creative?.assets)) throw new Error("Backup sponsorship version reference missing.");
    for (const asset of creative.assets) {
      if (asset.kind === "original") continue;
      if (typeof asset.id !== "string" || typeof asset.contentType !== "string" || !(ACCEPTED_MEDIA_MIME_TYPES as readonly string[]).includes(asset.contentType))
        throw new Error("Backup sponsorship asset reference rejected.");
      add(PREVIEW_MEDIA_BUCKETS[0], createSponsorPublicAssetKey({
        accountId: String(version.account_id), campaignId: String(version.campaign_id), versionId: String(version.id),
        asset: { id: asset.id, contentType: asset.contentType },
      }), version.was_public === true, asset.digest);
    }
  }
  return [...references.values()].sort((a, b) => (a.bucket + "/" + a.key).localeCompare(b.bucket + "/" + b.key));
}

export async function readSponsorBackupReferences(client: TransferDatabaseClient) {
  const tables = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r => String(r.tablename));
  assertSponsorBackupTables(tables);
  const assets = (await client.query("select staging_key,object_key,state,digest from sponsor_assets")).rows;
  const campaigns = (await client.query("select media_storage_key,media_poster_storage_key,media_variants,media_video_preview,icon_storage_key,wordmark_storage_key from sponsors")).rows;
  const versions = (await client.query("select v.id,v.campaign_id,v.creative,s.account_id,exists(select 1 from sponsor_delivery_intervals i where i.version_id=v.id) as was_public from sponsor_campaign_versions v join sponsors s on s.id=v.campaign_id")).rows;
  return collectSponsorBackupReferences({ assets, campaigns, versions });
}
