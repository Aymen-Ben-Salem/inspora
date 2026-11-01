import { canonicalHash, EXCLUDED_WEBSITE_ID, type ContentSnapshot, type Row } from './content-transfer-plan';

export type ReviewedUpdate = { table: 'creators' | 'posts' | 'website_media' | 'creator_username_aliases'; id: string; before: Row; values: Row; beforeRowSha256?: string };
export type ReleaseIdentityDecisions = {
  version: 1;
  status: 'approved' | 'pending';
  mappings: { kind?: 'combine' | 'attribution'; sourceIds: string[]; survivorId: string; sourceHashes: Record<string, string>; profile: Row }[];
  corrections: ReviewedUpdate[];
};
export const RELEASE_PROFILE_FIELDS = ['name', 'handle', 'url', 'username', 'x_profile_url', 'x_profile_account_id', 'avatar_url', 'avatar_storage_provider', 'avatar_storage_key'] as const;
const recordingFields = ['url', 'poster_url', 'size_bytes', 'storage_key', 'video_preview', 'poster_storage_key'];
export function assertReviewedUpdateScope(change: ReviewedUpdate) {
  const keys = Object.keys(change.values);
  const allowed = change.table === 'creators' ? RELEASE_PROFILE_FIELDS : change.table === 'posts' ? ['creator_id'] : change.table === 'website_media' ? recordingFields : change.table === 'creator_username_aliases' ? ['is_current','username'] : [];
  if (!keys.length || keys.some(k => !(allowed as readonly string[]).includes(k)) || !same(Object.keys(change.before).sort(), [...keys].sort()) || ['website_media','creator_username_aliases'].includes(change.table) && !/^[a-f0-9]{64}$/.test(change.beforeRowSha256 ?? '')) fail('correction scope rejected');
  if (change.table === 'creator_username_aliases' && keys.includes('is_current') && typeof change.values.is_current !== 'boolean') fail('alias flag rejected');
  if (change.table === 'creator_username_aliases' && keys.includes('username') && (typeof change.values.username !== 'string' || typeof change.before.username !== 'string' || change.values.username.toLowerCase() !== change.before.username.toLowerCase())) fail('alias casing rejected');
  if (keys.includes('x_profile_account_id') && change.values.x_profile_account_id != null && !/^[1-9]\d{0,24}$/.test(String(change.values.x_profile_account_id))) fail('official X account ID rejected');
}
const fail = (reason: string): never => { throw Error('Release content: identity ' + reason); };
const same = (a: unknown, b: unknown) => canonicalHash(a ?? null) === canonicalHash(b ?? null);
const unowned = (c: Row) => !c.has_owner && !c.has_verified_x && !c.owner_user_id && !c.x_provider_id && !['user', 'development'].includes(String(c.record_origin));

