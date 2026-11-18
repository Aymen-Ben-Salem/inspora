import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createWorker} from '../http.mjs';
import {buildCatalog,publishCatalog,MAX_SOURCE_AGE_MS} from '../catalog.mjs';
import {work,note,embed} from '../../test/fixtures.mjs';
import {sha} from '../../catalog.mjs';
import {Bucket,Namespace} from './helpers.mjs';
import {TEAM_HTTP_LIMITS,TOOL_LIMITS} from '../access-state.mjs';
import {previewKey} from '../previews.mjs';
import {mediaFingerprint} from '../../enrichment.mjs';
import {visualAssetKey,visualManifestKey,visualSha,VISUAL_RESPONSE_BYTES,VISUAL_BUDGET_STATUS} from '../../visuals.mjs';
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

test('actual HTTP SDK lists read-only tools without catalog/AI access',async()=>{
  const fixture=await fixtureSetup();const before=fixture.bucket.reads;const client=await clientFor(fixture);
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(tool=>tool.name).sort(),['catalog_status','get_work','get_works','search_inspiration']);
  assert.ok(tools.tools.every(tool=>tool.annotations.readOnlyHint));assert.equal(fixture.bucket.reads,before);await client.close();
});
const fixtureSetup=fixture;

test('HTTP serves bounded prepared stills and motion sheets for current eligible works',async()=>{
  const fixture=await fixtureSetup(),client=await clientFor(fixture);
  try {
    const rows=fixture.index.rows.slice(0,5),stored=new Map();
    const originalGet=fixture.bucket.get.bind(fixture.bucket);
    fixture.bucket.get=async key=>{
      const bytes=stored.get(key);
      return bytes?{size:bytes.length,arrayBuffer:async()=>bytes.buffer}:originalGet(key);
    };
    function seed(row,roles){
      const assets=roles.map(role=>{
        const bytes=new Uint8Array(230_000);bytes[0]=255;bytes[1]=216;
        const item={role,width:1234,height:1000,bytes:bytes.length,sha256:visualSha(bytes),timecodes:[1,2]};
        stored.set(visualAssetKey(row,item),bytes);
        return item;
      });
      stored.set(visualManifestKey(row),new TextEncoder().encode(JSON.stringify({
        version:1,workId:row.id,mediaFingerprint:mediaFingerprint(row),duration:5,assets,
      })));
    }
    for(const row of rows)seed(row,['still','overview']);
    const [first]=rows;
    const study=await client.callTool({name:'get_work',arguments:{id:first.id,detail:'study'}});
    // The JSON block stays first; each image follows a label naming its work, role and samples.
    assert.deepEqual(study.content.map(item=>item.type),['text','text','image','text','image']);
    assert.equal(study.content[4].mimeType,'image/jpeg');
    assert.equal(study.content[1].text,`Image 1 · ${first.title} by Actual Creator · ${first.id} · still · t=1s–2s (2 samples)`);
    assert.match(study.content[3].text,/^Image 2 · .* · overview · t=1s–2s \(2 samples\)$/);
    const {preview}=decoded(study);
    assert.equal(preview.duration_seconds,5);
    assert.deepEqual(preview.images.map(({role})=>role),['still','overview']);
    assert.deepEqual(preview.study,{available:true,sheets:1});
    seed(rows[1],['still']);
    const stillOnly=decoded(await client.callTool({name:'get_work',arguments:{id:rows[1].id,detail:'study'}}));
    assert.equal(stillOnly.preview.inline_status,'prepared_current_media');
    assert.equal(stillOnly.preview.study.available,false);assert.ok(stillOnly.preview.study.reason);
    assert.equal(stillOnly.preview.motion_sheets,0);
    seed(rows[1],['still','overview']);
    // A legacy thumbnail must not replace a valid pack that was only stopped by the budget.
    const png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);stored.set(previewKey(rows[2]),png);
    const batch=await client.callTool({name:'get_works',arguments:{ids:[...rows.map(r=>r.id),work(999).id]}});
    const works=decoded(batch).works;
    // The budget counts base64-encoded size: two 230 KB stills encode to ~613 KB, a third would exceed 900 KB.
    assert.deepEqual(works.map(w=>w.preview?.images?.[0].image_number??w.error??null),[1,2,null,null,null,'WORK_NOT_ELIGIBLE']);
    for(const omitted of works.slice(2,5))assert.deepEqual([omitted.preview.inline_status,omitted.preview.budget_reached,omitted.preview.omitted_roles],[VISUAL_BUDGET_STATUS,true,['still']]);
    // Glance still says whether a study is worthwhile, including for works stopped by the budget.
    assert.deepEqual(works.slice(0,5).map(w=>w.preview.motion_sheets),[1,1,1,1,1]);
    const images=batch.content.filter(item=>item.type==='image');
    assert.ok(images.every(item=>item.mimeType==='image/jpeg'));
    assert.ok(images.reduce((sum,item)=>sum+item.data.length,0)<=VISUAL_RESPONSE_BYTES);
    assert.ok(JSON.stringify(batch).length<1_000_000);
    // get_works accepts detail=study; the shared budget flags partial and omitted sheet sets.
    const studies=decoded(await client.callTool({name:'get_works',arguments:{ids:[rows[0].id,rows[4].id],detail:'study'}})).works;
    assert.deepEqual(studies[0].preview.study,{available:true,sheets:1});
    assert.deepEqual(studies[1].preview.study,{available:false,reason:VISUAL_BUDGET_STATUS,omitted_roles:['still','overview']});
    seed(rows[4],['still','overview','detail-1','detail-2']);
    const partial=decoded(await client.callTool({name:'get_work',arguments:{id:rows[4].id,detail:'study'}})).preview;
    assert.deepEqual(partial.images.map(image=>image.role),['still','overview']);
    assert.deepEqual(partial.study,{available:true,sheets:1,partial:true,omitted_roles:['detail-1','detail-2'],reason:'Image response budget reached; request this work alone for the remaining sheets.'});
    const textOnly=decoded(await client.callTool({name:'get_work',arguments:{id:first.id,detail:'study',preview:'none'}}));
    assert.equal(textOnly.preview,undefined);assert.equal(textOnly.study.available,false);assert.match(textOnly.study.reason,/preview=image/);
    const links=await client.callTool({name:'get_work',arguments:{id:first.id,preview:'link'}});
    assert.equal(links.content.length,1);
    stored.set(visualManifestKey(first),stored.get(visualManifestKey(rows[1])));
    const stale=await client.callTool({name:'get_work',arguments:{id:first.id}});
    assert.equal(stale.content.length,1);
  }finally{await client.close();}
});

