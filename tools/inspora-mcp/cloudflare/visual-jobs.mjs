// Automatic MCP visual packs. After each committed catalog rebuild, CatalogSync queues the
// eligible works whose current media has no pack; a queue consumer asks the VisualPacker
// container to build one, validates it and stores it through the CATALOG binding: assets
// first, the manifest last, so a manifest never points at missing images. Nothing here can
// fail a catalog refresh, and packs are keyed by media fingerprint, so reruns are idempotent.
import {z} from 'zod';
import {mediaFingerprint} from '../enrichment.mjs';
import {visualManifest, visualManifestKey, visualAssetKey, visualSha, visualSource, VISUAL_MAX_BYTES} from '../visuals.mjs';
import {createCatalogReader} from './catalog.mjs';

export const VISUAL_PREFIX = 'mcp/visuals/v1/';
export const RECORD_PREFIX = 'visual:';
// A job still unconfirmed after this long (lost message, dead-lettered) is queued again.
export const REQUEUE_AFTER_MS = 6 * 60 * 60 * 1000;
// Bounded per refresh; the 12-hour repair and later edits continue the backlog.
export const JOBS_PER_REFRESH = 50;
export const PACKER_INSTANCES = 2;
const MANIFEST_BYTES = 12_000;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const jobSchema = z.object({workId:z.string().uuid(), mediaFingerprint:hash}).strict();
export const resultSchema = z.object({workId:z.string().uuid(), mediaFingerprint:hash, state:z.enum(['done','failed']), reason:z.string().max(200).optional()}).strict();

export async function existingManifests(bucket) {
  const keys = new Set();
  let cursor;
  for (let page = 0; page < 100; page++) {
    const listed = await bucket.list({prefix:VISUAL_PREFIX, cursor, limit:1000});
    for (const object of listed.objects) if (object.key.endsWith('/manifest.json')) keys.add(object.key);
    if (!listed.truncated) return keys;
    cursor = listed.cursor;
  }
  throw Error('VISUAL_LISTING_TOO_LARGE');
}

/** Queue packs for eligible rows without a current manifest. Returns counts for status. */
export async function enqueueVisualJobs({bucket, queue, storage, rows, now = Date.now(), limit = JOBS_PER_REFRESH}) {
  if (!queue) return {state:'disabled'};
  const existing = await existingManifests(bucket);
  const records = await storage.list({prefix:RECORD_PREFIX});
  const current = new Set(rows.map(row => row.id));
  for (const key of records.keys()) if (!current.has(key.slice(RECORD_PREFIX.length))) await storage.delete(key);
  const jobs = [];
  let packed = 0, unsupported = 0, failed = 0, waiting = 0;
  for (const row of rows) {
    if (!visualSource(row)) {unsupported++; continue;}
    const key = RECORD_PREFIX + row.id, record = records.get(key), fingerprint = mediaFingerprint(row);
    if (existing.has(visualManifestKey(row))) {
      packed++;
      if (record) await storage.delete(key);
      continue;
    }
    if (record?.mediaFingerprint === fingerprint && record.state === 'failed') {failed++; continue;}
    if (record?.mediaFingerprint === fingerprint && record.state === 'queued' && now - record.at < REQUEUE_AFTER_MS) {waiting++; continue;}
    if (jobs.length < limit) jobs.push({workId:row.id, mediaFingerprint:fingerprint});
    else waiting++;
  }
  for (let offset = 0; offset < jobs.length; offset += 100) {
    await queue.sendBatch(jobs.slice(offset, offset + 100).map(body => ({body, contentType:'json'})));
  }
  for (const job of jobs) await storage.put(RECORD_PREFIX + job.workId, {mediaFingerprint:job.mediaFingerprint, state:'queued', at:now});
  return {state:'ok', queued:jobs.length, packed, waiting, failed, unsupported, checkedAt:new Date(now).toISOString()};
}

/** Record a consumer outcome in CatalogSync storage: done clears the record, failed parks it until the media changes. */
export async function recordVisualResult(storage, input) {
  const result = resultSchema.parse(input), key = RECORD_PREFIX + result.workId;
  const record = await storage.get(key);
  if (record && record.mediaFingerprint !== result.mediaFingerprint) return;
  if (result.state === 'done') await storage.delete(key);
  else await storage.put(key, {mediaFingerprint:result.mediaFingerprint, state:'failed', reason:result.reason, at:Date.now()});
}

