import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaFingerprint} from '../../enrichment.mjs';
import {visualManifestKey, visualAssetKey, visualSha, visualSource} from '../../visuals.mjs';
import {enqueueVisualJobs, recordVisualResult, processVisualJob, validatePack, consumeVisualJobs, REQUEUE_AFTER_MS, RECORD_PREFIX, retryDelaySeconds} from '../visual-jobs.mjs';
import {CatalogSync} from '../synchronization.mjs';
import {Storage} from './helpers.mjs';
import {work} from '../../test/fixtures.mjs';

class ObjectBucket {
  values = new Map(); writes = [];
  async get(key) {const value = this.values.get(key); return value === undefined ? null : {size:value.length, json:async () => JSON.parse(value), arrayBuffer:async () => value};}
  async head(key) {return this.values.has(key) ? {key} : null;}
  async put(key, value) {this.writes.push(key); this.values.set(key, value);}
  async list({prefix, cursor, limit}) {
    const keys = [...this.values.keys()].filter(key => key.startsWith(prefix)).sort(), start = Number(cursor ?? 0);
    const page = keys.slice(start, start + limit);
    return {objects:page.map(key => ({key})), truncated:start + limit < keys.length, cursor:String(start + limit)};
  }
}
class Queue {sent = []; async sendBatch(messages) {this.sent.push(...messages.map(message => message.body));}}

const jpeg = fill => Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(60, fill)]);
// A container reply for the row: one still, built exactly as prepare-visuals.mjs keys it.
function reply(row, {bytes = jpeg(1), tamper} = {}) {
  const item = {role:'still', width:800, height:600, bytes:bytes.length, sha256:visualSha(bytes)};
  const payload = {key:visualManifestKey(row), manifest:{version:1, workId:row.id, mediaFingerprint:mediaFingerprint(row), assets:[item]},
    assets:[{key:visualAssetKey(row, item), role:'still', data:bytes.toString('base64')}]};
  tamper?.(payload);
  return payload;
}
const packed = (bucket, row) => bucket.values.set(visualManifestKey(row), '{}');

test('enqueue queues only eligible works without a current pack, once, and skips parked failures', async () => {
  const bucket = new ObjectBucket(), queue = new Queue(), storage = new Storage(), now = Date.now();
  const rows = [work(1), work(2), work(3, 'website'), {...work(4), media:[{type:'image', url:'https://cdn.example.com/a.png'}]}];
  packed(bucket, rows[0]);
  const first = await enqueueVisualJobs({bucket, queue, storage, rows, now});
  assert.deepEqual(queue.sent.map(job => job.workId), [rows[1].id, rows[2].id]);
  assert.equal(first.packed, 1); assert.equal(first.unsupported, 1);
  assert.deepEqual(queue.sent[0], {workId:rows[1].id, mediaFingerprint:mediaFingerprint(rows[1])});
  // Idempotent: a repeated refresh does not queue the same jobs again while they are pending.
  await enqueueVisualJobs({bucket, queue, storage, rows, now:now + 1000});
  assert.equal(queue.sent.length, 2);
  // A lost or dead-lettered job is queued again after the requeue window.
  await enqueueVisualJobs({bucket, queue, storage, rows, now:now + REQUEUE_AFTER_MS + 1});
  assert.equal(queue.sent.length, 4);
  // A permanent failure is skipped until the media changes.
  await recordVisualResult(storage, {workId:rows[1].id, mediaFingerprint:mediaFingerprint(rows[1]), state:'failed', reason:'Too long'});
  queue.sent = [];
  await enqueueVisualJobs({bucket, queue, storage, rows, now:now + 3 * REQUEUE_AFTER_MS});
  assert.deepEqual(queue.sent.map(job => job.workId), [rows[2].id]);
  const changed = {...rows[1], media:[{type:'image', url:'https://media.inspora.design/replacement.png'}]};
  queue.sent = [];
  await enqueueVisualJobs({bucket, queue, storage, rows:[rows[0], changed], now:now + 3 * REQUEUE_AFTER_MS});
  assert.deepEqual(queue.sent, [{workId:changed.id, mediaFingerprint:mediaFingerprint(changed)}]);
  // Records of removed works are cleared; a stored pack clears its record.
  assert.equal(await storage.get(RECORD_PREFIX + rows[2].id), undefined);
  packed(bucket, changed);
  await enqueueVisualJobs({bucket, queue, storage, rows:[rows[0], changed], now:now + 4 * REQUEUE_AFTER_MS});
  assert.equal(await storage.get(RECORD_PREFIX + changed.id), undefined);
});

