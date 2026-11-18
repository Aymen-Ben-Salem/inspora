// Exercises the bundled Worker, real local R2 and SQLite Durable Objects in workerd.
// No network catalog/AI calls, Cloudflare credentials or paid services are used.
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {buildCatalog,publishCatalog} from './catalog.mjs';
import {work,note,embed} from '../test/fixtures.mjs';
import {sha} from '../catalog.mjs';
import {previewKey} from './previews.mjs';
import {mediaFingerprint} from '../enrichment.mjs';
import {visualAssetKey,visualManifestKey,visualSha} from '../visuals.mjs';
import {runtimeModules} from './runtime-bundle.mjs';
import fs from 'node:fs';

const token='local_runtime_fixture_'.padEnd(43,'x'),origin='https://mcp.test';
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'inspora-mcp',modules:runtimeModules,compatibilityDate:'2026-11-13',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],durableObjects:{ACCESS_STATE:{className:'AccessState',useSQLite:true}},r2Buckets:['CATALOG'],bindings:{MCP_ORIGIN:origin,ACCESS_MODE:'pilot',MCP_PILOT_TOKENS:JSON.stringify([{id:'runtime-test',sha256:sha(token),expiresAt:'2099-01-01'}])}},{name:'source-probe',compatibilityDate:'2026-11-13',modules:[{type:'ESModule',path:'probe.mjs',contents:`import {requestCatalog} from './source-request.mjs';export default {fetch(){return requestCatalog('x'.repeat(43),async(url,init)=>{const request=new Request(url,init);return Response.json({redirect:request.redirect,authorizationPresent:request.headers.has('authorization')});});}}`},{type:'ESModule',path:'source-request.mjs',contents:fs.readFileSync(new URL('./source-request.mjs',import.meta.url),'utf8')}]}]}));
let client;
try{
  const probe=await mf.getWorker('source-probe'),probeResult=await(await probe.fetch('https://probe.test/')).json();
  assert.deepEqual(probeResult,{redirect:'manual',authorizationPresent:true});
  const bucket=await mf.getR2Bucket('CATALOG');
  const rows=Array.from({length:26},(_,i)=>({...work(i+1),title:'Blue glass card '+i,description:'Blue glass geometric interface grid'}));
  const feed={version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries:rows.map(row=>note(row))}};
  const index=await buildCatalog(feed,{embed});await publishCatalog(bucket,index);
  const thumbnail=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=','base64');
  await bucket.put(previewKey(index.rows[0]),thumbnail);
  const visualRow=index.rows[1],packed=Uint8Array.of(255,216,255,217);
  const asset={role:'still',width:1,height:1,bytes:packed.length,sha256:visualSha(packed)};
  await bucket.put(visualAssetKey(visualRow,asset),packed);
  await bucket.put(visualManifestKey(visualRow),JSON.stringify({
    version:1,workId:visualRow.id,mediaFingerprint:mediaFingerprint(visualRow),assets:[asset],
  }));
  client=new Client({name:'workerd-verification',version:'1'});
  const transport=new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}},fetch:(url,init)=>mf.dispatchFetch(url,init)});
  await client.connect(transport);
  const tools=await client.listTools();assert.equal(tools.tools.length,4);
  const first=JSON.parse((await client.callTool({name:'search_inspiration',arguments:{reference_url:'https://www.inspora.design/posts/sample-1'}})).content[0].text);
  assert.equal(first.results.length,10);assert.ok(first.next_cursor);
  assert.equal(first.search_coverage.catalog_works,26);assert.equal(first.search_coverage.matching_works,25);
  const detail=await client.callTool({name:'get_work',arguments:{id:index.rows[0].id,preview:'image'}});
  assert.match(detail.content[1].text,/^Image 1 · /);assert.equal(detail.content[2].type,'image');assert.equal(detail.content[2].data,thumbnail.toString('base64'));
  const batch=await client.callTool({name:'get_works',arguments:{ids:[visualRow.id]}});
  assert.equal(batch.content[2].mimeType,'image/jpeg');
  assert.equal(batch.content[2].data,Buffer.from(packed).toString('base64'));
  const next=await client.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}});
  assert.equal(next.isError,undefined);assert.equal(JSON.parse(next.content[0].text).results.length,10);
  const replay=await client.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}});
  assert.equal(replay.isError,undefined);assert.deepEqual(JSON.parse(replay.content[0].text),JSON.parse(next.content[0].text));
  console.log('PASS: bundled Worker + local R2 + SQLite continuation + HTTP MCP client');
}finally{await client?.close();await mf.dispose();}
