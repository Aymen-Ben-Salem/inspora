import { createHash } from "node:crypto";
import { planCreatorProfileBackfill } from "./creator-profile-backfill";
import { normalizeXProfileUrl } from "../../src/features/creators/validation";

export type Row = Record<string, unknown>;
export type ContentSnapshot = {
  capturedAt: string;
  rows: Record<string, Row[]>;
  tableHashes: Record<string, { count: number; sha256: string }>;
  schema: Row[];
  ledger: Row[];
  constraints: Row[];
  indexes: Row[];
};
export const D1 = {
  duplicate: "260bccc4-5b7c-459e-a584-626cd509b476",
  survivor: "ec44f4b4-9d6a-4fd5-bb9a-63018f39ed68",
  auric: "cbeb0734-450c-48cf-8556-dc28e340dc81",
} as const;
export const EXCLUDED_WEBSITE_ID = "7bbef4d7-9de9-49cc-a7d1-e12c45f84a2e";
export const CONTENT_COLUMNS: Record<string, readonly string[]> = {
  posts: ["id", "slug", "title", "creator_id", "description", "category", "industries", "colors", "styles", "source_url", "status", "is_featured", "published_at", "archived_at", "created_at", "updated_at"],
  post_media: ["id", "post_id", "type", "url", "poster_url", "storage_provider", "storage_key", "mime_type", "source_mime_type", "size_bytes", "variants", "video_preview", "poster_storage_key", "alt", "width", "height", "position", "created_at"],
  creators: ["id", "name", "handle", "url", "avatar_url", "avatar_storage_provider", "avatar_storage_key", "created_at", "updated_at", "username", "x_profile_url", "edited_fields", "record_origin"],
  logos: ["creator_id"],
};
export type RowChange = { table: string; id: string; before: Row | null; after: Row; fields: string[]; beforeHash: string; afterHash: string };
export type ContentTransferPlan = {
  desired: Record<string, Row[]>;
  changes: RowChange[];
  aliasInserts: Row[];
  mergeDuplicate: boolean;
  protectedWorkIds: string[];
  mediaKeys: string[];
  productionMediaKeys: string[];
  preservedPreviewMediaKeys: string[];
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function text(row: Row, key: string): string {
  if (typeof row[key] !== "string") throw new Error(`Transfer conflict: missing ${key}.`);
  return row[key];
}
function same(a: unknown, b: unknown) { return canonicalHash(a ?? null) === canonicalHash(b ?? null); }
function conflict(message: string): never { throw new Error(`Transfer conflict: ${message}.`); }
function rewrite(value: unknown, sourceHost: string, destinationHost: string): unknown {
  if (typeof value === "string" && value.startsWith(`https://${sourceHost}/`)) return `https://${destinationHost}/` + value.slice(`https://${sourceHost}/`.length);
  if (Array.isArray(value)) return value.map(v => rewrite(v, sourceHost, destinationHost));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, sourceHost, destinationHost)]));
  return value;
}
function aliasId(creatorId: string, username: string) {
  const hex = canonicalHash(["preview-content-transfer-alias", creatorId, username]);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Pure reconciliation: has no clients, secrets or ability to write. */
export function buildContentTransferPlan(source: ContentSnapshot, preview: ContentSnapshot, options: { sourceHost: string; destinationHost: string; newOnly?: boolean }): ContentTransferPlan {
  if (options.sourceHost === options.destinationHost) conflict("identical media environments");
  let p = source.rows;
  const d = preview.rows, desired = structuredClone(d);
  for (const table of ["creators", "posts", "post_media"]) {
    if (!p[table] || !d[table]) conflict(`missing ${table} snapshot`);
    for (const rows of [p[table], d[table]]) if (new Set(rows.map(r => r.id)).size !== rows.length) conflict(`duplicate ${table} IDs`);
  }
  if (options.newOnly) {
    const posts = p.posts.filter(r => !d.posts.some(existing => existing.id === r.id));
    const postIds = new Set(posts.map(r => r.id));
    const creatorIds = new Set(posts.map(r => r.creator_id));
    p = { ...p, posts, post_media: p.post_media.filter(r => postIds.has(r.post_id)),
      creators: p.creators.filter(r => creatorIds.has(r.id) && !d.creators.some(existing => existing.id === r.id)) };
  }
  const sourceDesignIds = new Set(p.posts.map(r => r.id));
  if (!options.newOnly) for (const row of d.posts) if (!sourceDesignIds.has(row.id)) conflict(`preview-only design ${row.id}`);
  for (const row of p.posts) {
    if (!d.design_categories.some(c => c.name === row.category)) conflict(`unknown category ${row.category}`);
    if (d.posts.some(c => c.slug === row.slug && c.id !== row.id)) conflict(`slug collision ${row.slug}`);
    if (!p.creators.some(c => c.id === row.creator_id) && !(options.newOnly && d.creators.some(c => c.id === row.creator_id))) conflict(`missing source creator ${row.creator_id}`);
  }
  for (const row of p.post_media) {
    if (!sourceDesignIds.has(row.post_id)) conflict("orphan source media");
    if (d.post_media.some(c => c.post_id === row.post_id && c.position === row.position && c.id !== row.id)) conflict(`media identity collision ${row.id}`);
    const existing = d.post_media.find(c => c.id === row.id);
    if (existing && existing.post_id !== row.post_id) conflict(`media parent collision ${row.id}`);
  }
  if (!options.newOnly) for (const row of d.post_media) if (!p.post_media.some(c => c.id === row.id)) conflict(`preview-only design media ${row.id}`);

  const duplicate = options.newOnly ? undefined : d.creators.find(r => r.id === D1.duplicate);
  const survivor = d.creators.find(r => r.id === D1.survivor);
  if (duplicate) {
    if ([duplicate, survivor].some(c => c?.has_owner || c?.has_verified_x)) conflict("D1 ownership/provider evidence requires review");
    if (!p.creators.some(c => c.id === D1.survivor)) conflict("missing D1 production survivor");
    if (duplicate.username !== "cabralorenzo" || survivor?.username && survivor.username !== "cabralorenzo") conflict("D1 username changed");
    if ([...d.posts, ...d.websites, ...d.logos.filter(r => r.id !== D1.auric)].some(r => r.creator_id === D1.duplicate)) conflict("new D1 work reference");
  }
  desired.posts = [...(options.newOnly ? structuredClone(d.posts) : []), ...structuredClone(p.posts)];
  desired.post_media = [...(options.newOnly ? structuredClone(d.post_media) : []), ...rewrite(p.post_media, options.sourceHost, options.destinationHost) as Row[]];
  for (const sourceCreator of p.creators) {
    const existing = d.creators.find(r => r.id === sourceCreator.id);
    let next: Row;
    if (existing) {
      next = structuredClone(existing);
      const edited = Array.isArray(existing.edited_fields) ? existing.edited_fields : [];
      for (const field of ["name", "handle", "url"]) {
        const ownerField = field === "url" ? "websiteUrl" : field;
        if (!same(existing[field], sourceCreator[field]) && !edited.includes(ownerField)) conflict(`shared creator ${sourceCreator.id} changed ${field}`);
      }
      if (!edited.includes("avatarUrl")) for (const field of ["avatar_url", "avatar_storage_provider", "avatar_storage_key"]) next[field] = field === "avatar_url" ? rewrite(sourceCreator[field], options.sourceHost, options.destinationHost) : sourceCreator[field];
      else next.avatar_url = rewrite(next.avatar_url, options.sourceHost, options.destinationHost);
    } else {
      let xProfile: string | null = null;
      try { xProfile = normalizeXProfileUrl(String(sourceCreator.url ?? "")); } catch { /* A website is not a verified X identity. */ }
      next = { ...sourceCreator, avatar_url: rewrite(sourceCreator.avatar_url, options.sourceHost, options.destinationHost), username: null, x_profile_url: xProfile, edited_fields: [], record_origin: "mirrored", has_owner: false, has_verified_x: false };
    }
    if (sourceCreator.id === D1.survivor && duplicate) {
      next.username = duplicate.username;
      next.edited_fields = duplicate.edited_fields ?? [];
    }
    desired.creators = desired.creators.filter(r => r.id !== sourceCreator.id);
    desired.creators.push(next);
  }
  if (duplicate) {
    desired.creators = desired.creators.filter(r => r.id !== D1.duplicate);
    desired.creator_username_aliases = desired.creator_username_aliases.map(r => r.creator_id === D1.duplicate ? { ...r, creator_id: D1.survivor } : r);
    desired.logos = desired.logos.map(r => r.id === D1.auric && r.creator_id === D1.duplicate ? { ...r, creator_id: D1.survivor } : r);
  }
  desired.creators.sort((a, b) => text(a, "id").localeCompare(text(b, "id")));
  const initialization = planCreatorProfileBackfill(desired.creators.map(r => ({ id: text(r, "id"), name: text(r, "name"), handle: r.handle as string | null, username: r.username as string | null, ownerUserId: r.has_owner ? "preserved" : null, xProviderId: r.has_verified_x ? "preserved" : null, recordOrigin: text(r, "record_origin") })), desired.creator_username_aliases.map(r => ({ creatorId: text(r, "creator_id"), username: text(r, "username"), isCurrent: r.is_current === true }))).filter(r => p.creators.some(c => c.id === r.creatorId));
  const aliasInserts: Row[] = [];
  for (const change of initialization) {
    if (change.updateUsername) desired.creators.find(r => r.id === change.creatorId)!.username = change.username;
    if (change.insertAlias) {
      const alias = { id: aliasId(change.creatorId, change.username), creator_id: change.creatorId, username: change.username, is_current: true };
      aliasInserts.push(alias);
      desired.creator_username_aliases.push(alias);
    }
  }
  const changes: RowChange[] = [];
  for (const table of ["creators", "posts", "post_media", "logos"]) for (const after of desired[table]) {
    const before = d[table].find(r => r.id === after.id) ?? null;
    const fields = CONTENT_COLUMNS[table].filter(k => k !== "id" && Object.hasOwn(after, k) && (!before || !same(before[k], after[k])));
    if (!before || fields.length) changes.push({ table, id: text(after, "id"), before, after, fields, beforeHash: canonicalHash(before), afterHash: canonicalHash(after) });
  }
  const productionKeys = new Set<string>(), previewKeys = new Set<string>();
  const inspectMedia = (value: unknown, keys: Set<string>): void => {
    if (Array.isArray(value)) { value.forEach(v => inspectMedia(v, keys)); return; }
    if (!value || typeof value !== "object") return;
    const row = value as Row;
    for (const [urlField, keyFields] of [["url", ["storage_key", "storageKey"]], ["poster_url", ["poster_storage_key"]], ["avatar_url", ["avatar_storage_key"]]] as const) {
      if (typeof row[urlField] === "string" && (row[urlField] as string).startsWith(`https://${options.destinationHost}/`) && !keyFields.some(k => row[k])) conflict(`missing media key ${urlField}`);
    }
    for (const [urlField, keyField] of [["url", "storage_key"], ["url", "storageKey"], ["poster_url", "poster_storage_key"], ["avatar_url", "avatar_storage_key"]]) {
      if (!row[keyField]) continue;
      if (typeof row[urlField] !== "string") conflict(`missing media URL ${keyField}`);
      const url = new URL(row[urlField] as string);
      if (url.protocol !== "https:" || url.host !== options.destinationHost || url.search || url.hash || decodeURIComponent(url.pathname.slice(1)) !== row[keyField]) conflict(`media URL/key mismatch ${keyField}`);
      keys.add(String(row[keyField]));
    }
    Object.values(row).forEach(v => inspectMedia(v, keys));
  };
  desired.post_media.filter(r => !options.newOnly || sourceDesignIds.has(r.post_id)).forEach(v => inspectMedia(v, productionKeys));
  for (const creator of desired.creators.filter(c => p.creators.some(s => s.id === c.id))) {
    const existing = d.creators.find(c => c.id === creator.id);
    const previewOwned = Array.isArray(existing?.edited_fields) && existing.edited_fields.includes("avatarUrl") && typeof existing.avatar_url === "string" && existing.avatar_url.startsWith(`https://${options.destinationHost}/`);
    inspectMedia({ avatar_url: creator.avatar_url, avatar_storage_key: creator.avatar_storage_key }, previewOwned ? previewKeys : productionKeys);
  }
  if ([...previewKeys].some(k => productionKeys.has(k))) conflict("media key has conflicting source ownership");
  return { desired, changes, aliasInserts, mergeDuplicate: !!duplicate, mediaKeys: [...productionKeys, ...previewKeys].sort(), productionMediaKeys: [...productionKeys].sort(), preservedPreviewMediaKeys: [...previewKeys].sort(), protectedWorkIds: [...d.logos, ...d.websites.filter(r => r.id !== EXCLUDED_WEBSITE_ID)].map(r => text(r, "id")) };
}
