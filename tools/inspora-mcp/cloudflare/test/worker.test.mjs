import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createWorker} from '../http.mjs';
import {buildCatalog,publishCatalog,MAX_SOURCE_AGE_MS} from '../catalog.mjs';
import {work,note,embed} from '../../test/fixtures.mjs';
import {sha} from '../../catalog.mjs';
import {Bucket,Namespace} from './helpers.mjs';
import {previewKey} from '../previews.mjs';
const origin='https://mcp.test';
const token='test_token_'.padEnd(43,'a'),otherToken='other_token_'.padEnd(43,'b');

async function fixture() {
  const rows=Array.from({length:18},(_,i)=>({...work(i+1,i%4===0?'website':'design'),title:'Blue glass '+(i+1),description:'Blue glass panels with a geometric grid',colors:['Blue']}));
  const input={version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries:rows.map(row=>note(row))}};
  const index=await buildCatalog(input,{embed}),bucket=new Bucket();await publishCatalog(bucket,index);
  const env={MCP_ORIGIN:origin,ACCESS_MODE:'pilot',MCP_PILOT_TOKENS:JSON.stringify([{id:'alice',sha256:sha(token),expiresAt:'2099-01-01'},{id:'bob',sha256:sha(otherToken),expiresAt:'2099-01-01'}]),CATALOG:bucket,ACCESS_STATE:new Namespace(),AI:{run:async(_model,args)=>({data:await embed(args.text)})}};
  const fetch=async(url,init)=>createWorker().fetch(new Request(url,init),env);
  return {env,fetch,index,input,bucket};
}
async function clientFor(fixture,secret=token) {
  const transport=new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+secret}},fetch:fixture.fetch});
  const client=new Client({name:'hosted-pilot-test',version:'1'});await client.connect(transport);return client;
}
const decoded=result=>JSON.parse(result.content[0].text);

test('actual HTTP SDK initializes and lists three read-only tools without catalog/AI access',async()=>{
  const fixture=await fixtureSetup();const before=fixture.bucket.reads;const client=await clientFor(fixture);
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(tool=>tool.name).sort(),['catalog_status','get_work','search_inspiration']);
  assert.ok(tools.tools.every(tool=>tool.annotations.readOnlyHint));assert.equal(fixture.bucket.reads,before);await client.close();
});
const fixtureSetup=fixture;

test('HTTP search, filters, details and restart-safe single-use principal-bound continuation',async()=>{
  const fixture=await fixtureSetup(),alice=await clientFor(fixture),bob=await clientFor(fixture,otherToken);
  const first=decoded(await alice.callTool({name:'search_inspiration',arguments:{query:'blue glass'}}));
  assert.equal(first.results.length,6);assert.equal(first.snapshot.live,true);assert.ok(first.next_cursor);
  const wrong=await alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor,query:'red'}});assert.match(decoded(wrong).error,/MISMATCH/);
  const forbidden=await bob.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}});assert.match(decoded(forbidden).error,/EXPIRED/);
  const replies=await Promise.all([alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}}),alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}})]);
  assert.equal(replies.filter(reply=>reply.isError).length,1);
  const next=decoded(replies.find(reply=>!reply.isError));assert.ok(next.results.every(row=>!first.results.some(before=>before.id===row.id)));
  const empty=decoded(await alice.callTool({name:'search_inspiration',arguments:{query:'blue glass',filters:{colors:['Red']}}}));assert.equal(empty.results.length,0);assert.equal(empty.insufficient_matches,true);
  const id=first.results[0].id,row=fixture.index.rows.find(row=>row.id===id),key=previewKey(row);
  const details=decoded(await alice.callTool({name:'get_work',arguments:{id,preview:'image'}}));assert.equal(details.creator,'Actual Creator');assert.match(details.preview.inline_status,/No prepared/);
  const get=fixture.bucket.get.bind(fixture.bucket),png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
  fixture.bucket.get=async name=>name===key?{size:png.length,arrayBuffer:async()=>png.buffer}:get(name);
  const illustrated=await alice.callTool({name:'get_work',arguments:{id,preview:'image'}});
  assert.equal(illustrated.content[1].type,'image');assert.equal(illustrated.content[1].mimeType,'image/png');
  fixture.bucket.get=async name=>name===key?{size:256001,arrayBuffer:async()=>{throw Error('Oversized file was read');}}:get(name);
  assert.equal((await alice.callTool({name:'get_work',arguments:{id,preview:'image'}})).content.length,1);
  const changed=previewKey({...row,media:[{url:'https://new-media.test/image.png'}]});assert.notEqual(changed,key);
  await alice.close();await bob.close();
});

test('catalog replacements invalidate continuation and remove old details; stale source fails closed',async()=>{
  const fixture=await fixtureSetup(),client=await clientFor(fixture);
  const first=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'blue glass'}}));
  fixture.input.catalog.rows=fixture.input.catalog.rows.filter(row=>row.id!==first.results[0].id);
  fixture.input.catalog.capturedAt=new Date().toISOString();
  const updated=await buildCatalog(fixture.input,{embed});await publishCatalog(fixture.bucket,updated);
  const reply=decoded(await client.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}}));assert.match(reply.error,/EXPIRED/);
  const details=decoded(await client.callTool({name:'get_work',arguments:{id:first.results[0].id}}));assert.match(details.error,/NOT_ELIGIBLE/);
  for(const [key,value] of fixture.bucket.values)if(key.endsWith('/current.json'))fixture.bucket.values.set(key,JSON.stringify({...JSON.parse(value),sourceCheckedAt:new Date(Date.now()-MAX_SOURCE_AGE_MS-1000).toISOString()}));
  const status=decoded(await client.callTool({name:'catalog_status',arguments:{}}));assert.match(status.error,/STALE/);await client.close();
});

test('access, configured origin, body bounds, revocation and errors protect backing services',async()=>{
  const fixture=await fixtureSetup(),worker=createWorker(),before=fixture.bucket.reads;
  const request=(url=origin+'/mcp',headers={},body='{}')=>new Request(url,{method:'POST',headers:{Authorization:'Bearer '+token,...headers},body});
  assert.equal((await worker.fetch(request(origin+'/mcp',{Authorization:'Bearer wrong'}),fixture.env)).status,401);
  assert.equal((await worker.fetch(request('https://evil.test/mcp'),fixture.env)).status,404);
  assert.equal((await worker.fetch(request(origin+'/mcp',{Origin:'https://evil.test'}),fixture.env)).status,403);
  assert.equal((await worker.fetch(request(origin+'/mcp',{},'x'.repeat(17000)),fixture.env)).status,413);
  assert.equal((await worker.fetch(request(origin+'/mcp',{},'bad json'),fixture.env)).status,400);
  fixture.env.MCP_PILOT_TOKENS='[]';assert.equal((await worker.fetch(request(),fixture.env)).status,401);assert.equal(fixture.bucket.reads,before);
});

test('per-principal limits refuse excessive requests independently of other users',async()=>{
  const fixture=await fixtureSetup();
  for(let i=0;i<30;i++)assert.notEqual((await fixture.fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'})).status,429);
  assert.equal((await fixture.fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'})).status,429);
  assert.notEqual((await fixture.fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+otherToken},body:'{}'})).status,429);
});