test('HTTP search, filters, details and restart-safe re-readable principal-bound continuation',async()=>{
  const fixture=await fixtureSetup(),alice=await clientFor(fixture),bob=await clientFor(fixture,otherToken);
  const first=decoded(await alice.callTool({name:'search_inspiration',arguments:{query:'blue glass'}}));
  assert.equal(first.results.length,10);assert.equal(first.snapshot.live,true);assert.ok(first.next_cursor);
  const status=decoded(await alice.callTool({name:'catalog_status',arguments:{}}));
  assert.equal(status.limits.default_count,first.results.length);
  assert.equal(status.limits.cursor_minutes,15);assert.equal(status.limits.cursor_single_use,false);assert.equal(status.catalog_state,'ready');
  assert.equal(first.search_coverage.catalog_works,18);assert.equal(first.search_coverage.matching_works,18);
  const wrong=await alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor,query:'red'}});assert.match(decoded(wrong).error,/MISMATCH/);
  for(const changed of [{subjects:['poster']},{subject_scope:'contains'},{context:'fitness'}]){
    const mismatch=await alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor,...changed}});
    assert.match(decoded(mismatch).error,/MISMATCH/);
  }
  const forbidden=await bob.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}});assert.match(decoded(forbidden).error,/^CURSOR_EXPIRED: .*Rerun the original search/);
  // Deliberate change from single-use: re-reading a cursor within its TTL returns the same page and next cursor.
  const replies=await Promise.all([alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}}),alice.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}})]);
  assert.ok(replies.every(reply=>!reply.isError));
  assert.deepEqual(decoded(replies[0]),decoded(replies[1]));
  const next=decoded(replies[0]);assert.ok(next.results.every(row=>!first.results.some(before=>before.id===row.id)));
  assert.equal(next.next_cursor,null);assert.equal(next.exhausted,true);
  assert.deepEqual(next.search_coverage,first.search_coverage);
  const empty=decoded(await alice.callTool({name:'search_inspiration',arguments:{query:'blue glass',filters:{colors:['Red']}}}));assert.equal(empty.results.length,0);assert.equal(empty.insufficient_matches,true);
  const id=first.results[0].id,row=fixture.index.rows.find(row=>row.id===id),key=previewKey(row);
  const details=decoded(await alice.callTool({name:'get_work',arguments:{id,preview:'image'}}));assert.equal(details.creator,'Actual Creator');assert.match(details.preview.inline_status,/No prepared/);
  const get=fixture.bucket.get.bind(fixture.bucket),png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
  fixture.bucket.get=async name=>name===key?{size:png.length,arrayBuffer:async()=>png.buffer}:get(name);
  const illustrated=await alice.callTool({name:'get_work',arguments:{id,preview:'image'}});
  assert.match(illustrated.content[1].text,/^Image 1 · .* · legacy_thumbnail$/);
  assert.equal(illustrated.content[2].type,'image');assert.equal(illustrated.content[2].mimeType,'image/png');
  const legacy=decoded(illustrated).preview;
  assert.equal(legacy.inline_status,'legacy_low_resolution_thumbnail');assert.match(legacy.inline_note,/legacy thumbnail/);
  assert.equal(legacy.images[0].role,'legacy_thumbnail');assert.equal(legacy.motion_sheets,undefined,'no prepared pack: the status explains');
  assert.equal(details.preview.motion_sheets,undefined);
  const legacyStudy=decoded(await alice.callTool({name:'get_work',arguments:{id,detail:'study'}})).preview.study;
  assert.equal(legacyStudy.available,false);assert.match(legacyStudy.reason,/legacy thumbnail|no motion/i);
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
  // Status still answers and reports the stale state; search and details fail closed with a next step.
  const status=await client.callTool({name:'catalog_status',arguments:{}});
  assert.equal(status.isError,undefined);assert.equal(decoded(status).catalog_state,'stale');assert.equal(decoded(status).live,false);
  const search=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'blue glass'}}));assert.match(search.error,/^CATALOG_STALE: .*Retry later/);
  assert.match(decoded(await client.callTool({name:'get_work',arguments:{id:first.results[1].id}})).error,/^CATALOG_STALE/);
  await client.close();
});