const decode = value => {
  if (typeof value !== 'string' || value.length > Math.ceil(VISUAL_MAX_BYTES / 3) * 4) throw Error('VISUAL_ASSET_INVALID');
  return new Uint8Array(Buffer.from(value, 'base64'));
};

/** Validate a container reply against the current row: manifest schema, identity and every asset's key, size, hash and JPEG signature. */
export function validatePack(row, payload) {
  const manifest = visualManifest.parse(payload?.manifest);
  if (manifest.workId !== row.id || manifest.mediaFingerprint !== mediaFingerprint(row) || payload.key !== visualManifestKey(row)) throw Error('VISUAL_PACK_MISMATCH');
  if (!Array.isArray(payload.assets) || payload.assets.length !== manifest.assets.length) throw Error('VISUAL_PACK_MISMATCH');
  const assets = manifest.assets.map((item, i) => {
    const asset = payload.assets[i], bytes = decode(asset?.data), key = visualAssetKey(row, item);
    if (asset.role !== item.role || asset.key !== key || bytes.length !== item.bytes || bytes[0] !== 255 || bytes[1] !== 216 || visualSha(bytes) !== item.sha256) {
      throw Error('VISUAL_ASSET_INVALID');
    }
    return {key, bytes};
  });
  const body = JSON.stringify(manifest);
  if (body.length > MANIFEST_BYTES) throw Error('VISUAL_PACK_MISMATCH');
  return {key:visualManifestKey(row), manifest:body, assets};
}

export async function storePack(bucket, pack) {
  for (const asset of pack.assets) await bucket.put(asset.key, asset.bytes, {httpMetadata:{contentType:'image/jpeg'}});
  // Packs are deterministic per media fingerprint; an existing manifest is kept as it is.
  if (await bucket.head(pack.key)) return false;
  await bucket.put(pack.key, pack.manifest, {httpMetadata:{contentType:'application/json'}});
  return true;
}

export const packerFor = (env, workId) => {
  const slot = parseInt(workId.replace(/-/g, '').slice(-4), 16) % PACKER_INSTANCES;
  return env.VISUAL_PACKER.get(env.VISUAL_PACKER.idFromName('visual-packer-' + slot));
};

/**
 * Handle one job. Returns 'done', 'dropped' (no longer current or already packed) or
 * 'failed' (media can never be packed); throws for transient errors so the queue retries.
 */
export async function processVisualJob(body, {bucket, readIndex, packer, report}) {
  const job = jobSchema.parse(body);
  const index = await readIndex(bucket);
  const row = index.rows.find(item => item.id === job.workId);
  if (!row || mediaFingerprint(row) !== job.mediaFingerprint) return 'dropped';
  if (await bucket.head(visualManifestKey(row))) {await report({...job, state:'done'}); return 'dropped';}
  if (!visualSource(row)) {await report({...job, state:'failed', reason:'No first-party media'}); return 'failed';}
  const response = await packer(row).fetch('https://visual-pack/pack', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({row:{id:row.id, kind:row.kind, media:row.media}}),
  });
  if (response.status === 422) {
    const detail = await response.json().catch(() => ({}));
    await report({...job, state:'failed', reason:String(detail.reason ?? 'Rejected').slice(0, 200)});
    return 'failed';
  }
  if (!response.ok) throw Error('VISUAL_PACKER_HTTP_' + response.status);
  let pack;
  try {pack = validatePack(row, await response.json());}
  catch {
    // A reply that fails validation is never stored; it is parked until the media changes.
    await report({...job, state:'failed', reason:'Pack failed validation'});
    return 'failed';
  }
  await storePack(bucket, pack);
  await report({...job, state:'done'});
  return 'done';
}

const reader = createCatalogReader();
export const retryDelaySeconds = attempts => Math.min(3600, 60 * 2 ** Math.max(0, attempts - 1));

export async function consumeVisualJobs(batch, env) {
  const report = result => env.CATALOG_SYNC.get(env.CATALOG_SYNC.idFromName('catalog-publisher-v1')).fetch('https://internal/', {
    method:'POST', body:JSON.stringify({action:'visual-result', ...result}),
  });
  for (const message of batch.messages) {
    try {
      await processVisualJob(message.body, {bucket:env.CATALOG, readIndex:bucket => reader(bucket, {status:true}), packer:row => packerFor(env, row.id), report});
      message.ack();
    } catch (error) {
      // Malformed jobs never succeed; everything else is retried with backoff, then dead-lettered.
      if (error instanceof z.ZodError) message.ack();
      else message.retry({delaySeconds:retryDelaySeconds(message.attempts)});
    }
  }
}