test('enqueue is bounded per refresh and disabled without a queue binding', async () => {
  const bucket = new ObjectBucket(), queue = new Queue(), storage = new Storage();
  const rows = Array.from({length:120}, (_, i) => work(i + 1));
  const result = await enqueueVisualJobs({bucket, queue, storage, rows, limit:50});
  assert.equal(queue.sent.length, 50); assert.equal(result.waiting, 70);
  assert.deepEqual(await enqueueVisualJobs({bucket, queue:undefined, storage, rows}), {state:'disabled'});
});

test('the consumer stores assets before the manifest and reports done', async () => {
  const bucket = new ObjectBucket(), row = work(5), reports = [];
  const calls = [];
  const result = await processVisualJob({workId:row.id, mediaFingerprint:mediaFingerprint(row)}, {
    bucket, readIndex:async () => ({rows:[row]}), report:async value => reports.push(value),
    packer:() => ({fetch:async (url, init) => {calls.push(JSON.parse(init.body)); return Response.json(reply(row));}}),
  });
  assert.equal(result, 'done');
  assert.deepEqual(calls[0], {row:{id:row.id, kind:row.kind, media:row.media}}, 'the container receives only the public row');
  assert.equal(bucket.writes.at(-1), visualManifestKey(row));
  assert.ok(bucket.writes[0].endsWith('.jpg'));
  assert.deepEqual(reports, [{workId:row.id, mediaFingerprint:mediaFingerprint(row), state:'done'}]);
});

test('the consumer drops stale or already-packed jobs and parks rejected or invalid packs', async () => {
  const row = work(6), job = {workId:row.id, mediaFingerprint:mediaFingerprint(row)};
  const run = async (options) => {
    const bucket = options.bucket ?? new ObjectBucket(), reports = [];
    const outcome = await processVisualJob(options.job ?? job, {bucket, readIndex:async () => ({rows:options.rows ?? [row]}),
      report:async value => reports.push(value), packer:() => ({fetch:async () => options.response})});
    return {outcome, reports, bucket};
  };
  assert.equal((await run({job:{...job, mediaFingerprint:'0'.repeat(64)}})).outcome, 'dropped');
  assert.equal((await run({rows:[]})).outcome, 'dropped');
  const existing = new ObjectBucket(); packed(existing, row);
  assert.equal((await run({bucket:existing})).outcome, 'dropped');
  const rejected = await run({response:Response.json({error:'REJECTED', reason:'Video exceeds the preparation limits'}, {status:422})});
  assert.equal(rejected.outcome, 'failed'); assert.equal(rejected.reports[0].reason, 'Video exceeds the preparation limits');
  for (const tamper of [
    payload => {payload.assets[0].data = jpeg(2).toString('base64');}, // hash mismatch
    payload => {payload.assets[0].key = payload.assets[0].key.replace('still-', 'detail-1-');}, // wrong key
    payload => {payload.manifest.assets[0].bytes += 1;}, // wrong size
    payload => {payload.key = 'mcp/visuals/v1/other/manifest.json';},
    payload => {payload.manifest.workId = work(7).id;},
  ]) {
    const invalid = await run({response:Response.json(reply(row, {tamper}))});
    assert.equal(invalid.outcome, 'failed');
    assert.equal(invalid.bucket.writes.length, 0, 'nothing from an invalid pack is stored');
  }
  await assert.rejects(run({response:new Response('busy', {status:503})}), /VISUAL_PACKER_HTTP_503/);
});

test('validatePack accepts the exact keys prepare-visuals.mjs produces', () => {
  const row = work(8), pack = validatePack(row, reply(row));
  assert.equal(pack.key, visualManifestKey(row)); assert.equal(pack.assets.length, 1);
  assert.match(pack.assets[0].key, /^mcp\/visuals\/v1\/[0-9a-f-]+\/[0-9a-f]{64}\/still-[0-9a-f]{64}\.jpg$/);
});

