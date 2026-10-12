import type { Row } from "./content-transfer-plan";

export const EDITORIAL_RELEASE_TABLES = [
  "creators", "creator_username_aliases", "logos", "logo_media",
  "websites", "website_media", "website_sections",
] as const;

export const SPONSORSHIP_BACKUP_TABLES = [
  "sponsors", "sponsor_identities", "sponsor_accounts", "sponsor_checkouts",
  "sponsor_seats", "sponsor_campaign_versions", "sponsor_assets",
  "sponsor_version_assets", "sponsor_billing_events", "sponsor_jobs",
  "sponsor_delivery_periods", "sponsor_delivery_intervals",
  "analytics_identity_epochs", "analytics_events", "analytics_occurrences",
  "analytics_rate_buckets", "analytics_reports",
] as const;

export const LEGACY_ORPHAN_PREFIXES = ["posts/", "creators/", "sponsors/"] as const;
export function legacyOrphanKeyAllowed(key: string) {
  return !key.startsWith("sponsorships/") && LEGACY_ORPHAN_PREFIXES.some(prefix => key.startsWith(prefix));
}

/** Empty seats come from migrations; no preview rows are release content. */
export function assertNoPreviewSponsorshipTransfer(plan: {
  inserts: Record<string, Row[]>;
  mediaKeys: string[];
}, editorialReferences: unknown = plan.inserts) {
  for (const [table, rows] of Object.entries(plan.inserts)) {
    if (!(EDITORIAL_RELEASE_TABLES as readonly string[]).includes(table) && rows.length)
      throw new Error("Sponsorship transfer: non-editorial table rejected.");
    for (const row of rows) {
      if (row.has_owner || row.has_verified_x || row.record_origin === "user" || row.record_origin === "development" || ["owner_user_id", "x_provider_id", "account_id", "stripe_customer_id", "stripe_subscription_id", "visitor_key"].some(key => row[key] != null))
        throw new Error("Sponsorship transfer: account ownership rejected.");
    }
  }
  const references = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [name, child] of Object.entries(value)) {
      if (/storage_?key$/i.test(name) && typeof child === "string") references.add(child);
      visit(child);
    }
  };
  visit(editorialReferences);
  for (const key of plan.mediaKeys) {
    if (!key || key.startsWith("/") || key.split("/").includes("..") ||
        (key.startsWith("sponsorships/") && !references.has(key)))
      throw new Error("Sponsorship transfer: unreferenced media rejected.");
  }
}