test('HTTP accepts arbitrary subjects and rejects continuation from a previous ranking release',async()=>{
  const fixture=await fixtureSetup(),client=await clientFor(fixture);
  const first=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'blue glass',subjects:['panel'],kinds:['design']}}));
  assert.equal(first.results.length,10);
  assert.deepEqual(first.interpreted_query.subjects,['panel']);
  const storage=fixture.env.ACCESS_STATE.objects.get('alice').state.storage;
  const key='cursor:'+first.next_cursor,value=await storage.get(key);
  delete value.searchRevision;
  await storage.put(key,value);
  const reply=decoded(await client.callTool({name:'search_inspiration',arguments:{cursor:first.next_cursor}}));
  assert.match(reply.error,/CURSOR_EXPIRED/);
  await client.close();
});

test('HTTP refinement preserves the artifact, ranks dense layouts last with a label and reports an honest shortage',async()=>{
  const fixture=await fixtureSetup();
  const rows=[
    {...work(1),title:'Finance dashboard',description:'A dense finance dashboard packs charts into a crowded interface.'},
    {...work(2),title:'Finance overview',description:'A simple finance dashboard uses large text and a spacious layout.'},
    {...work(3),title:'Glossy orb animation',description:'A simple orb has generous whitespace.'},
  ];
  const index=await buildCatalog({version:1,catalog:{capturedAt:new Date().toISOString(),rows},enrichment:{version:1,entries:[]}},{embed});
  await publishCatalog(fixture.bucket,index);
  const client=await clientFor(fixture);
  try {
    const original=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'clean finance dashboard designs'}}));
    assert.equal(original.results.length,2);
    const refined=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'simpler finance dashboard designs for a small laptop screen',exclude_ids:[rows[1].id]}}));
    assert.equal(refined.snapshot.live,true);
    assert.deepEqual(refined.interpreted_query.subjects,['dashboard']);
    // Search revision 10: a free-text density cue ranks instead of filtering. The dense work
    // stays, last and labeled, and the derived constraint is reported.
    assert.equal(refined.interpreted_query.derived_constraints.density,'low');
    assert.ok(!refined.interpreted_query.derived_constraints.enforced?.includes('density'));
    assert.equal(refined.results.at(-1).id,rows[0].id);
    assert.ok(!refined.results.some(result=>result.id===rows[1].id));
    assert.match(refined.results.at(-1).reason,/dens/i);
    assert.notEqual(refined.results.at(-1).match,'candidate');
    assert.equal(refined.insufficient_matches,true);
    assert.equal(refined.next_cursor,null);
    assert.equal(original.results[0].evidence.description,rows.find(row=>row.id===original.results[0].id).description);
  } finally { await client.close(); }
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

