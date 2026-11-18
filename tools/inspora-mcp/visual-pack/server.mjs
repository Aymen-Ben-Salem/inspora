// Hosted visual-pack builder. One job at a time: the Worker sends a work's public
// catalog row, this server downloads that work's own first-party media, builds the pack
// with the same code as prepare-visuals.mjs and returns the manifest plus assets. It holds
// no credentials and writes nothing outside a per-job temporary directory.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable, Transform} from 'node:stream';
import {buildVisualPack, VisualPackRejected} from '../prepare-visuals.mjs';
import {visualSource} from '../visuals.mjs';

const PORT = Number(process.env.PORT ?? 8080);
const MAX_REQUEST_BYTES = 256_000;
const MAX_MEDIA_BYTES = 128_000_000;
const DOWNLOAD_TIMEOUT_MS = 90_000;
const KINDS = ['design','website','logo','icon'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let busy = false;

const reply = (response, status, value) => {
  const body = JSON.stringify(value);
  response.writeHead(status, {'content-type':'application/json','content-length':Buffer.byteLength(body)});
  response.end(body);
};

async function readRequest(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new VisualPackRejected('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Only the catalog fields a pack depends on; anything else is ignored.
function workRow(input) {
  const row = input?.row;
  if (!row || !UUID.test(row.id ?? '') || !KINDS.includes(row.kind) || !Array.isArray(row.media) || row.media.length > 20) {
    throw new VisualPackRejected('Invalid work');
  }
  return {id:row.id, kind:row.kind, media:row.media};
}

async function download(source, file) {
  const response = await fetch(source, {redirect:'error', signal:AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)});
  if (response.status === 404 || response.status === 410 || response.status === 403) {
    throw new VisualPackRejected('Media unavailable: HTTP ' + response.status);
  }
  if (!response.ok || !response.body) throw Error('Media download failed: HTTP ' + response.status);
  if (Number(response.headers.get('content-length')) > MAX_MEDIA_BYTES) throw new VisualPackRejected('Media exceeds the input limit');
  let size = 0;
  const limit = new Transform({transform(chunk, _encoding, done) {
    size += chunk.length;
    done(size > MAX_MEDIA_BYTES ? new VisualPackRejected('Media exceeds the input limit') : null, chunk);
  }});
  await pipeline(Readable.fromWeb(response.body), limit, fs.createWriteStream(file));
}

async function pack(input) {
  const row = workRow(input);
  const media = visualSource(row);
  if (!media) throw new VisualPackRejected('No first-party media to prepare');
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pack-'));
  try {
    const file = path.join(directory, 'source' + media.extension);
    await download(media.source, file);
    const built = await buildVisualPack(row, {file, source:media.source}, path.join(directory, 'work'));
    return {key:built.key, manifest:built.manifest,
      assets:built.assets.map(asset => ({key:asset.key, role:asset.item.role, data:asset.bytes.toString('base64')}))};
  } finally {
    await fs.promises.rm(directory, {recursive:true, force:true});
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://container');
  if (request.method === 'GET' && url.pathname === '/health') return reply(response, 200, {ok:true});
  if (request.method !== 'POST' || url.pathname !== '/pack') return reply(response, 404, {error:'NOT_FOUND'});
  if (busy) return reply(response, 429, {error:'BUSY'});
  busy = true;
  const started = Date.now();
  try {
    const result = await pack(await readRequest(request));
    reply(response, 200, {...result, elapsed_ms:Date.now() - started});
  } catch (error) {
    const rejected = error instanceof VisualPackRejected || error instanceof SyntaxError;
    reply(response, rejected ? 422 : 503, {error:rejected ? 'REJECTED' : 'FAILED', reason:String(error.message ?? '').slice(0, 200)});
  } finally {
    busy = false;
  }
});
server.requestTimeout = 600_000;
server.listen(PORT, () => console.log('visual-pack listening on ' + PORT));