test('the queue handler acks finished and malformed jobs and retries transient failures with backoff', async () => {
  const messages = ['ack', 'retry', 'malformed'].map((kind, i) => ({kind, attempts:i + 1, acked:false, retried:null,
    body:kind === 'malformed' ? {workId:'x'} : {workId:work(20 + i).id, mediaFingerprint:mediaFingerprint(work(20 + i))},
    ack() {this.acked = true;}, retry(options) {this.retried = options;}}));
  const bucket = new ObjectBucket();
  packed(bucket, work(20));
  const env = {CATALOG:bucket, CATALOG_SYNC:{idFromName:name => name, get:() => ({fetch:async () => Response.json({recorded:true})})},
    VISUAL_PACKER:{idFromName:name => name, get:() => ({fetch:async () => new Response('down', {status:503})})}};
  // Without a published catalog the reader throws, which is transient.
  await consumeVisualJobs({messages:[messages[1]]}, env);
  assert.deepEqual(messages[1].retried, {delaySeconds:retryDelaySeconds(2)});
  await consumeVisualJobs({messages:[messages[2]]}, env);
  assert.equal(messages[2].acked, true);
  assert.equal(retryDelaySeconds(1), 60); assert.equal(retryDelaySeconds(10), 3600);
});

test('CatalogSync records consumer results and rejects malformed ones', async () => {
  const storage = new Storage(), job = new CatalogSync({storage, blockConcurrencyWhile:fn => fn()}, {});
  const row = work(9), fingerprint = mediaFingerprint(row);
  await storage.put(RECORD_PREFIX + row.id, {mediaFingerprint:fingerprint, state:'queued', at:1});
  const send = body => job.fetch(new Request('https://internal/', {method:'POST', body:JSON.stringify({action:'visual-result', ...body})}));
  assert.equal((await send({workId:row.id, mediaFingerprint:fingerprint, state:'failed', reason:'Rejected'})).status, 200);
  assert.equal((await storage.get(RECORD_PREFIX + row.id)).state, 'failed');
  assert.equal((await send({workId:row.id, mediaFingerprint:fingerprint, state:'done'})).status, 200);
  assert.equal(await storage.get(RECORD_PREFIX + row.id), undefined);
  assert.equal((await send({workId:'not-a-uuid', mediaFingerprint:fingerprint, state:'done'})).status, 400);
  // The maintainer status includes the last scheduling summary once visuals are enabled.
  assert.equal((await (await job.fetch(new Request('https://internal/', {method:'POST', body:JSON.stringify({action:'status'})}))).json()).visuals, undefined);
  await storage.put('visuals', {state:'ok', queued:1});
  assert.deepEqual((await (await job.fetch(new Request('https://internal/', {method:'POST', body:JSON.stringify({action:'status'})}))).json()).visuals, {state:'ok', queued:1});
});

test('a catalog refresh schedules packs after commit and a scheduling failure never fails the refresh', async () => {
  const {buildCatalog, publishCatalog} = await import('../catalog.mjs');
  const {embed} = await import('../../test/fixtures.mjs');
  const bucket = new ObjectBucket(), storage = new Storage(), queue = new Queue();
  const rows = [work(30), work(31)], feed = () => ({version:1, catalog:{capturedAt:new Date().toISOString(), rows}, enrichment:{version:1, entries:[]}});
  await publishCatalog(bucket, await buildCatalog(feed(), {embed}));
  const sync = new CatalogSync({storage, blockConcurrencyWhile:fn => fn()}, {CATALOG:bucket, VISUAL_QUEUE:queue}, {readSource:async () => feed(), embed});
  await sync.alarm();
  assert.equal((await storage.get('status')).state, 'ready');
  assert.deepEqual(queue.sent.map(job => job.workId).sort(), rows.map(row => row.id).sort());
  const failing = new CatalogSync({storage:new Storage(), blockConcurrencyWhile:fn => fn()}, {CATALOG:bucket, VISUAL_QUEUE:{sendBatch:async () => {throw Error('queue down');}}}, {readSource:async () => feed(), embed});
  await failing.alarm();
  assert.equal((await failing.state.storage.get('status')).state, 'ready');
  assert.equal((await failing.state.storage.get('visuals')).state, 'failed');
});

test('visualSource picks first-party preparable media only', () => {
  assert.deepEqual(visualSource(work(1)), {source:'https://media.inspora.design/sample.webp', extension:'.webp', motion:false});
  assert.deepEqual(visualSource(work(2, 'website')), {source:'https://media.inspora.design/sample.mp4', extension:'.mp4', motion:true});
  assert.equal(visualSource({...work(3), media:[{type:'image', url:'https://mir-s3-cdn-cf.behance.net/a.png'}]}), null);
  assert.equal(visualSource({...work(3), media:[{type:'video', url:'https://media.inspora.design/a.gif'}]}), null);
});