/** Only transforms a planning view. Never merges/deletes destination rows or transfers ownership. */
export function prepareReleaseIdentities(source: ContentSnapshot, destination: ContentSnapshot, decisions?: ReleaseIdentityDecisions, rewrite: (value: unknown) => unknown = value => value) {
  const s = structuredClone(source), d = structuredClone(destination), updates: ReviewedUpdate[] = [];
  const approvedProfiles = new Set<string>();
  if (!decisions) return { source: s, destination: d, updates, approvedProfiles };
  if (decisions.version !== 1 || decisions.status !== 'approved' || !Array.isArray(decisions.mappings) || !Array.isArray(decisions.corrections)) fail('decisions require approval');
  for (const correction of decisions.corrections) {
    const keys = Object.keys(correction.values);
    assertReviewedUpdateScope(correction);
    const row = d.rows[correction.table]?.find(r => r.id === correction.id) ?? fail('correction target missing');
    if (correction.table === 'creators' && !unowned(row)) fail('correction target rejected');
    if (correction.table === 'website_media' && (row.role !== 'recording' || row.website_id === EXCLUDED_WEBSITE_ID || !s.rows.websites.some(w => w.id === row.website_id))) fail('recording correction target rejected');
    if (keys.every(k => same(row[k], correction.values[k]))) continue;
    if (correction.beforeRowSha256 && canonicalHash(row) !== correction.beforeRowSha256) fail('correction row drift');
    if (keys.some(k => !same(row[k], correction.before[k]))) fail('correction drift');
    if (correction.table === 'posts' && !d.rows.creators.some(c => c.id === correction.values.creator_id && unowned(c))) fail('attribution target rejected');
    updates.push(structuredClone(correction)); Object.assign(row, correction.values);
  }
  const seen = new Set<string>();
  for (const mapping of decisions.mappings) {
    if (!mapping.sourceIds.length || new Set(mapping.sourceIds).size !== mapping.sourceIds.length || mapping.sourceIds.some(id => seen.has(id)) || Object.keys(mapping.profile).some(k => !(RELEASE_PROFILE_FIELDS as readonly string[]).includes(k))) fail('mapping scope rejected');
    mapping.sourceIds.forEach(id => seen.add(id));
    const sources = mapping.sourceIds.map(id => s.rows.creators.find(c => c.id === id) ?? fail('source missing'));
    for (const c of sources) if (!unowned(c) || canonicalHash(c) !== mapping.sourceHashes[String(c.id)]) fail('source profile drift or ownership');
    const existing = d.rows.creators.find(c => c.id === mapping.survivorId);
    if (existing && !unowned(existing)) fail('survivor is owned');
    if (mapping.kind && !['combine','attribution'].includes(mapping.kind)) fail('mapping kind rejected');
    if (mapping.kind === 'attribution' && (!existing || mapping.sourceIds.length !== 1 || mapping.sourceIds[0] === mapping.survivorId)) fail('attribution mapping requires distinct existing people');
    if (mapping.kind !== 'attribution' && mapping.sourceIds.some(id => id !== mapping.survivorId && d.rows.creators.some(c => c.id === id))) fail('destination duplicate requires a separate reviewed reconciliation');
    const base = sources.find(c => c.id === mapping.survivorId) ?? existing;
    if (!base) fail('survivor missing');
    const canonical: Row = { ...base, ...mapping.profile, id: mapping.survivorId };
    if (typeof canonical.username !== 'string') fail('primary username required');
    s.rows.creators = s.rows.creators.filter(c => !mapping.sourceIds.includes(String(c.id)) && c.id !== mapping.survivorId);
    s.rows.creators.push(canonical);
    for (const table of ['logos', 'websites']) for (const row of s.rows[table]) if (mapping.sourceIds.includes(String(row.creator_id))) row.creator_id = mapping.survivorId;
    for (const alias of s.rows.creator_username_aliases) if (mapping.sourceIds.includes(String(alias.creator_id))) {
      alias.creator_id = mapping.survivorId; alias.is_current = alias.username === canonical.username;
    }
    if (existing) {
      const desired = rewrite(mapping.profile) as Row;
      const values = Object.fromEntries(Object.entries(desired).filter(([k,v]) => !same(existing[k], v)));
      if (Object.keys(values).length) {
        const before = Object.fromEntries(Object.keys(values).map(k => [k, existing[k] ?? null]));
        updates.push({ table: 'creators', id: mapping.survivorId, before, values }); Object.assign(existing, values);
      }
    }
    approvedProfiles.add(mapping.survivorId);
  }
  for (const correction of decisions.corrections.filter(c=>c.table==='creator_username_aliases')) {
    const row=d.rows.creator_username_aliases.find(r=>r.id===correction.id)!;
    const sourceAlias=s.rows.creator_username_aliases.find(a=>String(a.username).toLowerCase()===String(row.username).toLowerCase());
    if(!sourceAlias||sourceAlias.creator_id!==row.creator_id||sourceAlias.is_current!==row.is_current||sourceAlias.username!==row.username)fail('alias correction target rejected');
  }
  return { source: s, destination: d, updates, approvedProfiles };
}