test('per-principal HTTP ceiling refuses excessive non-tool requests independently of other users',async()=>{
  const fixture=await fixtureSetup();
  for(let i=0;i<TEAM_HTTP_LIMITS.minute;i++)assert.notEqual((await fixture.fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'})).status,429);
  const limited=await fixture.fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'});
  assert.equal(limited.status,429);
  const {retry_after,limit_window,error}=await limited.json();
  assert.ok(retry_after>=1&&retry_after<=60);assert.equal(limit_window,'minute');assert.match(error,/^RATE_LIMITED: retry after \d+ seconds/);
  assert.equal(limited.headers.get('retry-after'),String(retry_after));
  assert.notEqual((await fixture.fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+otherToken},body:'{}'})).status,429);
  // A tools/call over the ceiling is still a readable MCP tool result, not a bare HTTP 429.
  const call=await fixture.fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'catalog_status',arguments:{}}})});
  assert.equal(call.status,200);const rpc=await call.json();
  assert.equal(rpc.id,7);assert.equal(rpc.result.isError,true);assert.equal(JSON.parse(rpc.result.content[0].text).limit_window,'minute');
});

test('the per-person tool budget ignores protocol traffic and refuses with a readable tool result',async()=>{
  const fixture=await fixtureSetup(),client=await clientFor(fixture);
  try{
    for(let i=0;i<5;i++)await client.listTools();
    for(let i=0;i<TOOL_LIMITS.minute;i++){const reply=await client.callTool({name:'catalog_status',arguments:{}});assert.equal(reply.isError,undefined,'call '+(i+1));}
    const refused=await client.callTool({name:'catalog_status',arguments:{}});
    assert.equal(refused.isError,true);
    const body=decoded(refused);
    assert.match(body.error,/^TOOL_LIMIT_REACHED: retry after \d+ seconds\. The per-person minute limit of 30 tool calls/);
    assert.equal(body.limit_window,'minute');assert.ok(body.retry_after>=1&&body.retry_after<=60);
    await client.listTools();
  }finally{await client.close();}
});

test('HTTP category aliases and plural exclusions preserve hard filters',async()=>{
  const fixture=await fixtureSetup(),client=await clientFor(fixture);
  const one=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'blue glass',filters:{category:['Product']}}}));
  const many=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'blue glass',filters:{categories:['Product']}}}));
  assert.deepEqual(one.results.map(r=>r.id),many.results.map(r=>r.id));assert.ok(one.results.length);
  const excluded=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'blue glass',exclude_terms:['panel']}}));
  assert.equal(excluded.results.length,0);assert.equal(excluded.insufficient_matches,true);await client.close();
});

test('HTTP preserves query-repair errors and accepts the translated retry and ordinary typos',async()=>{
  const fixture=await fixtureSetup();let embeddingCalls=0;
  fixture.env.AI.run=async(_model,args)=>{embeddingCalls++;return {data:await embed(args.text)};};
  const client=await clientFor(fixture);
  try {
    const untranslated=await client.callTool({name:'search_inspiration',arguments:{query:'boutons en verre bleu'}});
    assert.equal(untranslated.isError,true);assert.match(decoded(untranslated).error,/^QUERY_REWRITE_REQUIRED:/);
    assert.equal(embeddingCalls,0);
    const translated=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'blue glass',count:2}}));
    assert.equal(translated.results.length,2);
    const typo=decoded(await client.callTool({name:'search_inspiration',arguments:{query:'blue glsas',count:2}}));
    assert.deepEqual(new Set(typo.results.map(r=>r.id)),new Set(translated.results.map(r=>r.id)));
    assert.ok(typo.interpreted_query.corrections.some(c=>c.from==='glsas'&&c.to==='glass'));
    for(const args of [{query:'Find landing page designs',kinds:['website']},{query:'landing page',kinds:['website'],subjects:['website landing page']}]){
      const result=decoded(await client.callTool({name:'search_inspiration',arguments:args}));
      assert.ok(result.results.length);assert.ok(result.results.every(r=>r.kind==='website'));
    }
  } finally { await client.close(); }
});
